/* Arena: duelo X1, torneio (com taxa de entrada e prêmio) e convite entre amigos. Tudo é decidido pelo servidor; aqui só há menus e exibição.
   Durante uma partida o jogo usa um estado SEPARADO da carreira (mesma nave, saldo escolhido pela sala). */
const DURACOES = [10, 15, 20, 30, 45, 60], TAXAS = [500, 1000, 2500, 5000, 10000], DIFIC = { facil:'Fácil', normal:'Normal', dificil:'Difícil' };
let FORM = null, duelMsg = '', joinMsg = '', ficouCarreira = '', visto = '';
try { visto = localStorage.getItem('astromercante_res') || ''; } catch {}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const galLiberada = g => S.rank >= GALAXIES[g].t && S.engLv >= GALAXIES[g].eng;
const APOSTAS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000], duelo = () => PT && PT.modo === 'duelo', nomeModo = m => m === 'duelo' ? '⚔️ DUELO X1' : m === 'torneio' ? '🏆 TORNEIO' : '🤝 AMIGOS';
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
  if ((antes === 'espera' || antes === 'andamento') !== (PT && (PT.estado === 'espera' || PT.estado === 'andamento')) && typeof renderContratos === 'function') setTimeout(renderContratos, 0);   // libera/bloqueia o botão de contrato
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
  document.body.classList.add('loading');   // esqueleto até o estado da partida chegar
  const r = await api('/partida?v=0').catch(() => null); if (!r || r.estado !== 'andamento') { document.body.classList.remove('loading'); return; }
  MODE = 'partida'; PT = r; firstState = true; clearTimeout(tripT); document.body.classList.add('inmatch');
  $('#board-h').textContent = 'Placar da partida'; $('#mis-h').hidden = $('#mis').hidden = true;
  aplicarEstado(r); document.querySelector('.nav [data-view=market]').click(); say(r.modo === 'duelo' ? `Duelo X1 contra ${r.rival ? r.rival.n : 'o rival'} iniciado! Maior patrimônio em 5 min leva o bolo. Você pode atacar a carga dele!` : `Partida ${r.modo === 'torneio' ? 'de torneio' : 'entre amigos'} iniciada! Vença com o maior patrimônio.`, 'win');
  renderPlay(); renderMatchBar(); renderPlacar();
}
function voltarCarreira(manual) {
  if (manual && noAr()) ficouCarreira = PT.codigo;
  MODE = 'carreira'; firstState = true; document.body.classList.remove('inmatch'); document.body.classList.add('loading');
  $('#board-h').textContent = 'Ranking global'; $('#mis-h').hidden = $('#mis').hidden = false; S.partida = undefined;
  refrescar(true); if (typeof renderMeta === 'function') renderMeta(); renderPlay(); renderMatchBar();
}
function renderPlacar() {
  if (!PT || !PT.placar) { $('#board').innerHTML = '<li class="empty">Carregando placar…</li>'; return; }
  $('#board').innerHTML = PT.placar.map((r, i) => `<li class="${r.eu ? 'me' : ''}${r.i ? ' pj-link' : ''}"${r.i ? ` data-pj="${r.i}" role="button" tabindex="0"` : ''}><span><i class="pos">${i + 1}</i> ${esc(r.n)}${r.bot ? ' <small>bot</small>' : ''}</span><b class="mono">${fmt(r.w)}</b></li>`).join('');
}
const stakeTxt = () => PT && PT.cfg && PT.cfg.taxa ? ` e ${PT.modo === 'duelo' ? 'a aposta' : 'a taxa de entrada'} de ${fmt(PT.cfg.taxa).replace(',00', '')} Cr` : '';
async function abandonar(btn) {
  if (!noAr()) return;
  if (!confirm(`Abandonar a partida? Você PERDE a partida${stakeTxt()} e não poderá voltar. Essa ação não pode ser desfeita.`)) return;
  btn.disabled = true;
  try { const r = await api('/partida/abandonar', 'POST', {}); aplicarPartida(r); if (r.nenhuma) say('Você abandonou a partida e perdeu.', 'err'); refrescar(true); }
  catch (e) { say(e.message, 'err'); } finally { btn.disabled = false; }
}
function renderMatchBar() {
  const b = $('#matchbar'); if (!noAr()) { b.hidden = true; b.dataset.h = ''; return; } b.hidden = false;
  const pos = PT.placar ? PT.placar.findIndex(x => x.eu) + 1 : 0, total = PT.placar ? PT.placar.length : 0;
  let h;
  if (duelo()) {
    const di = MODE === 'partida' ? duelInfo() : null, R = PT.rival;
    h = `<span><b>${nomeModo('duelo')}</b> · ${fmt(PT.cfg.taxa).replace(',00', '')} Cr</span><span class="mono" id="mb-t">${mmss(PT.fim - NOW())}</span>`
      + (R ? `<span>vs <b>${esc(R.n)}</b> · casco ${Math.round(R.hull)}% · carga ${R.carga}${R.gal === S.gal && di ? ' · ' + Math.round(di.d) + '/70' : R.gal !== S.gal ? ' · outra galáxia' : ''}${R.on === false ? ' · <i>offline</i>' : ''}</span>` : '<span>rival…</span>')
      + `<button type="button" id="mb-quit" title="Abandonar a partida">🏳 Abandonar</button>` + (MODE === 'partida' ? `<button type="button" id="mb-atk" class="${di && di.alvo ? 'danger' : ''}" ${di && di.alvo ? '' : 'disabled'}>⚔ ${di ? (di.bloq || 'Atacar!') : 'Sem alvo'}</button>` : '<button type="button" id="mb-go" class="buy">Voltar ao duelo</button>');
  } else h = `<span><b>${nomeModo(PT.modo)}</b> · sala ${PT.codigo}</span><span class="mono" id="mb-t">${mmss(PT.fim - NOW())}</span><span>${pos ? pos + 'º de ' + total : ''}</span>`
    + '<button type="button" id="mb-quit" title="Abandonar a partida">🏳 Abandonar</button>' + (MODE === 'partida' ? '<button type="button" id="mb-go">Ir à carreira</button>' : '<button type="button" id="mb-go" class="buy">Voltar à partida</button>');
  if (b.dataset.h === h) return; b.dataset.h = h; b.innerHTML = h;
}
$('#matchbar').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.id === 'mb-quit') return abandonar(b);
  if (b.id === 'mb-atk') { b.disabled = true; await act('atacar'); partidaPoll(true); return; }
  if (b.id === 'mb-go') return MODE === 'partida' ? voltarCarreira(true) : (ficouCarreira = '', entrarModoPartida());
});
setInterval(() => {
  if (noAr()) { if (duelo() && MODE === 'partida') renderMatchBar(); const t = $('#mb-t'); if (t) t.textContent = mmss(PT.fim - NOW()); if (NOW() >= PT.fim + 800 && !pulling) partidaPoll(true); }
  if (PT && PT.estado === 'espera' && $('#bs-t')) $('#bs-t').textContent = Math.max(0, Math.ceil(60 - (NOW() - PT.criada) / 1000));
  if (PT && PT.estado === 'andamento' && $('#play-t')) $('#play-t').textContent = mmss(PT.fim - NOW());
}, 1000);
setInterval(() => { if (TOK && CLOUD() && PT && (PT.estado === 'espera' || (noAr() && duelo())) && !document.hidden) partidaPoll(true); }, 5000);   // duelo: o rival e a presença precisam de consulta curta
setInterval(() => { if (TOK && CLOUD() && noAr() && duelo() && !document.hidden) partidaPoll(true); }, 3000);
setInterval(() => { if (TOK && CLOUD() && MODE !== 'partida' && noAr() && !document.hidden) partidaPoll(true); }, 30000);


