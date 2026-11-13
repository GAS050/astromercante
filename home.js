/* Aba Início: o "menu de jogo". Só exibe e leva às outras telas; nenhuma regra mora aqui (tudo vem do estado que o servidor devolve). */
(() => {
  const el = $('#home'), go = v => { document.querySelector(`.nav [data-view=${v}]`).click(); };
  const DICAS = [
    'Compre onde o preço está ▼ baixo e venda onde está mais alto. Confira o mercado do planeta de destino antes de partir.',
    'Piratas e monstros patrulham o mapa. O número ao lado deles é o poder de fogo: compare com o seu antes de cruzar o caminho.',
    'Melhorar o porão leva mais carga, mas o preço cai conforme você compra: não adianta lotar tudo de um produto só.',
    'A patente só sobe. Arrisque sem medo de perder status e mire a próxima galáxia.',
    'Nos torneios todos começam com o mesmo saldo: vence quem negocia melhor, não quem tem mais.',
    'Casco baixo enfraquece o poder de fogo. Repare antes de viajar por rotas perigosas.',
    'Eventos de mercado duram poucos minutos e mudam os preços. Quem se mexe rápido lucra.',
  ];
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const proxUp = () => { try { const n = NAVES[S.nave - 1], f = S.frota && S.frota[S.nave]; if (!n || !f) return null; const c = [['cap', f.c], ['eng', f.m], ['wp', f.a]].filter(x => x[1] < 5).map(x => upCusto(n, x[0], x[1])); return c.length ? Math.min(...c) : null; } catch { return null; } };
  /* Meu perfil dentro do Início: mesmas seções do perfil público (vêm de /jogador), atualizadas a cada 45 s ou ao voltar para a aba. */
  let meu = null, meuT = 0, buscando = false;
  const carregarMeu = async () => { if (buscando || !PF || !PF.id || Date.now() - meuT < 90000) return; buscando = true; meuT = Date.now(); try { meu = await api('/jogador?id=' + PF.id); } catch { meuT = Date.now() - 60000; } buscando = false; };
  window.meuPerfilAtualizar = () => { meuT = 0; };
  /* Noticiário Interplanetário: notícias fictícias inspiradas no noticiário real (vêm do Worker, geradas pela IA) */
  const hA = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 2 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`; };
  const noticiasCard = () => {
    const L = (typeof NOTICIAS !== 'undefined' ? NOTICIAS : []).slice(0, 5); if (!L.length) return '';
    const nome = id => esc((RES.find(r => r.id === id) || {}).nome || id);
    return `<div class="hm-card hm-news"><div class="hm-h"><b>📰 Noticiário Interplanetário</b><small>Ficção inspirada no mundo real</small></div><ul class="nw">` + L.map(n => `<li><div class="nw-t"><b>${esc(n.ti)}</b><small>${hA(n.t0)}</small></div><p>${esc(n.tx)}</p>${n.s && Date.now() < n.t1 ? `<div class="nw-c">${n.r.map(id => `<span class="${n.s > 0 ? 'up' : 'down'}">${n.s > 0 ? '▲' : '▼'} ${nome(id)}</span>`).join('')}</div>` : ''}</li>`).join('') + `</ul><small class="nw-f">Notícias fictícias. Não são recomendação financeira.</small></div>`;
  };
  function render() {
    if (document.body.dataset.view !== 'home' || !TOK || !CLOUD() || !READY || typeof PF === 'undefined' || !PF) return;
    const emPartida = MODE === 'partida', n = NAVES[(S.nave || 1) - 1] || { nome: 'Nave' }, w = patTotal();
    const nx = !emPartida && S.rank + 1 < RANKS.length ? RANKS[S.rank + 1] : null, a = RANKS[S.rank][0], pct = nx ? clamp((w - a) / (nx[0] - a) * 100, 0, 100) : 100;
    let h = `<div class="hm-hero"><img class="hm-av mo-${PF.moldura || ''}" src="${avSrc(PF.avatar)}" alt="" width="72" height="72"><div class="hm-id"><b>${esc(PF.apelido)}</b><span>${emPartida ? 'Em partida' : RANKS[S.rank][1]}</span></div><div class="hm-pat"><small>${emPartida ? 'Patrimônio na partida' : 'Patrimônio'}</small><b class="mono">${fmt(emPartida ? S.credits + cargo() : w).replace(',00', '')} Cr</b></div></div>`;
    if (nx) h += `<div class="hm-meta"><span>Próxima patente: <b>${nx[1]}</b></span><div class="goal-b"><i style="width:${pct}%"></i></div><small>${fmt(Math.min(w, nx[0])).replace(',00', '')} / ${fmt(nx[0]).replace(',00', '')} Cr</small></div>`;
    const rota = S.trip ? `Em viagem para <b>${esc(plan(S.trip.to)?.nome || '…')}</b>` : `Em <b>${esc(plan(S.loc)?.nome || '…')}</b>`;
    h += `<button type="button" class="hm-go" data-hm="market">▶ ${S.trip ? 'Acompanhar viagem' : 'Continuar jogando'}<small>${rota} · ${esc(GALAXIES[S.gal]?.nome || '')}</small></button>`;
    if (noAr()) { const pos = PT.placar ? PT.placar.findIndex(x => x.eu) + 1 : 0; h += `<div class="hm-card hm-match"><div><b>${PT.modo === 'torneio' ? '🏆 Torneio' : '🤝 Partida entre amigos'} em andamento</b><small>Sala ${PT.codigo} · faltam ${mmss(PT.fim - NOW())}${pos ? ' · você está em ' + pos + 'º' : ''}</small></div><button type="button" data-hm="${MODE === 'partida' ? 'market' : 'volta'}">${MODE === 'partida' ? 'Jogar' : 'Voltar à partida'}</button></div>`; }
    const casco = S.hull == null ? 100 : S.hull;
    h += `<div class="hm-stats"><div><small>Créditos</small><b class="mono">${fmt(S.credits)}</b></div><div><small>Nave</small><b>${esc(n.nome)}</b></div><div><small>Casco</small><b class="${casco < 30 ? 'down' : ''}">${casco}%</b></div><div><small>Porão</small><b>${used()}/${S.cap}</b></div></div>`;
    h += noticiasCard();
    if (!emPartida && S.daily && S.daily.p) {
      h += `<div class="hm-card"><div class="hm-h"><b>Missões do dia</b><small>Sequência de ${pl(S.streak || 0, 'dia')}</small></div><ul class="mis">` + MIS.map(m => { const t = Math.round(m.n()), v = Math.min(Math.round(S.daily.p[m.k] || 0), t); return `<li class="${S.daily.done[m.k] ? 'done' : ''}"><span>${m.t} <b class="mono">${v}/${t}</b></span><small>+${m.r} Cr</small><i style="width:${v / t * 100}%"></i></li>`; }).join('') + '</ul></div>';
    }
    carregarMeu(); if (meu && typeof pjSecoes === 'function') h += `<div class="hm-card hm-meu"><div class="hm-h"><b>Meu perfil</b><small>Como os outros pilotos veem você</small></div>${pjSecoes(meu)}</div>`;
    if (!emPartida && typeof rkCard === 'function') h += rkCard();
    h += `<div class="hm-tip"><img src="assets/avatar/capitao.webp" alt="" width="44" height="44"><p><b>Dica do Capitão</b>${DICAS[Math.floor(Date.now() / 864e5) % DICAS.length]}</p></div>`;
    const novo = h; if (novo !== el._h) { el.innerHTML = novo; el._h = novo; }
  }
  el.addEventListener('click', e => { const pc = e.target.closest('[data-pc]'); if (pc) return void abrirConquistas(+pc.dataset.pc, ''); const b = e.target.closest('[data-hm]'); if (!b) return; const v = b.dataset.hm; if (v === 'volta') { ficouCarreira = ''; entrarModoPartida(); } else go(v); });
  document.querySelectorAll('.nav [data-view]').forEach(b => b.addEventListener('click', () => { if (b.dataset.view === 'home') { meuT = 0; if (!RANK) carregarRanking(); render(); } }));
  setInterval(render, 1000);
  /* ao atualizar a página, volta para a aba em que o jogador estava (e não para o Início) */
  { let tent = 0; const iv = setInterval(() => {
      if (++tent > 60) return clearInterval(iv); if (!READY || !PF || !TOK) return; clearInterval(iv);
      let v = null; try { v = localStorage.getItem('astromercante_view'); } catch {}
      const b = v && v !== 'home' && document.querySelector(`.nav [data-view="${v}"]`), cl = document.body.classList;
      if (b && !cl.contains('histon') && !cl.contains('tuton') && document.body.dataset.view === 'home') b.click();
    }, 300); }
})();
