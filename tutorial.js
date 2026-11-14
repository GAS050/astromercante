/* Tutorial do Capitão + meta sempre visível. Só mostra e orienta: quem decide tudo continua sendo o servidor.
   O progresso fica neste aparelho (por conta); o tutorial é opcional (Pular) e dá para rever em Configurações. */
(() => {
  const KEY = () => 'astromercante_tut_' + (USER || 'x'), rd = () => { try { return localStorage.getItem(KEY()); } catch { return 'done'; } }, wr = v => { try { v == null ? localStorage.removeItem(KEY()) : localStorage.setItem(KEY(), String(v)); } catch {} };
  const el = $('#tut'), tx = $('#tut-t'), ok = $('#tut-ok');
  let i = -1, rec = null, c0 = 0, qty0 = 0, shown = '';
  const ativo = () => CLOUD() && TOK && MODE !== 'partida' && !document.body.classList.contains('loading') && !document.body.classList.contains('gated') && READY && !window.HIST_ON && typeof PF !== 'undefined' && PF && PF.completo;
  const novata = () => S.rank === 0 && S.gal === 0 && !S.trip && used() === 0 && S.credits >= 9900 && S.credits <= 10500;
  let lastMark = '';
  const mark = sel => { document.querySelectorAll('.tut-hl').forEach(n => n.classList.remove('tut-hl')); const n = sel && document.querySelector(sel); if (n) { n.classList.add('tut-hl'); if (sel !== lastMark) { lastMark = sel; n.scrollIntoView({ block: 'center', behavior: 'smooth' }); } } else if (!sel) lastMark = ''; };
  /** Escolhe a compra e o destino que dão lucro de verdade (mercadoria mais barata aqui e mais cara em outro planeta já liberado). */
  function recomendar() {
    const aqui = plan(S.loc); if (!aqui) return null; let best = null;
    for (const r of RES) { if (r.t > S.rank) continue; const pr = px(r.id), n = Math.max(1, Math.min(S.cap, Math.floor(S.credits * .6 / pr)));
      for (const p of PL) { if (p.id === S.loc || p.t > S.rank) continue; const ra = (p.m[r.id] || 1) / (aqui.m[r.id] || 1), sc = n * pr * (ra * .95 - 1) - trip(p.id).cost; if (!best || sc > best.sc) best = { r, to: p, sc, ra, n }; } }
    if (!best || best.ra < 1.2) return best;
    return best;
  }
  const fim = () => { wr('done'); i = -1; el.hidden = true; document.body.classList.remove('tuton'); mark(null); };
  const passo = n => { i = n; wr(n); shown = ''; };
  const meta = () => { const k = Math.min(S.rank + 1, RANKS.length - 1); return S.rank + 1 >= RANKS.length ? 'Você já tem a patente máxima.' : `A próxima meta é <b>${RANKS[k][1]}</b>: patrimônio de ${fmt(RANKS[k][0]).replace(',00', '')} Cr.`; };
  const say2 = (html, okTxt) => { if (shown === html + okTxt) return; shown = html + okTxt; tx.innerHTML = html; ok.hidden = !okTxt; ok.textContent = okTxt || ''; };
  function tick() {
    // meta sempre visível: progresso até a próxima patente
    const g = $('#goal'); if (g) { if (CLOUD() && TOK && MODE !== 'partida' && READY && S.rank + 1 < RANKS.length) { const a = RANKS[S.rank][0], b = RANKS[S.rank + 1][0], w = patTotal(); g.hidden = false; $('#goal-t').innerHTML = `Próxima patente: <b>${RANKS[S.rank + 1][1]}</b> · ${fmt(Math.min(w, b)).replace(',00', '')} / ${fmt(b).replace(',00', '')} Cr`; $('#goal-i').style.width = clamp((w - a) / (b - a) * 100, 0, 100) + '%'; } else g.hidden = true; }
    if (!ativo()) { el.hidden = true; document.body.classList.remove('tuton'); return; }
    if (i < 0) { const s = rd(); if (s === 'done') return; if (s === null) { if (!novata()) { wr('done'); return; } passo(0); } else i = +s; if (!(i >= 0 && i <= ULT())) { fim(); return; } }
    el.hidden = false; document.body.classList.add('tuton');
    const seg = i >= 6 && i <= 10, j = seg ? i - 5 : i;   // a 2ª viagem (passos 6 a 10) repete a lógica dos passos 1 a 5, com o encontro com piratas
    if (i === 0) { mark(null); say2('Bem-vindo a bordo, comandante! Eu sou o Capitão. Nas estrelas lucra quem <b>compra barato</b> e <b>vende caro</b>. Vou te mostrar em 1 minuto.', 'Vamos lá!'); }
    else if (j === 1 && i <= 6) {
      if (used() > 0) { qty0 = used(); passo(i + 1); return; }
      if (!rec) { rec = recomendar(); c0 = S.credits; }
      if (!rec) { fim(); return; }
      const q = $('#qty'); if (rec.n && q && document.activeElement !== q && +q.value !== rec.n) q.value = rec.n;
      say2((seg ? 'Segunda viagem! Desta vez vamos cruzar com <b>piratas</b>, de propósito, para você ver uma luta. ' : '') + `Aqui <b>${rec.r.nome}</b> está barato. Deixei a quantidade em <b>${rec.n || 1}</b>: toque em <b>COMPRAR</b>.`, '');
      mark(`[data-id="${rec.r.id}"] [data-act=buy]`);
    } else if (j === 2 && i <= 7) {
      if (S.trip) { passo(i + 1); return; }
      if (!rec) { rec = recomendar(); } if (!rec) { fim(); return; }
      if (sel !== rec.to.id && !tutSel) { tutSel = 1; sel = rec.to.id; selG = null; renderInfo(); }
      say2(`${seg ? '' : 'Muito bem! '}Em <b>${rec.to.nome}</b> esse produto paga mais. Toque em <b>Viajar</b> no painel do planeta (já selecionei para você).`, '');
      mark('#mapinfo [data-go]');
    } else if (j === 3 && i <= 8) {
      if (!S.trip) { passo(used() > 0 ? i + 1 : i + 2); return; }
      mark(null);
      const f = S.trip.enc && S.trip.enc[0], n = NOW();
      if (seg && f) say2(n < f.td ? 'Em viagem... fique de olho no mapa.' : n < f.tc ? `<b>${f.nm}</b> na nossa cola! O número ao lado deles é o <b>poder de fogo</b> (${f.lv.toFixed(1)}); o nosso é ${(+S.wpLv).toFixed(1)}. ${f.r >= 1.09 ? 'Verde: vencemos.' : 'Parelho assim seria arriscado, mas esta é uma luta de treino: a vitória está garantida.'}` : n < f.tc + 3000 ? 'Troca de tiros! A nave para durante a luta.' : 'Luta decidida! Aguarde a chegada.', '');
      else say2(seg ? 'Em viagem... aguarde a chegada.' : 'Em viagem! Piratas e monstros podem aparecer no caminho: seu <b>poder de fogo</b> decide a luta. Aguarde a chegada. (Nesta primeira viagem o caminho está livre.)', '');
    } else if (j === 4 && i <= 9) {
      if (used() === 0) { passo(i + 1); return; }
      const r = RES.find(x => S.inv[x.id].qty > 0);
      say2('Chegamos! Aqui o preço é melhor. Toque em <b>VENDER</b> para fechar o lucro (use a quantidade total).', ''); if (r) { const q = $('#qty'); if (q && document.activeElement !== q && +q.value !== S.inv[r.id].qty) q.value = S.inv[r.id].qty; mark(`[data-id="${r.id}"] [data-act=sell]`); }
    } else if (i === 5) {
      mark(null); const l = Math.round(S.credits - c0);
      say2(`${l > 0 ? `Lucro de <b>${fmt(l).replace(',00', '')} Cr</b> nessa primeira viagem. Com a nave inicial o lucro é pequeno; melhorar o porão e o motor multiplica isso.` : 'Nem toda viagem dá lucro: confira sempre onde o preço está mais alto.'} Agora vamos a uma segunda viagem, com encontro com piratas.`, 'Segunda viagem');
    } else if (i === 10) {
      mark(null);
      say2('Você enfrentou piratas e venceu: o <b>saque</b> vai para o seu caixa. Nem toda luta termina assim: se o poder deles for maior, você perde <b>carga e casco</b>. Compare o número antes de viajar (verde vence, amarelo é incerto, vermelho é perigo) e melhore as <b>armas</b> em Frotas.', 'Continuar');
    } else if (i >= 11 && i <= ULT()) {
      const T = TOUR[i - 11]; mark(T.m); say2(T.t, i === ULT() ? 'Vamos jogar!' : 'Próximo');
    }
  }
  /* visita guiada pelos menus (passos 11 em diante): cada passo troca de tela e destaca o botão */
  const ULT = () => 10 + TOUR.length;   // último passo da visita
  const TOUR = [
    { v: 'home', m: '.nav [data-view=home]', t: '<b>Início</b>: o seu perfil completo (nave, conquistas, selos e troféus), patente, missões do dia e atalhos. Aqui também fica o <b>Noticiário Interplanetário</b>: notícias do mundo real viram eventos no jogo e mexem no preço dos produtos (▲ sobe, ▼ cai) por algumas horas.' },
    { v: 'market', m: '.nav [data-view=market]', t: '<b>Negociação</b>: o mapa e o mercado. Compre barato, venda caro e viaje entre planetas e galáxias. Os preços seguem o mercado real e mudam a cada 30 segundos. Ao viajar, escolha a <b>rota direta</b> (rápida, mas pode cruzar piratas e monstros) ou a <b>rota segura</b> (60% mais longa e mais cara, sem inimigos). Planetas podem ganhar um selo de <b>Quarentena</b> (ninguém pousa), <b>Greve</b> (vendas rendem menos), <b>Feira</b> (rendem mais) ou <b>Bloqueio</b> (viagem mais lenta e cara). De tempos em tempos um planeta fica <b>EM FALTA</b> de um produto: não dá para comprá-lo lá, e o produto fica mais caro no começo, mas a alta some com o tempo e com as suas vendas. Os contratos costumam pedir justamente esses produtos.' },
    { v: 'market', m: '#contratos', t: '<b>Contratos</b>: cada planeta oferece pedidos de entrega. Aceite até 3, leve a carga ao destino <b>antes do prazo</b> e receba o preço de mercado mais um bônus. Dá para entregar aos poucos. Cuidado com a <b>carga frágil</b>: paga muito mais, mas se houver luta no caminho o contrato é perdido. O prazo é de segundos (a viagem mais uma folga curta) e encurta nas galáxias avançadas. Às vezes aparece um pedido para <b>outra galáxia</b>, com mais tempo e bônus maior. O preço ainda pode subir ou cair no caminho: o risco continua seu.' },
    { v: 'play', m: '.nav [data-view=play]', t: '<b>Torneios</b>: salas contra outros pilotos, com prêmio para os melhores. Também dá para criar uma partida com amigos. Sem adversários humanos, os bots ficam mais fortes ou mais fracos conforme a sua patente.' },
    { v: 'fleet', m: '.nav [data-view=fleet]', t: '<b>Frotas</b>: reparo do casco e melhorias da sua nave (porão, motor e armas).' },
    { v: 'loja', m: '.nav [data-view=loja]', t: '<b>Loja</b>: naves novas, avatares e molduras, tudo comprado com os créditos do jogo. Avatares e molduras são só aparência; as naves mudam o jogo.' },
    { v: 'amigos', m: '.nav [data-view=amigos]', t: '<b>Amigos</b>: veja todos os pilotos, adicione amigos, aceite pedidos e receba <b>convites para partidas</b>. No Início há o ranking entre amigos, por semana e por mês.' },
    { v: 'settings', m: '#acct', t: 'Seu nome, no topo, abre as <b>Configurações</b>: sons e música, rever este tutorial e falar com o suporte.' },
    { v: 'market', m: '.nav [data-view=market]', t: 'Pronto! Agora é com você: <b>compre barato, venda caro</b> e suba no ranking. Boa sorte, comandante!' }
  ];
  let tutSel = 0;
  const vai = v => { const b = document.querySelector(`.nav [data-view=${v}]`); if (b) b.click(); };
  let soTour = false;
  ok.onclick = () => {
    if (i === 0) { if (soTour) { passo(11); vai(TOUR[0].v); } else { passo(1); vai('market'); } }
    else if (i === 5) { passo(6); rec = null; tutSel = 0; c0 = S.credits; }
    else if (i === 10) { passo(11); vai(TOUR[0].v); }
    else if (i >= 11 && i < ULT()) { const prox = TOUR[i - 10].v; passo(i + 1); vai(prox); }
    else if (i === ULT()) { fim(); vai('market'); }
  };
  $('#tut-skip').onclick = fim;
  const redo = $('#tut-redo'); if (redo) redo.onclick = () => { rec = null; tutSel = 0; soTour = !(S.tv !== undefined && S.tv < 2); wr(0); i = 0; shown = ''; document.querySelector('.nav [data-view=market]').click(); tick(); };
  setInterval(tick, 600);
})();
