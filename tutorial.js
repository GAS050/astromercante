/* Tutorial do Capitão + meta sempre visível. Só mostra e orienta: quem decide tudo continua sendo o servidor.
   O progresso fica neste aparelho (por conta); o tutorial é opcional (Pular) e dá para rever em Configurações. */
(() => {
  const KEY = () => 'astromercante_tut_' + (USER || 'x'), rd = () => { try { return localStorage.getItem(KEY()); } catch { return 'done'; } }, wr = v => { try { v == null ? localStorage.removeItem(KEY()) : localStorage.setItem(KEY(), String(v)); } catch {} };
  const el = $('#tut'), tx = $('#tut-t'), ok = $('#tut-ok');
  let i = -1, rec = null, c0 = 0, qty0 = 0, shown = '';
  const ativo = () => CLOUD() && TOK && MODE !== 'partida' && !document.body.classList.contains('loading') && !document.body.classList.contains('gated') && READY;
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
    const g = $('#goal'); if (g) { if (CLOUD() && TOK && MODE !== 'partida' && READY && S.rank + 1 < RANKS.length) { const a = RANKS[S.rank][0], b = RANKS[S.rank + 1][0], w = S.credits + cargo(); g.hidden = false; $('#goal-t').innerHTML = `Próxima patente: <b>${RANKS[S.rank + 1][1]}</b> · ${fmt(Math.min(w, b)).replace(',00', '')} / ${fmt(b).replace(',00', '')} Cr`; $('#goal-i').style.width = clamp((w - a) / (b - a) * 100, 0, 100) + '%'; } else g.hidden = true; }
    if (!ativo()) { el.hidden = true; document.body.classList.remove('tuton'); return; }
    if (i < 0) { const s = rd(); if (s === 'done') return; if (s === null) { if (!novata()) { wr('done'); return; } passo(0); } else i = +s; if (!(i >= 0 && i <= 5)) { fim(); return; } }
    el.hidden = false; document.body.classList.add('tuton');
    if (i === 0) { mark(null); say2('Bem-vindo a bordo, comandante! Eu sou o Capitão. Nas estrelas lucra quem <b>compra barato</b> e <b>vende caro</b>. Vou te mostrar em 1 minuto.', 'Vamos lá!'); }
    else if (i === 1) {
      if (used() > 0) { qty0 = used(); passo(2); return; }
      if (!rec) { rec = recomendar(); c0 = S.credits; }
      if (!rec) { fim(); return; }
      const q = $('#qty'); if (rec.n && q && document.activeElement !== q && +q.value !== rec.n) q.value = rec.n;
      say2(`Aqui <b>${rec.r.nome}</b> está barato. Deixei a quantidade em <b>${rec.n || 1}</b>: toque em <b>COMPRAR</b>.`, '');
      mark(`[data-id="${rec.r.id}"] [data-act=buy]`);
    } else if (i === 2) {
      if (S.trip) { passo(3); return; }
      if (!rec) { rec = recomendar(); } if (!rec) { fim(); return; }
      if (sel !== rec.to.id && !tutSel) { tutSel = 1; sel = rec.to.id; selG = null; renderInfo(); }
      say2(`Muito bem! Em <b>${rec.to.nome}</b> esse produto paga mais. Toque em <b>Viajar</b> no painel do planeta (já selecionei para você).`, '');
      mark('#mapinfo [data-go]');
    } else if (i === 3) {
      if (!S.trip) { passo(used() > 0 ? 4 : 5); return; }
      mark(null); say2('Em viagem! Piratas e monstros podem aparecer no caminho: seu <b>poder de fogo</b> decide a luta. Aguarde a chegada.', '');
    } else if (i === 4) {
      if (used() === 0) { passo(5); return; }
      const r = RES.find(x => S.inv[x.id].qty > 0);
      say2('Chegamos! Aqui o preço é melhor. Toque em <b>VENDER</b> para fechar o lucro (use a quantidade total).', ''); if (r) { const q = $('#qty'); if (q && document.activeElement !== q && +q.value !== S.inv[r.id].qty) q.value = S.inv[r.id].qty; mark(`[data-id="${r.id}"] [data-act=sell]`); }
    } else if (i === 5) {
      mark(null); const l = Math.round(S.credits - c0);
      say2(`${l > 0 ? `Lucro de <b>${fmt(l).replace(',00', '')} Cr</b> nessa primeira viagem. Com a nave inicial o lucro é pequeno; melhorar o porão e o motor multiplica isso.` : 'Nem toda viagem dá lucro: confira sempre onde o preço está mais alto. '} ${meta()} Compre melhorias na aba <b>Frotas</b> e boa sorte lá fora!`, 'Concluir');
    }
  }
  let tutSel = 0;
  ok.onclick = () => { if (i === 0) passo(1); else if (i === 5) fim(); };
  $('#tut-skip').onclick = fim;
  const redo = $('#tut-redo'); if (redo) redo.onclick = () => { rec = null; tutSel = 0; wr(0); i = 0; shown = ''; document.querySelector('.nav [data-view=market]').click(); tick(); };
  setInterval(tick, 600);
})();