/* ---------- Duelo X1: carrossel de salas (uma por galáxia), abre na última galáxia desbloqueada ---------- */
let ARENA_I = -1, SALAS = null, salasAt = 0;
const ultimaLiberada = () => { let k = 0; GALAXIES.forEach((_, i) => { if (galLiberada(i)) k = i; }); return k; };
const CAR_ART = [['b076_terra', '#e6c84a'], ['a085_gelo', '#9fdcff'], ['b049_asteroide', '#9bd16a'], ['b057_ilha_flutuante', '#f2a65a'], ['b053_megaestrutura', '#a9b8cc'], ['b055_binario', '#7fb0e0'], ['b017_buraco_negro', '#ffd24a'], ['a021_cristal', '#c58bf2'], ['b087_oceano', '#9b6cf5'], ['a066_lava', '#ff8a3d'], ['b091_crescente', '#ff5fd2']];   // um planeta bem diferente por galáxia
const carImg = (g, i) => ({ img: CAR_ART[i][0] + '.svg', c: CAR_ART[i][1] });
async function salasPoll() {
  if (!TOK || !CLOUD() || document.hidden || document.body.dataset.view !== 'play' || (PT && (PT.estado === 'espera' || noAr()))) return;
  try { SALAS = await api('/duelo/salas'); salasAt = Date.now(); document.querySelectorAll('#car .cd-fila').forEach((el, i) => { const h = filaHtml(i); if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; } }); } catch {}   // só o texto da fila: sem refazer o carrossel
}
const filaHtml = i => { const esp = SALAS ? SALAS.esp[i] : 0, jog = SALAS ? SALAS.jog[i] : 0; return `<i class="${esp ? 'on' : ''}"></i>${esp ? esp + ' na fila' : 'fila vazia'}${jog ? ' · ' + jog + ' em duelo' : ''}`; };
function dueloHtml(dano) {
  if (ARENA_I < 0) ARENA_I = ultimaLiberada();
  const f = x => fmt(x).replace(',00', '');
  const cards = GALAXIES.map((g, i) => {
    const ok = galLiberada(i), ap = APOSTAS[i], { img, c } = carImg(g, i), pode = ok && !dano && S.credits >= ap, esp = SALAS ? SALAS.esp[i] : 0, jog = SALAS ? SALAS.jog[i] : 0;
    const motivo = !ok ? `Exige ${RANKS[g.t] ? RANKS[g.t][1] : 'patente ' + g.t}${g.eng > 1 ? ' e motor nv ' + g.eng : ''}` : dano ? 'Repare o casco' : S.credits < ap ? `Faltam ${f(ap - S.credits)} Cr` : '';
    return `<article class="cd${ok ? '' : ' lk'}${i === ARENA_I ? ' on' : ''}" data-i="${i}" style="--c:${c}">
      <div class="cd-art"><i class="cd-halo"></i><img src="assets/planets/${img}" alt="" decoding="async"></div>
      <h4 class="cd-nome">${g.nome}</h4>
      <div class="cd-aposta"><small>APOSTA</small><b>${f(ap)}<i> Cr</i></b></div>
      <div class="cd-grade"><div><small>PRÊMIO</small><b class="verde">${f(Math.round(ap * 1.8))}</b></div><div><small>SALDO INICIAL</small><b>${f(ap * 50)}</b></div></div>
      <div class="cd-fila" data-h="${esc(filaHtml(i))}">${filaHtml(i)}</div>
      ${ok ? `<button type="button" class="cd-go" data-gal="${i}" ${pode ? '' : 'disabled'}>${pode ? '⚔ ENTRAR NA FILA' : esc(motivo)}</button>` : `<div class="cd-lock">🔒 ${esc(motivo)}</div>`}
    </article>`;
  }).join('');
  return `<div class="pcard duelo"><h3>⚔️ Duelo X1 <small>5 min · mercado dividido · ataque e roubo de carga</small></h3>
    <div class="carw"><button type="button" class="car-b" data-car="-1" aria-label="Sala anterior">‹</button><div class="car" id="car">${cards}</div><button type="button" class="car-b r" data-car="1" aria-label="Próxima sala">›</button></div>
    <div class="car-dots">${GALAXIES.map((_, i) => `<i data-d="${i}" class="${i === ARENA_I ? 'on' : ''}${galLiberada(i) ? '' : ' lk'}"></i>`).join('')}</div>
    <p class="err" id="d-err">${esc(duelMsg)}</p></div>`;
}
function carIr(i, suave) {
  const car = $('#car'); if (!car) return; ARENA_I = Math.max(0, Math.min(GALAXIES.length - 1, i));
  const cd = car.children[ARENA_I]; if (!cd) return;
  car.scrollTo({ left: cd.offsetLeft - (car.clientWidth - cd.offsetWidth) / 2, behavior: suave ? 'smooth' : 'instant' });
  carMarca();
}
function carMarca() {
  document.querySelectorAll('#car .cd').forEach((c, i) => c.classList.toggle('on', i === ARENA_I));
  document.querySelectorAll('.car-dots i').forEach((d, i) => d.classList.toggle('on', i === ARENA_I));
}
let carRaf = 0;
document.addEventListener('scroll', e => {
  if (!e.target || e.target.id !== 'car' || carRaf) return; const car = e.target;
  carRaf = requestAnimationFrame(() => {   // no máximo uma leitura por quadro
    carRaf = 0; const mid = car.scrollLeft + car.clientWidth / 2; let best = 0, bd = 1e9;
    for (let i = 0; i < car.children.length; i++) { const c = car.children[i], d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } }
    if (best !== ARENA_I) { ARENA_I = best; carMarca(); }
  });
}, { capture: true, passive: true });
$('#play').addEventListener('click', e => {
  const b = e.target.closest('[data-car]'); if (b) return carIr(ARENA_I + +b.dataset.car, true);
  const d = e.target.closest('[data-d]'); if (d) return carIr(+d.dataset.d, true);
  const c = e.target.closest('.cd'); if (c && !e.target.closest('button') && +c.dataset.i !== ARENA_I) carIr(+c.dataset.i, true);
});
setInterval(salasPoll, 8000);

