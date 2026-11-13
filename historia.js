/* História de abertura: 4 telas, puláveis. Só aparece uma vez por conta (novata, perfil pronto) e antes do tutorial; dá para rever em Configurações. */
(() => {
  const KEY = () => 'astromercante_hist_' + (USER || 'x'), rd = () => { try { return localStorage.getItem(KEY()); } catch { return 'done'; } }, wr = () => { try { localStorage.setItem(KEY(), 'done'); } catch {} };
  const TELAS = [
    { t: 'Ano 2487', x: 'A Terra deu tudo o que podia. Minérios, energia, água: o que restou ficou caro demais para quem sobreviveu aqui.' },
    { t: 'O Consórcio Estelar', x: 'Então o Consórcio abriu as rotas. Dezenas de planetas, cada um com o que sobra e o que falta. Quem leva a mercadoria certa ao lugar certo, <b>enriquece</b>.' },
    { t: 'Nem tudo é lucro', x: 'O espaço não perdoa: preços despencam, eventos viram o mercado de cabeça para baixo, e <b>piratas e monstros</b> patrulham as rotas. Uma nave forte é o seu seguro.' },
    { t: 'A sua vez', x: 'Você recebeu uma nave velha, a <b>Faísca</b>, e <b>10.000 Cr</b> de crédito. É pouco. Mas todo grande comerciante começou assim, e um veterano vai te mostrar as cordas.', cap: 1 }
  ];
  const $ = s => document.querySelector(s), el = $('#hist'); if (!el) return;
  let i = -1, tm = 0, full = '';
  const ativo = () => CLOUD() && TOK && MODE !== 'partida' && !document.body.classList.contains('loading') && !document.body.classList.contains('gated') && READY && typeof PF !== 'undefined' && PF && PF.completo;
  const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const novata = () => S.rank === 0 && S.gal === 0 && !S.trip && used() === 0 && S.credits >= 9900 && S.credits <= 10500;
  function fim() { clearInterval(tm); i = -1; wr(); el.hidden = true; document.body.classList.remove('histon'); window.HIST_ON = false; }
  function mostra(n) {
    i = n; const t = TELAS[n]; clearInterval(tm); full = t.x;
    $('#hist-t').textContent = t.t; $('#hist-cap').hidden = !t.cap;
    el.querySelectorAll('.hist-d i').forEach((d, k) => d.classList.toggle('on', k === n));
    $('#hist-n').textContent = n === TELAS.length - 1 ? 'Começar!' : 'Continuar';
    const p = $('#hist-x'); p.innerHTML = full;
    if (reduz()) return;
    // revela por palavras, sem quebrar as tags <b>
    const parts = full.split(/(<[^>]+>)/).filter(Boolean); let k = 0; const total = parts.reduce((a, s) => a + (s[0] === '<' ? 0 : s.length), 0);
    p.innerHTML = ''; tm = setInterval(() => { k += 2; let left = k, out = '', open = '';
      for (const s of parts) { if (s[0] === '<') { out += s; continue; } if (left <= 0) break; out += s.slice(0, left); left -= s.length; }
      p.innerHTML = out + (out.includes('<b>') && !out.includes('</b>') ? '</b>' : ''); if (k >= total) { clearInterval(tm); p.innerHTML = full; } }, 22);
  }
  function abre(n) { window.HIST_ON = true; el.hidden = false; document.body.classList.add('histon'); mostra(n || 0); }
  $('#hist-n').onclick = () => { if (tm && $('#hist-x').innerHTML !== full) { clearInterval(tm); tm = 0; $('#hist-x').innerHTML = full; return; } i + 1 < TELAS.length ? mostra(i + 1) : fim(); };
  $('#hist-skip').onclick = fim;
  document.addEventListener('keydown', e => { if (el.hidden) return; if (e.key === 'Escape') fim(); else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#hist-n').click(); } });
  const redo = $('#hist-redo'); if (redo) redo.onclick = () => abre(0);
  setInterval(() => {
    if (i >= 0) return; // já aberta
    if (!ativo()) { window.HIST_ON = false; return; }
    const s = rd(); if (s === 'done') return;
    if (!novata()) { wr(); return; }
    abre(0);
  }, 500);
})();
