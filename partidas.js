/* Partidas: torneio (com taxa de entrada e prêmio) e convite entre amigos. Tudo é decidido pelo servidor; aqui só há menus e exibição.
   Durante uma partida o jogo usa um estado SEPARADO da carreira (mesma nave, saldo escolhido pela sala). */
const DURACOES = [10, 15, 20, 30, 45, 60], TAXAS = [500, 1000, 2500, 5000, 10000], DIFIC = { facil:'Fácil', normal:'Normal', dificil:'Difícil' };
let FORM = null, joinMsg = '', ficouCarreira = '', visto = '';
try { visto = localStorage.getItem('astromercante_res') || ''; } catch {}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const galLiberada = g => S.rank >= GALAXIES[g].t && S.engLv >= GALAXIES[g].eng;
const noAr = () => PT && PT.estado === 'andamento';

async function partidaPoll(force) {
  if (!TOK || !CLOUD() || busy || pulling || (document.hidden && !force)) return; pulling = true;
  try { aplicarPartida(await api('/partida')); }
  catch (e) { if (e.status === 401) { clearSession(); applyGate(); renderAccount(); openAuth('in', 'Sua sessão expirou. Entre novamente.'); } }
  pulling = false;
}
function aplicarPartida(r) {
  if (r.agora) SKEW = r.agora - Date.now();
  const antes = PT && PT.estado, cod0 = PT && PT.codigo;
  PT = r.nenhuma ? null : r;
  if (PT && (PT.estado === 'fim' || PT.estado === 'cancelada')) {
    if (PT.codigo !== visto) { visto = PT.codigo; try { localStorage.setItem('astromercante_res', visto); } catch {} mostrarResultado(PT); }
    if (MODE === 'partida') voltarCarreira();
    ficouCarreira = '';
  } else if (!PT && MODE === 'partida') voltarCarreira();
  else if (noAr()) {
    if (MODE === 'partida' && r.estado_jogo) aplicarEstado(r);
    else if (MODE !== 'partida' && ficouCarreira !== PT.codigo && (cod0 !== PT.codigo || antes === 'espera' || antes == null)) entrarModoPartida();
  }
  renderPlay(); renderMatchBar(); if (MODE === 'partida') renderPlacar();
}
async function entrarModoPartida() {
  if (!noAr()) return;
  const r = await api('/partida?v=0').catch(() => null); if (!r || r.estado !== 'andamento') return;
  MODE = 'partida'; PT = r; firstState = true; clearTimeout(tripT); document.body.classList.add('inmatch');
  $('#board-h').textContent = 'Placar da partida'; $('#mis-h').hidden = $('#mis').hidden = true;
  aplicarEstado(r); document.querySelector('.nav [data-view=market]').click(); say(`Partida ${r.modo === 'torneio' ? 'de torneio' : 'entre amigos'} iniciada! Vença com o maior patrimônio.`, 'win');
  renderPlay(); renderMatchBar(); renderPlacar();
}
function voltarCarreira(manual) {
  if (manual && noAr()) ficouCarreira = PT.codigo;
  MODE = 'carreira'; firstState = true; document.body.classList.remove('inmatch');
  $('#board-h').textContent = 'Ranking global'; $('#mis-h').hidden = $('#mis').hidden = false; S.partida = undefined;
  refrescar(true); if (typeof renderMeta === 'function') renderMeta(); renderPlay(); renderMatchBar();
}
function renderPlacar() {
  if (!PT || !PT.placar) { $('#board').innerHTML = '<li class="empty">Carregando placar…</li>'; return; }
  $('#board').innerHTML = PT.placar.map((r, i) => `<li class="${r.eu ? 'me' : ''}"><span><i class="pos">${i + 1}</i> ${esc(r.n)}${r.bot ? ' <small>bot</small>' : ''}</span><b class="mono">${fmt(r.w)}</b></li>`).join('');
}
function renderMatchBar() {
  const b = $('#matchbar'); if (!noAr()) { b.hidden = true; return; } b.hidden = false;
  const pos = PT.placar ? PT.placar.findIndex(x => x.eu) + 1 : 0, total = PT.placar ? PT.placar.length : 0;
  b.innerHTML = `<span><b>${PT.modo === 'torneio' ? '🏆 TORNEIO' : '🤝 AMIGOS'}</b> · sala ${PT.codigo}</span><span class="mono" id="mb-t">${mmss(PT.fim - NOW())}</span><span>${pos ? pos + 'º de ' + total : ''}</span>`
    + (MODE === 'partida' ? '<button type="button" id="mb-go">Ir à carreira</button>' : '<button type="button" id="mb-go" class="buy">Voltar à partida</button>');
  $('#mb-go').onclick = () => MODE === 'partida' ? voltarCarreira(true) : (ficouCarreira = '', entrarModoPartida());
}
setInterval(() => {
  if (noAr()) { const t = $('#mb-t'); if (t) t.textContent = mmss(PT.fim - NOW()); if (NOW() >= PT.fim + 800 && !pulling) partidaPoll(true); }
  if (PT && PT.estado === 'andamento' && $('#play-t')) $('#play-t').textContent = mmss(PT.fim - NOW());
}, 1000);
setInterval(() => { if (TOK && CLOUD() && PT && PT.estado === 'espera' && !document.hidden) partidaPoll(true); }, 5000);
setInterval(() => { if (TOK && CLOUD() && MODE !== 'partida' && noAr() && !document.hidden) partidaPoll(true); }, 30000);