/* ---------- menu ---------- */
const resumo = c => `${c.duracao} min · saldo ${fmt(c.saldo).replace(',00', '')} Cr · ${c.galaxias.map(i => GALAXIES[i].nome).join(', ')}`
  + ` · ${c.jogadores} jogadores${c.bots ? ' (bots completam, ' + DIFIC[c.dific] + ')' : ''}${c.eventos ? '' : ' · sem eventos'}${c.piratas ? '' : ' · sem piratas'}${c.casco === false ? ' · sem desgaste de casco' + (c.taxa ? ' (prêmio −10%)' : '') : (c.taxa ? ' · com casco (1º pode levar até 70% do bolo)' : '')}`;
function renderPlay() {
  const el = $('#play'); if (!el) return;
  if (PT && duelo() && PT.estado === 'espera' && $('#busca') && $('#busca').dataset.c === PT.codigo) return;   // não reinicia a animação da busca
  const digitado = $('#join-cod') ? $('#join-cod').value : null, tinhaFoco = document.activeElement && document.activeElement.id === 'join-cod';   // a atualização da tela não pode apagar o que a pessoa está digitando
  if (!CLOUD()) { el.innerHTML = '<p class="empty">As partidas precisam do servidor do jogo (modo online).</p>'; return; }
  if (!TOK) { el.innerHTML = '<p class="empty">Entre na sua conta para jogar duelos, torneios e salas de amigos.</p>'; return; }
  if (PT && PT.estado === 'espera') { el.innerHTML = lobbyHtml(); return; }
  if (noAr()) { el.innerHTML = emAndamentoHtml(); return; }
  if (FORM) { el.innerHTML = formHtml(); return; }
  const um = location.search.match(/[?&]sala=([A-Za-z0-9]{6})/), pre = um ? um[1].toUpperCase() : '';
  const dano = MODE !== 'partida' && S.hull < 25;
  el.innerHTML = (dano ? `<div class="pcard aviso"><h3>🔧 Nave danificada</h3><p>Seu casco está em <b>${Math.floor(S.hull)}%</b>, baixo demais para viajar (mínimo 25%). Repare a nave (botão <b>Reparar casco</b>) antes de entrar na Arena. A partida começa com 100% para todos.</p></div>` : '') + `${dueloHtml(dano)}
  <div class="pcards">
    <div class="pcard"><h3>🏆 Torneio</h3><p>Até 8 pilotos pagam uma taxa de entrada; os melhores levam o prêmio. Bots completam a sala.</p><button type="button" class="buy" data-p="novo-torneio" ${dano ? "disabled" : ""}>Criar torneio</button></div>
    <div class="pcard"><h3>🤝 Entre amigos</h3><p>Sala livre, sem taxa: escolha tempo, galáxias e regras e convide por código.</p><button type="button" class="buy" data-p="novo-amigos" ${dano ? "disabled" : ""}>Criar sala</button></div>
  </div>
  <form class="prow" id="join"><label>Tem um código? <input id="join-cod" maxlength="6" autocomplete="off" placeholder="ABC123" value="${pre}"></label><button class="buy" type="submit">Entrar na sala</button></form>
  <p class="err" id="join-err">${esc(joinMsg)}</p>
  <p class="empty">Você só joga em galáxias que já desbloqueou. A partida usa sua nave atual (porão, motor e armamento), mas é um jogo à parte: seus créditos e itens da carreira não mudam, exceto a taxa e o prêmio do torneio.</p>`;

  if (digitado) { $('#join-cod').value = digitado; if (tinhaFoco) $('#join-cod').focus(); }
  carIr(ARENA_I, false); }
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
  ${t ? '<div class="prow"><span>Piratas e monstros</span><b>sempre ligados</b></div>' : `<label class="prow">Piratas e monstros <input type="checkbox" data-f="piratas" ${f.piratas ? 'checked' : ''}></label>`}
  <label class="prow">Desgaste e reparo de casco <input type="checkbox" data-f="casco" ${f.casco ? 'checked' : ''}></label>
  ${f.casco ? (t ? '<p class="empty"><b>Com casco:</b> quanto mais desgaste a sala sofrer (viagens e lutas), mais o 1º colocado leva do bolo, tirado do 2º e do 3º: de 60/30/10 até 70/22/8. O total pago não muda. Com 2 pilotos ou sozinho contra bots não há esse ajuste.</p>' : '') : `<p class="empty">Sem desgaste: viagens e lutas não danificam o casco, então não há reparo. Piratas e monstros continuam valendo: vencer rende saque e perder custa parte da carga.${t ? ' <b>Em torneio, salas sem casco retêm 10% do prêmio (taxa de sala)</b>, para que desligar o reparo não compense mais do que mantê-lo.' : ''}</p>`}
  ${t ? `<label class="prow">Taxa de entrada <select data-f="taxa">${TAXAS.map(x => `<option value="${x}" ${x === f.taxa ? 'selected' : ''}>${fmt(x).replace(',00', '')} Cr</option>`).join('')}</select></label>
  <p class="empty">A taxa sai dos seus créditos da carreira. Com 3 ou mais pilotos, o bolo (soma das taxas) paga 60% / 30% / 10% ao 1º, 2º e 3º; com 2, o vencedor leva tudo. Sozinho contra bots, você recupera a taxa se terminar na metade de cima e ganha um bônus se vencer (nos bots Normal e Difícil).</p>` : ''}
  <p class="err" id="f-err"></p>
  <div class="prow"><button type="button" id="f-x">Voltar</button><button type="button" class="buy" id="f-ok">Criar sala${t ? ' e pagar taxa' : ''}</button></div>`;
}
function lobbyHtml() {
  if (duelo()) {
    const gi = PT.cfg.galaxias[0], [img, cor] = CAR_ART[gi], seg = Math.max(0, Math.min(60, (NOW() - PT.criada) / 1000)), nave = (id, y, d, t, w, z) => { const n = String(id).padStart(2, '0'), u = (pt, l) => `assets/naves/nave_${n}/nave_${n}_${pt}${l ? '_n' + l : ''}.svg`; return `<span class="bs-nave ${d}" style="top:${y}%;animation-duration:${t}s;animation-delay:${w}s;--z:${z}px"><span class="bs-corpo">${[['motor', 3], ['casco', 0], ['porao', 3], ['armas', 3]].map(([pt, l]) => `<img src="${u(pt, l)}" alt="" decoding="async">`).join('')}</span></span>`; };
    return `<div class="busca" id="busca" data-c="${PT.codigo}" style="--c:${cor}">
      ${nave(41, 6, 'r', 6, 0, 46)}${nave(29, 24, 'l', 7.5, -2.5, 40)}${nave(35, 66, 'r', 7, -3.5, 42)}${nave(17, 82, 'l', 9, -1, 34)}${nave(45, 44, 'r', 10, -6, 48)}
      <div class="bs-radar"><i class="r1"></i><i class="r2"></i><i class="r3"></i><b class="bs-sweep"></b><img src="assets/planets/${img}.svg" alt="" decoding="async"><u class="blip b1"></u><u class="blip b2"></u><u class="blip b3"></u></div>
      <div class="bs-txt">PROCURANDO RIVAL<span class="bs-pts"><i>.</i><i>.</i><i>.</i></span></div>
    </div>
    <div class="bs-info"><span>Aposta <b>${fmt(PT.cfg.taxa).replace(',00', '')} Cr</b> reservada</span><span><b id="bs-t">${Math.ceil(60 - seg)}</b> s</span></div>
    <div class="bs-bar"><i style="animation-delay:-${seg.toFixed(1)}s"></i></div>
    <p class="err" id="l-err"></p><div class="prow"><button type="button" class="danger" id="l-x">Cancelar e recuperar a aposta</button></div>`;
  }
  const c = PT.cfg, link = location.origin + location.pathname + '?sala=' + PT.codigo, hum = PT.jogadores.length;
  return `<h3>${PT.modo === 'torneio' ? '🏆 Torneio' : '🤝 Sala entre amigos'} · aguardando</h3>
  <div class="pcode"><small>Código da sala</small><b class="mono">${PT.codigo}</b><button type="button" id="l-cp">Copiar convite</button></div>
  <div class="prow"><button type="button" class="buy" id="l-inv"><i class="fa-solid fa-user-group"></i> Convidar amigos</button></div>
  <p class="empty">${esc(resumo(c))}${PT.modo === 'torneio' ? ` · taxa ${fmt(c.taxa).replace(',00', '')} Cr` : ''}</p>
  <ul class="board">${PT.jogadores.map(j => `<li class="${j.eu ? 'me' : ''}${j.i ? ' pj-link' : ''}"${j.i ? ` data-pj="${j.i}" role="button" tabindex="0"` : ''}><span>${esc(j.n)}${j.host ? ' 👑' : ''}</span></li>`).join('')}<li class="tot"><span>${hum} de ${c.jogadores} vagas${c.bots ? ` · ${c.jogadores - hum} bot(s) entram ao iniciar` : ''}</span></li></ul>
  <p class="err" id="l-err"></p>
  <div class="prow">${PT.host ? '<button type="button" class="buy" id="l-go">Iniciar partida</button>' : '<span class="empty">Aguardando o criador iniciar…</span>'}<button type="button" class="danger" id="l-x">${PT.host ? 'Cancelar sala' : 'Sair da sala'}</button></div>`;
}
function emAndamentoHtml() {
  if (duelo()) { const R = PT.rival; return `<h3>⚔️ Duelo X1 em andamento</h3><p class="pbig mono" id="play-t">${mmss(PT.fim - NOW())}</p><p class="empty">Aposta de ${fmt(PT.cfg.taxa).replace(',00', '')} Cr · rival: <b>${R ? esc(R.n) : '…'}</b></p><div class="prow">${MODE === 'partida' ? '<button type="button" class="buy" data-p="jogar">Voltar ao mercado</button>' : '<button type="button" class="buy" data-p="entrar">Voltar ao duelo</button>'} <button type="button" class="danger" id="p-quit">🏳 Abandonar</button></div>`; }
  const pos = PT.placar ? PT.placar.findIndex(x => x.eu) + 1 : 0;
  return `<h3>${PT.modo === 'torneio' ? '🏆 Torneio' : '🤝 Partida'} em andamento</h3>
  <p class="pbig mono" id="play-t">${mmss(PT.fim - NOW())}</p><p class="empty">${esc(resumo(PT.cfg))}</p>
  ${pos ? `<p>Sua posição: <b>${pos}º</b> de ${PT.placar.length}</p>` : ''}
  <div class="prow">${MODE === 'partida' ? '<button type="button" class="buy" data-p="jogar">Voltar ao mercado</button>' : '<button type="button" class="buy" data-p="entrar">Voltar à partida</button>'} <button type="button" class="danger" id="p-quit">🏳 Abandonar</button></div>`;
}
function mostrarResultado(p) {
  const box = $('#res-box');
  if (p.estado === 'cancelada' && p.modo === 'duelo') box.innerHTML = '<h2>Nenhum oponente encontrado</h2><p class="empty">Ninguém entrou na fila em 60 segundos. Sua aposta foi devolvida; tente de novo daqui a pouco.</p><button class="buy" id="res-x">Fechar</button>';
  else if (p.estado === 'cancelada') box.innerHTML = '<h2>Sala cancelada</h2><p class="empty">A sala não começou a tempo. As taxas foram devolvidas.</p><button class="buy" id="res-x">Fechar</button>';
  else {
    const eu = (p.resultado || []).find(r => r.eu), t = p.modo === 'torneio';
    if (p.modo === 'duelo') {
      const rv = (p.resultado || []).find(r => !r.eu), ap = p.cfg.taxa, f = x => fmt(x).replace(',00', '') + ' Cr';
      const tit = eu && eu.emp ? '🤝 Empate' : eu && eu.pos === 1 ? '🏆 Vitória!' : '💥 Derrota', txt = eu && eu.emp ? `Patrimônio idêntico: a aposta de ${f(ap)} foi devolvida.`
        : eu && eu.pos === 1 ? (rv && rv.ab ? `${esc(rv.n)} sumiu por mais de 60 s e perdeu por abandono. ` : '') + `Prêmio de ${f(eu.premio)} creditado (lucro de ${f(eu.premio - ap)}).`
        : eu && eu.ab ? `Você abandonou o duelo (ou ficou mais de 60 s offline) e perdeu a aposta de ${f(ap)}.` : `Você perdeu a aposta de ${f(ap)}.`;
      box.innerHTML = `<h2>${tit}</h2><ol class="board">${(p.resultado || []).map(r => `<li class="${r.eu ? 'me' : ''}"><span><i class="pos">${r.pos}</i> ${esc(r.n)}${r.ab ? ' <small>abandonou</small>' : ''}</span><b class="mono">${f(r.w)}</b></li>`).join('')}</ol><p class="empty">${txt}</p><button class="buy" id="res-x">Fechar</button>`;
      $('#res').hidden = false; $('#res-x').onclick = () => { $('#res').hidden = true; }; return;
    }
    box.innerHTML = `<h2>${eu && eu.pos === 1 ? '🏆 Você venceu!' : 'Fim da partida'}</h2><ol class="board">${(p.resultado || []).map(r => `<li class="${r.eu ? 'me' : ''}${r.i ? ' pj-link' : ''}"${r.i ? ` data-pj="${r.i}" role="button" tabindex="0"` : ''}><span><i class="pos">${r.pos}</i> ${esc(r.n)}${r.bot ? ' <small>bot</small>' : ''}${r.premio ? ` <small>+${fmt(r.premio).replace(',00', '')} Cr</small>` : ''}</span><b class="mono">${fmt(r.w)}</b></li>`).join('')}</ol>`
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
  if (b.dataset.gal != null && b.closest('.cd')) { duelMsg = ''; if (await pedir(b, '/duelo/fila', { gal:+b.dataset.gal }, '#d-err')) refrescar(true); else if ($('#d-err')) duelMsg = $('#d-err').textContent; return; }
  if (b.id === 'p-quit') return abandonar(b);
  if (b.id === 'l-inv') { if (typeof AV !== 'undefined') AV.tab = 'amigos'; return document.querySelector('.nav [data-view=amigos]').click(); }
  if (b.dataset.p === 'carreira') return document.querySelector('.nav [data-view=market]').click();
  if (b.dataset.p === 'jogar') return document.querySelector('.nav [data-view=market]').click();
  if (b.dataset.p === 'entrar') { ficouCarreira = ''; return entrarModoPartida(); }
  if (b.dataset.p === 'novo-torneio' || b.dataset.p === 'novo-amigos') {
    const g0 = GALAXIES.findIndex((_, i) => galLiberada(i));
    FORM = { modo:b.dataset.p === 'novo-torneio' ? 'torneio' : 'amigos', duracao:15, saldo:5000, galaxias:[Math.max(0, g0)], jogadores:b.dataset.p === 'novo-torneio' ? 4 : 2, bots:b.dataset.p === 'novo-torneio', dific:'normal', eventos:true, piratas:true, casco:true, taxa:1000 };
    return renderPlay();
  }
  if (b.id === 'f-x') { FORM = null; return renderPlay(); }
  if (b.id === 'f-ok') {
    const f = FORM, cfg = { duracao:f.duracao, saldo:f.saldo, galaxias:f.galaxias, jogadores:f.jogadores, bots:f.bots, dific:f.dific, eventos:f.eventos, piratas:f.piratas, casco:f.casco, taxa:f.taxa };
    if (await pedir(b, '/partida/criar', { modo:f.modo, cfg }, '#f-err')) { FORM = null; refrescar(true); renderPlay(); } return;
  }
  if (b.id === 'l-go') return void (await pedir(b, '/partida/iniciar', {}, '#l-err'));
  if (b.id === 'l-x') { if (PT.host && !duelo() && !confirm('Cancelar a sala? As taxas pagas serão devolvidas.')) return; if (await pedir(b, '/partida/sair', {}, '#l-err')) refrescar(true); return; }
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
document.querySelector('.nav [data-view=play]').addEventListener('click', () => { ARENA_I = -1; renderPlay(); partidaPoll(true); setTimeout(() => carIr(ARENA_I, false), 60); setTimeout(salasPoll, 150); });
$('#res').onclick = e => { if (e.target.id === 'res') $('#res').hidden = true; };
{ const boot = setInterval(() => { if (!CLOUD() || !TOK) { clearInterval(boot); renderPlay(); return; } if (READY) { clearInterval(boot); partidaPoll(true).then(() => { renderPlay(); if (/[?&]sala=/.test(location.search) && !PT) document.querySelector('.nav [data-view=play]').click(); }); } }, 300); }
renderPlay();
