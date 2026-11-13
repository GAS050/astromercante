/* Efeitos de recompensa e áudio. Só mostra e toca: nada aqui altera saldo, itens ou ranking (o servidor manda em tudo).
   Sons são sintetizados (WebAudio) e podem ser trocados por arquivos listando-os em ARQUIVOS; músicas entram em MUSICAS. */
(() => {
  const ARQUIVOS = {};   // ex.: { compra: 'assets/audio/compra.mp3', venda: 'assets/audio/venda.mp3' }
  const MUSICAS = { intro: 'assets/audio/musica_intro.mp3', jogo: 'assets/audio/musica_jogo.mp3' };   // intro: só na história e no tutorial; jogo: o resto, sem trocar por aba
  const KEY = 'astromercante_audio', def = { mus: true, vm: .15, vs: .8 };
  let cfg = { ...def }; try { cfg = { ...def, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
  const salva = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };
  const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches || (typeof S !== 'undefined' && S.fx === false);
  let ac = null, mestre = null;
  const ctx = () => { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); mestre = ac.createGain(); mestre.connect(ac.destination); } if (ac.state === 'suspended') ac.resume(); mestre.gain.value = cfg.vs; return ac; };
  const rnd = (a = .03) => 1 + (Math.random() * 2 - 1) * a;   // variação leve de tom para não cansar
  function tom(t0, f, d, { tipo = 'sine', v = .18, f2, atk = .005 } = {}) {
    const a = ac, o = a.createOscillator(), g = a.createGain(); o.type = tipo; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
    g.gain.setValueAtTime(.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + atk); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); o.connect(g).connect(mestre); o.start(t0); o.stop(t0 + d + .02);
  }
  function ruido(t0, d, { v = .12, f0 = 800, f1 = 200, q = 1 } = {}) {
    const a = ac, n = Math.max(1, Math.floor(a.sampleRate * d)), b = a.createBuffer(1, n, a.sampleRate), x = b.getChannelData(0); for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(); s.buffer = b; const fl = a.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t0); fl.frequency.exponentialRampToValueAtTime(f1, t0 + d);
    const g = a.createGain(); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); s.connect(fl).connect(g).connect(mestre); s.start(t0); s.stop(t0 + d + .02);
  }
  const SINT = {
    compra: t => { const p = rnd(); tom(t, 740 * p, .09, { tipo: 'triangle' }); tom(t + .07, 1110 * p, .16, { tipo: 'triangle' }); },
    venda: t => { const p = rnd(); [988, 1319, 1760].forEach((f, i) => tom(t + i * .06, f * p, .14, { tipo: 'triangle', v: .15 })); tom(t + .2, 2637 * p, .25, { v: .06 }); },
    viagem: t => { ruido(t, .9, { v: .16, f0: 200, f1: 2600, q: .8 }); tom(t, 110, .9, { tipo: 'sawtooth', v: .05, f2: 520 }); },
    chegada: t => { ruido(t, .6, { v: .1, f0: 1800, f1: 220, q: .8 }); tom(t + .25, 660 * rnd(), .35, { v: .12 }); tom(t + .4, 880 * rnd(), .4, { v: .1 }); },
    patente: t => { [523, 659, 784, 1047].forEach((f, i) => { tom(t + i * .13, f, .3, { tipo: 'square', v: .09 }); tom(t + i * .13, f / 2, .3, { tipo: 'triangle', v: .1 }); }); [523, 659, 784, 1047].forEach(f => tom(t + .6, f, 1.1, { tipo: 'triangle', v: .09 })); },
    conquista: t => { [784, 988, 1175, 1568, 1976].forEach((f, i) => tom(t + i * .07, f * rnd(.01), .22, { v: .12 })); },
    selo1: t => { [659, 880].forEach((f, i) => tom(t + i * .1, f, .22, { tipo: 'triangle', v: .12 })); tom(t + .22, 1319, .5, { v: .07 }); },
    selo2: t => { [523, 659, 784, 1047].forEach((f, i) => tom(t + i * .09, f, .24, { tipo: 'triangle', v: .12 })); [1047, 1319].forEach(f => tom(t + .4, f, .8, { v: .06 })); },
    selo3: t => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tom(t + i * .08, f, .3, { tipo: 'square', v: .07 }); tom(t + i * .08, f / 2, .3, { tipo: 'triangle', v: .09 }); }); [1047, 1319, 1568, 2093].forEach((f, i) => tom(t + .55 + i * .02, f, 1.4, { v: .06 })); for (let i = 0; i < 6; i++) tom(t + .7 + i * .09, 2637 + i * 180, .12, { v: .04 }); },
    alerta: t => { [440, 330, 440, 330].forEach((f, i) => tom(t + i * .14, f, .12, { tipo: 'square', v: .09 })); },
    tiro: t => { for (let i = 0; i < 3; i++) { const u = t + i * .13; tom(u, 1400 * rnd(.08), .11, { tipo: 'sawtooth', v: .09, f2: 160 }); ruido(u, .06, { v: .08, f0: 3000, f1: 900 }); } },
    vitoria: t => { [523, 659, 784].forEach((f, i) => tom(t + i * .1, f, .18, { tipo: 'square', v: .08 })); tom(t + .3, 1047, .5, { tipo: 'triangle', v: .12 }); },
    derrota: t => { [392, 349, 311, 233].forEach((f, i) => tom(t + i * .16, f, .22, { tipo: 'sawtooth', v: .08 })); },
    rugido: t => { const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95 * rnd(.1), t); o.frequency.exponentialRampToValueAtTime(48, t + .9); l.frequency.value = 22; lg.gain.value = 30; l.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.2, t + .08); g.gain.exponentialRampToValueAtTime(.0001, t + .95); o.connect(g).connect(mestre); o.start(t); l.start(t); o.stop(t + 1); l.stop(t + 1); ruido(t, .7, { v: .06, f0: 300, f1: 90 }); }
  };
  const cache = {};
  function arquivo(nome) {
    if (!cache[nome]) { const a = new Audio(ARQUIVOS[nome]); a.preload = 'auto'; cache[nome] = a; }
    const a = cache[nome].cloneNode(); a.volume = cfg.vs; a.play().catch(() => {});
  }
  function toca(nome, atraso = 0) {
    if (typeof S === 'undefined' || !S.sound) return;
    try { if (ARQUIVOS[nome]) { setTimeout(() => arquivo(nome), atraso * 1000); } else { const a = ctx(); if (SINT[nome]) SINT[nome](a.currentTime + atraso + .01); } } catch {}
  }
  window.SND = { toca };

  /* música: em loop, baixinha, a faixa da abertura (história e tutorial) e a do jogo; pausa quando a aba some */
  const temMus = () => !!(MUSICAS.intro || MUSICAS.jogo);
  const faixas = {}; let atual = '', alvo = '';
  const vol = () => (cfg.mus && S.sound !== false ? cfg.vm : 0);
  function faixa(k) { const src = MUSICAS[k] || MUSICAS.jogo || MUSICAS.intro; if (!src) return null; const id = src; if (!faixas[id]) { const a = new Audio(src); a.loop = true; a.volume = 0; a.preload = 'none'; a.onerror = () => { MUSICAS.intro = MUSICAS.jogo = null; }; faixas[id] = a; } return faixas[id]; }
  function musicaTick() {
    if (!temMus() || typeof S === 'undefined') return;
    const b = document.body.classList, k = b.contains('histon') || b.contains('tuton') ? 'intro' : 'jogo', a = faixa(k), mudo = document.hidden || !cfg.mus || !S.sound || document.body.classList.contains('gated');
    Object.entries(faixas).forEach(([id, f]) => {   // fade suave entre as faixas
      const ativa = a && f === a && !mudo, meta = ativa ? vol() : 0, v = f.volume + (meta - f.volume) * .06;
      f.volume = Math.min(1, Math.max(0, Math.abs(meta - v) < .005 ? meta : v));
      if (ativa && f.paused && userTocou) f.play().catch(() => {}); else if (!ativa && f.volume === 0 && !f.paused) f.pause();
    });
    if (a && !mudo && a.paused && userTocou) a.play().catch(() => {});
  }
  let userTocou = false; addEventListener('pointerdown', () => { userTocou = true; }, { once: true });
  setInterval(musicaTick, 120);
  // botão rápido de música no cabeçalho
  const acts = document.querySelector('.hud-acts');
  if (acts && temMus()) { const b = document.createElement('button'); b.type = 'button'; b.className = 'mus-btn'; b.id = 'hud-mus'; acts.prepend(b);
    const pinta = () => { b.innerHTML = `<i class="fa-solid ${cfg.mus ? 'fa-volume-low' : 'fa-volume-xmark'}"></i>`; b.setAttribute('aria-label', cfg.mus ? 'Desligar música' : 'Ligar música'); b.title = b.getAttribute('aria-label'); b.classList.toggle('off', !cfg.mus); const c = $('#set-mus'); if (c) c.checked = cfg.mus; };
    b.onclick = () => { cfg.mus = !cfg.mus; salva(); pinta(); }; pinta(); const c = $('#set-mus'); if (c) c.addEventListener('change', pinta); }
  // configurações: só aparecem quando há música cadastrada
  const linha = $('#set-mus-row');
  if (linha) { linha.hidden = !temMus(); $('#set-mus').checked = cfg.mus; $('#set-vm').value = Math.round(cfg.vm * 100);
    $('#set-mus').onchange = e => { cfg.mus = e.target.checked; salva(); }; $('#set-vm').oninput = e => { cfg.vm = e.target.value / 100; salva(); }; }

  /* o som certo para cada mensagem do servidor (compra, venda, viagem, chegada, patente, combate…) */
  let ultima = '';
  window.sfx = function (k) {
    const m = ultima; let s = null;
    if (/^Comprou|adquirida|Upgrade instalado/.test(m)) s = 'compra';
    else if (/^Vendeu/.test(m)) s = 'venda';
    else if (/^Rumo a/.test(m)) s = 'viagem';
    else if (/^Chegada em|Salto concluído/.test(m)) s = 'chegada';
    else if (/Nova patente/.test(m)) s = 'patente';
    else if (/Missão cumprida|Bônus (diário|de exploração)/.test(m)) s = 'conquista';
    else if (/derrotados pelo seu poder/.test(m)) { if (/Monstro|Leviat/.test(m)) toca('rugido'); toca('tiro'); s = 'vitoria'; }
    else if (/venceram: seu poder/.test(m)) { if (/Monstro|Leviat/.test(m)) toca('rugido'); toca('tiro'); s = 'derrota'; }
    else if (/recuaram: luta empatada/.test(m)) s = 'tiro';
    else s = { win: 'conquista', err: 'derrota', alert: 'alerta' }[k] || null;
    if (s) toca(s, s === 'vitoria' || s === 'derrota' ? .45 : 0);
    if (S.sound && (k === 'err' || k === 'win')) navigator.vibrate?.(k === 'err' ? [60, 40, 60] : [40, 30, 80]);
  };
  const dizer = window.say; window.say = function (msg, kind) { ultima = String(msg); try { if (/Nova patente/.test(ultima)) subiu(ultima); } catch {} try { return dizer.apply(this, arguments); } finally { ultima = ''; } };

  /* +Cr / −Cr flutuando sobre o saldo do cabeçalho */
  let c0 = null;
  setInterval(() => {
    if (typeof S === 'undefined' || !READY || document.body.classList.contains('loading')) { c0 = null; return; }
    const c = S.credits; if (c0 === null) { c0 = c; return; } const d = c - c0; c0 = c;
    if (Math.abs(d) < 1 || document.hidden) return;
    const alvoEl = $('#hud-credits'); if (!alvoEl) return; alvoEl.classList.remove('fx-pulse'); void alvoEl.offsetWidth; alvoEl.classList.add('fx-pulse');
    if (reduz()) return; const r = alvoEl.getBoundingClientRect(), el = document.createElement('div');
    el.className = 'fx-float ' + (d > 0 ? 'mais' : 'menos'); el.textContent = (d > 0 ? '+' : '−') + Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' Cr'; el.style.top = (r.bottom + 2) + 'px'; el.style.left = '8px';
    document.body.appendChild(el); el.style.left = Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8)) + 'px';   // nunca sai da tela nem quebra de linha setTimeout(() => el.remove(), 1500);
  }, 250);

  /* tela de subida de patente */
  function subiu(msg) {
    const m = /Nova patente: (.+?)! Desbloqueado: (.+?)\.$/.exec(msg) || [], nome = m[1] || 'Nova patente', lista = (m[2] && m[2] !== '—') ? m[2] : '';
    const el = document.createElement('div'); el.className = 'rankup'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Nova patente');
    let conf = ''; if (!reduz()) for (let i = 0; i < 28; i++) conf += `<i style="left:${Math.random() * 100}%;animation-delay:${(Math.random() * .8).toFixed(2)}s;animation-duration:${(2 + Math.random() * 1.6).toFixed(2)}s;background:hsl(${Math.floor(Math.random() * 360)} 90% 60%)"></i>`;
    el.innerHTML = `<div class="ru-conf">${conf}</div><div class="ru-box"><small>NOVA PATENTE</small><h2></h2>${lista ? '<p class="ru-un">Desbloqueado: <b></b></p>' : ''}<button type="button" class="buy">Continuar</button></div>`;
    el.querySelector('h2').textContent = nome; if (lista) el.querySelector('b').textContent = lista;
    el.querySelector('button').onclick = () => el.remove(); document.body.appendChild(el); el.querySelector('button').focus();
  }
})();