/* ---------- menu ---------- */
const resumo = c => `${c.duracao} min · saldo ${fmt(c.saldo).replace(',00', '')} Cr · ${c.galaxias.map(i => GALAXIES[i].nome).join(', ')}`
  + ` · ${c.jogadores} jogadores${c.bots ? ' (bots completam, ' + DIFIC[c.dific] + ')' : ''}${c.eventos ? '' : ' · sem eventos'}${c.piratas ? '' : ' · sem piratas'}`;
function renderPlay() {
  const el = $('#play'); if (!el) return;
  const digitado = $('#join-cod') ? $('#join-cod').value : null, tinhaFoco = document.activeElement && document.activeElement.id === 'join-cod';   // a atualização da tela não pode apagar o que a pessoa está digitando
  if (!CLOUD()) { el.innerHTML = '<p class="empty">As partidas precisam do servidor do jogo (modo online).</p>'; return; }
  if (!TOK) { el.innerHTML = '<p class="empty">Entre na sua conta para jogar torneios e salas de amigos.</p>'; return; }
  if (PT && PT.estado === 'espera') { el.innerHTML = lobbyHtml(); return; }
  if (noAr()) { el.innerHTML = emAndamentoHtml(); return; }
  if (FORM) { el.innerHTML = formHtml(); return; }
  const um = location.search.match(/[?&]sala=([A-Za-z0-9]{6})/), pre = um ? um[1].toUpperCase() : '';
  el.innerHTML = `<div class="pcards">
    <div class="pcard"><h3>🚀 Carreira</h3><p>Seu progresso de sempre: ranking global, missões e patentes.</p><button type="button" data-p="carreira">Continuar</button></div>
    <div class="pcard"><h3>🏆 Torneio</h3><p>Até 8 pilotos pagam uma taxa de entrada; os melhores levam o prêmio. Bots completam a sala.</p><button type="button" class="buy" data-p="novo-torneio">Criar torneio</button></div>
    <div class="pcard"><h3>🤝 Entre amigos</h3><p>Sala livre, sem taxa: escolha tempo, galáxias e regras e convide por código.</p><button type="button" class="buy" data-p="novo-amigos">Criar sala</button></div>
  </div>
  <form class="prow" id="join"><label>Tem um código? <input id="join-cod" maxlength="6" autocomplete="off" placeholder="ABC123" value="${pre}"></label><button class="buy" type="submit">Entrar na sala</button></form>
  <p class="err" id="join-err">${esc(joinMsg)}</p>
  <p class="empty">Você só joga em galáxias que já desbloqueou. A partida usa sua nave atual (porão, motor e armamento), mas é um jogo à parte: seus créditos e itens da carreira não mudam, exceto a taxa e o prêmio do torneio.</p>`;

  if (digitado) { $('#join-cod').value = digitado; if (tinhaFoco) $('#join-cod').focus(); }}
function formHtml() {
  const f = FORM, t = f.modo === 'torneio';
  return `<h3>${t ? '🏆 Novo torneio' : '🤝 Nova sala entre amigos'}</h3>
  <label class="prow">Duração <select data-f="duracao">${DURACOES.map(d => `<option value="${d}" ${d === f.duracao ? 'selected' : ''}>${d} min</option>`).join('')}</select></label>
  <label class="prow">Saldo inicial <b class="mono" id="f-saldo">${fmt(f.saldo).replace(',00', '')} Cr</b></label>
  <input type="range" min="2000" max="10000" step="500" value="${f.saldo}" data-f="saldo" class="prange">
  <div class="prow"><span>Galáxias</span></div>
  <div class="pgals">${GALAXIES.map((g, i) => { const ok = galLiberada(i); return `<label class="${ok ? '' : 'lock'}"><input type="checkbox" data-gal="${i}" ${f.galaxias.includes(i) ? 'checked' : ''} ${ok ? '' : 'disabled'}> ${g.nome}${ok ? '' : ' 🔒'}</label>`; }).join('')}</div>
  <label class="prow">Jogadores (2 a 8) <select data-f="jogadores">${[2, 3, 4, 5, 6, 7, 8].map(n => `<option ${n === f.jogadores ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
  <label class="prow">Completar vagas com bots <input type="checkbox" data-f="bots" ${f.bots ? 'checked' : ''}></label>
  ${f.bots ? `<label class="prow">Dificuldade dos bots <select data-f="dific">${Object.entries(DIFIC).map(([k, v]) => `<option value="${k}" ${k === f.dific ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
  <label class="prow">Eventos de mercado <input type="checkbox" data-f="eventos" ${f.eventos ? 'checked' : ''}></label>
  <label class="prow">Piratas e monstros <input type="checkbox" data-f="piratas" ${f.piratas ? 'checked' : ''}></label>
  ${t ? `<label class="prow">Taxa de entrada <select data-f="taxa">${TAXAS.map(x => `<option value="${x}" ${x === f.taxa ? 'selected' : ''}>${fmt(x).replace(',00', '')} Cr</option>`).join('')}</select></label>
  <p class="empty">A taxa sai dos seus créditos da carreira. Com 3 ou mais pilotos, o bolo (soma das taxas) paga 60% / 30% / 10% ao 1º, 2º e 3º; com 2, o vencedor leva tudo. Sozinho contra bots, você recupera a taxa se terminar na metade de cima e ganha um bônus se vencer (nos bots Normal e Difícil).</p>` : ''}
  <p class="err" id="f-err"></p>
  <div class="prow"><button type="button" id="f-x">Voltar</button><button type="button" class="buy" id="f-ok">Criar sala${t ? ' e pagar taxa' : ''}</button></div>`;
}
function lobbyHtml() {
  const c = PT.cfg, link = location.origin + location.pathname + '?sala=' + PT.codigo, hum = PT.jogadores.length;
  return `<h3>${PT.modo === 'torneio' ? '🏆 Torneio' : '🤝 Sala entre amigos'} · aguardando</h3>
  <div class="pcode"><small>Código da sala</small><b class="mono">${PT.codigo}</b><button type="button" id="l-cp">Copiar convite</button></div>
  <p class="empty">${esc(resumo(c))}${PT.modo === 'torneio' ? ` · taxa ${fmt(c.taxa).replace(',00', '')} Cr` : ''}</p>
  <ul class="board">${PT.jogadores.map(j => `<li class="${j.eu ? 'me' : ''}"><span>${esc(j.n)}${j.host ? ' 👑' : ''}</span></li>`).join('')}<li class="tot"><span>${hum} de ${c.jogadores} vagas${c.bots ? ` · ${c.jogadores - hum} bot(s) entram ao iniciar` : ''}</span></li></ul>
  <p class="err" id="l-err"></p>
  <div class="prow">${PT.host ? '<button type="button" class="buy" id="l-go">Iniciar partida</button>' : '<span class="empty">Aguardando o criador iniciar…</span>'}<button type="button" class="danger" id="l-x">${PT.host ? 'Cancelar sala' : 'Sair da sala'}</button></div>`;
}
function emAndamentoHtml() {
  const pos = PT.placar ? PT.placar.findIndex(x => x.eu) + 1 : 0;
  return `<h3>${PT.modo === 'torneio' ? '🏆 Torneio' : '🤝 Partida'} em andamento</h3>
  <p class="pbig mono" id="play-t">${mmss(PT.fim - NOW())}</p><p class="empty">${esc(resumo(PT.cfg))}</p>
  ${pos ? `<p>Sua posição: <b>${pos}º</b> de ${PT.placar.length}</p>` : ''}
  <div class="prow">${MODE === 'partida' ? '<button type="button" class="buy" data-p="jogar">Voltar ao mercado</button>' : '<button type="button" class="buy" data-p="entrar">Voltar à partida</button>'}</div>`;
}
function mostrarResultado(p) {
  const box = $('#res-box');
  if (p.estado === 'cancelada') box.innerHTML = '<h2>Sala cancelada</h2><p class="empty">A sala não começou a tempo. As taxas foram devolvidas.</p><button class="buy" id="res-x">Fechar</button>';
  else {
    const eu = (p.resultado || []).find(r => r.eu), t = p.modo === 'torneio';
    box.innerHTML = `<h2>${eu && eu.pos === 1 ? '🏆 Você venceu!' : 'Fim da partida'}</h2><ol class="board">${(p.resultado || []).map(r => `<li class="${r.eu ? 'me' : ''}"><span><i class="pos">${r.pos}</i> ${esc(r.n)}${r.bot ? ' <small>bot</small>' : ''}${r.premio ? ` <small>+${fmt(r.premio).replace(',00', '')} Cr</small>` : ''}</span><b class="mono">${fmt(r.w)}</b></li>`).join('')}</ol>`
      + (t && eu ? `<p class="empty">${eu.premio ? `Prêmio de ${fmt(eu.premio).replace(',00', '')} Cr creditado na sua carreira.` : 'Sem prêmio desta vez.'}</p>` : '') + '<button class="buy" id="res-x">Fechar</button>';
  }
  $('#res').hidden = false; $('#res-x').onclick = () => { $('#res').hidden = true; };
}
async function pedir(btn, caminho, corpo, errId) {
  btn.disabled = true;
  try { aplicarPartida(await api(caminho, 'POST', corpo)); return true; }
  catch (e) { const el = $(errId); if (el) el.textContent = e.message; else say(e.message, 'err'); return false; }
  finally { btn.disabled = false; }
}
$('#play').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.p === 'carreira') return document.querySelector('.nav [data-view=market]').click();
  if (b.dataset.p === 'jogar') return document.querySelector('.nav [data-view=market]').click();
  if (b.dataset.p === 'entrar') { ficouCarreira = ''; return entrarModoPartida(); }
  if (b.dataset.p === 'novo-torneio' || b.dataset.p === 'novo-amigos') {
    const g0 = GALAXIES.findIndex((_, i) => galLiberada(i));
    FORM = { modo:b.dataset.p === 'novo-torneio' ? 'torneio' : 'amigos', duracao:15, saldo:5000, galaxias:[Math.max(0, g0)], jogadores:b.dataset.p === 'novo-torneio' ? 4 : 2, bots:b.dataset.p === 'novo-torneio', dific:'normal', eventos:true, piratas:true, taxa:1000 };
    return renderPlay();
  }
  if (b.id === 'f-x') { FORM = null; return renderPlay(); }
  if (b.id === 'f-ok') {
    const f = FORM, cfg = { duracao:f.duracao, saldo:f.saldo, galaxias:f.galaxias, jogadores:f.jogadores, bots:f.bots, dific:f.dific, eventos:f.eventos, piratas:f.piratas, taxa:f.taxa };
    if (await pedir(b, '/partida/criar', { modo:f.modo, cfg }, '#f-err')) { FORM = null; refrescar(true); renderPlay(); } return;
  }
  if (b.id === 'l-go') return void (await pedir(b, '/partida/iniciar', {}, '#l-err'));
  if (b.id === 'l-x') { if (PT.host && !confirm('Cancelar a sala? As taxas pagas serão devolvidas.')) return; if (await pedir(b, '/partida/sair', {}, '#l-err')) refrescar(true); return; }
  if (b.id === 'l-cp') {
    const link = location.origin + location.pathname + '?sala=' + PT.codigo, txt = `Venha jogar Astromercante comigo! Código da sala: ${PT.codigo}\n${link}`;
    try { if (navigator.share) await navigator.share({ text:txt }); else { await navigator.clipboard.writeText(txt); b.textContent = 'Copiado!'; } } catch {}
  }
});
$('#play').addEventListener('input', e => {
  const t = e.target; if (!FORM) return;
  if (t.dataset.f === 'saldo') { FORM.saldo = +t.value; $('#f-saldo').textContent = fmt(FORM.saldo).replace(',00', '') + ' Cr'; }
});
$('#play').addEventListener('change', e => {
  const t = e.target; if (!FORM) return;
  if (t.dataset.gal != null) { const i = +t.dataset.gal; FORM.galaxias = t.checked ? [...new Set([...FORM.galaxias, i])].sort((a, b) => a - b) : FORM.galaxias.filter(x => x !== i); return; }
  const k = t.dataset.f; if (!k) return;
  FORM[k] = t.type === 'checkbox' ? t.checked : (['duracao', 'jogadores', 'taxa'].includes(k) ? +t.value : t.value);
  if (k === 'bots') renderPlay();
});
$('#play').addEventListener('submit', async e => {
  if (e.target.id !== 'join') return; e.preventDefault();
  const cod = $('#join-cod').value.trim(), b = e.target.querySelector('button');
  if (cod.length !== 6) { joinMsg = 'O código tem 6 caracteres.'; $('#join-err').textContent = joinMsg; return; }
  joinMsg = ''; if (await pedir(b, '/partida/entrar', { codigo:cod }, '#join-err')) { try { history.replaceState(null, '', location.pathname); } catch {} }
});
document.querySelector('.nav [data-view=play]').addEventListener('click', () => { renderPlay(); partidaPoll(true); });
$('#res').onclick = e => { if (e.target.id === 'res') $('#res').hidden = true; };
{ const boot = setInterval(() => { if (!CLOUD() || !TOK) { clearInterval(boot); renderPlay(); return; } if (READY) { clearInterval(boot); partidaPoll(true).then(() => { renderPlay(); if (/[?&]sala=/.test(location.search) && !PT) document.querySelector('.nav [data-view=play]').click(); }); } }, 300); }
renderPlay();
