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
  const ctx = () => { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); mestre = ac.createGain(); mestre.gain.value = .6; mestre.connect(ac.destination); try { const n = Math.floor(ac.sampleRate * .7), ir = ac.createBuffer(2, n, ac.sampleRate); for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); } const cv = ac.createConvolver(), w = ac.createGain(); cv.buffer = ir; w.gain.value = .22; mestre.connect(cv); cv.connect(w); w.connect(ac.destination); } catch {} } if (ac.state === 'suspended') ac.resume(); mestre.gain.value = cfg.vs * .7; return ac; };   // -30%: volume geral dos efeitos
  const rnd = (a = .03) => 1 + (Math.random() * 2 - 1) * a;   // variação leve de tom para não cansar
  // Timbre suave: tudo passa por um filtro passa-baixa e os sons de "sino" têm só o fundamental + harmônicos discretos.
  function tom(t0, f, d, { tipo = 'sine', v = .18, f2, atk = .008, lp = 2600, dest } = {}) {
    const a = ac, o = a.createOscillator(), g = a.createGain(), fl = a.createBiquadFilter(); o.type = tipo; fl.type = 'lowpass'; fl.frequency.value = Math.max(lp, f * 1.5); fl.Q.value = .5;
    o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
    g.gain.setValueAtTime(.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + atk); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); o.connect(fl).connect(g).connect(dest || mestre); o.start(t0); o.stop(t0 + d + .02);
  }
  const sino = (t0, f, d = .5, v = .16) => { tom(t0, f, d, { v, atk: .01 }); tom(t0, f * 2, d * .6, { v: v * .22, atk: .01 }); tom(t0, f * 3.01, d * .3, { v: v * .07, atk: .01 }); };   // sino macio
  function ruido(t0, d, { v = .12, f0 = 800, f1 = 200, q = 1, tipo = 'bandpass', atk = 0 } = {}) {
    const a = ac, n = Math.max(1, Math.floor(a.sampleRate * d)), b = a.createBuffer(1, n, a.sampleRate), x = b.getChannelData(0); for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(); s.buffer = b; const fl = a.createBiquadFilter(); fl.type = tipo; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t0); fl.frequency.exponentialRampToValueAtTime(f1, t0 + d);
    const g = a.createGain(); if (atk) { g.gain.setValueAtTime(.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + atk); } else g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); s.connect(fl).connect(g).connect(mestre); s.start(t0); s.stop(t0 + d + .02);
  }
  const SINT = {
    // contratos: carimbo grave + sino (aceitar), moeda tilintando (entrega), fanfarra curta (cumprido)
    aceito: t => { tom(t, 140, .16, { v: .16, f2: 90, lp: 700, atk: .004 }); sino(t + .1, 440, .3, .12); sino(t + .2, 660, .45, .12); },
    entrega: t => { const p = rnd(.01); sino(t, 988 * p, .22, .12); sino(t + .07, 1319 * p, .3, .12); sino(t + .15, 1760 * p, .4, .07); },
    cumprido: t => { [523, 659, 784, 1047].forEach((f, i) => sino(t + i * .09, f, .35, .12)); [523, 659, 784].forEach(f => tom(t + .4, f, 1.1, { v: .06, atk: .05 })); sino(t + .5, 1568, .9, .09); },
    compra: t => { const p = rnd(); sino(t, 523 * p, .22, .15); sino(t + .08, 659 * p, .36, .15); },
    venda: t => { const p = rnd(); [659, 784, 988].forEach((f, i) => sino(t + i * .07, f * p, .3, .12)); sino(t + .24, 1319 * p, .4, .06); },
    // partida: ignição grave, rumor subindo e jato de ar suave (como uma nave decolando)
    viagem: t => { tom(t, 90, .35, { v: .22, f2: 38, lp: 400, atk: .01 }); tom(t + .1, 45, 1.1, { v: .12, f2: 130, lp: 500, atk: .25 }); ruido(t + .05, 1.2, { v: .22, f0: 120, f1: 1500, q: .6, tipo: 'lowpass', atk: .4 }); ruido(t + .35, .8, { v: .05, f0: 900, f1: 2400, q: .7, atk: .3 }); },
    chegada: t => { ruido(t, .55, { v: .16, f0: 1400, f1: 140, q: .6, tipo: 'lowpass', atk: .08 }); sino(t + .32, 392 * rnd(), .5, .13); sino(t + .5, 523 * rnd(), .7, .13); },
    patente: t => { [262, 330, 392, 523].forEach((f, i) => sino(t + i * .15, f, .6, .13)); [262, 330, 392, 523].forEach(f => tom(t + .7, f, 1.3, { v: .07, atk: .08 })); },
    conquista: t => { [523, 659, 784, 1047, 1319].forEach((f, i) => sino(t + i * .08, f * rnd(.01), .34, .11)); },
    selo1: t => { [440, 587].forEach((f, i) => sino(t + i * .12, f, .4, .12)); sino(t + .26, 880, .7, .07); },
    selo2: t => { [392, 494, 587, 784].forEach((f, i) => sino(t + i * .1, f, .45, .12)); [392, 494, 587].forEach(f => tom(t + .42, f, 1, { v: .06, atk: .06 })); },
    selo3: t => { [262, 330, 392, 523, 659, 784].forEach((f, i) => sino(t + i * .1, f, .55, .1)); [262, 330, 392, 523, 659].forEach(f => tom(t + .65, f, 1.6, { v: .06, atk: .1 })); sino(t + .9, 1047, 1.2, .06); },
    ok: t => { sino(t, 523, .2, .13); sino(t + .08, 659, .3, .13); },
    err: t => { tom(t, 196, .22, { v: .16, f2: 147, lp: 700 }); tom(t + .12, 147, .26, { v: .13, f2: 110, lp: 600 }); },
    win: t => { [392, 494, 587, 784].forEach((f, i) => sino(t + i * .1, f, i === 3 ? .6 : .25, .12)); },
    alerta: t => { [523, 392, 523, 392].forEach((f, i) => sino(t + i * .15, f, .22, .1)); },
    // tiros: "pew" curtinho e redondo, sem atraso (4 disparos bem juntos)
    tiro: t => { for (let i = 0; i < 4; i++) { const u = t + i * .085, p = rnd(.12); tom(u, 880 * p, .12, { v: .13, f2: 200, lp: 1800, atk: .002 }); tom(u, 440 * p, .1, { v: .07, f2: 110, lp: 1200, atk: .002 }); ruido(u, .04, { v: .035, f0: 1800, f1: 500, tipo: 'lowpass' }); } },
    vitoria: t => { [392, 494, 587].forEach((f, i) => sino(t + i * .11, f, .3, .11)); sino(t + .34, 784, .9, .13); },
    derrota: t => { [294, 262, 233, 196].forEach((f, i) => tom(t + i * .18, f, .34, { v: .11, lp: 800, atk: .02 })); },
    rugido: t => { const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain(), fl = ac.createBiquadFilter(); o.type = 'sawtooth'; fl.type = 'lowpass'; fl.frequency.value = 380; o.frequency.setValueAtTime(95 * rnd(.1), t); o.frequency.exponentialRampToValueAtTime(48, t + .9); l.frequency.value = 22; lg.gain.value = 30; l.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.2, t + .08); g.gain.exponentialRampToValueAtTime(.0001, t + .95); o.connect(fl).connect(g).connect(mestre); o.start(t); l.start(t); o.stop(t + 1); l.stop(t + 1); ruido(t, .7, { v: .05, f0: 300, f1: 90, tipo: 'lowpass' }); }
  };
  const cache = {};
  function arquivo(nome) {
    if (!cache[nome]) { const a = new Audio(ARQUIVOS[nome]); a.preload = 'auto'; cache[nome] = a; }
    const a = cache[nome].cloneNode(); a.volume = Math.min(1, cfg.vs * .6); a.play().catch(() => {});
  }
  /* Todos os efeitos saem no mesmo volume: cada um tem um ganho medido (RMS alvo igual), para nenhum "estourar" mais que os outros. */
  const NORM = { compra: 0.65, venda: 0.74, viagem: 0.61, chegada: 0.86, patente: 0.66, conquista: 0.67, selo1: 0.89, selo2: 0.71, selo3: 0.68, ok: 0.74, err: 0.72, win: 0.79, alerta: 0.99, tiro: 0.69, vitoria: 0.79, derrota: 0.87, rugido: 0.71 };
  function sintetiza(nome, t) { const a = ac, m0 = mestre, bus = a.createGain(); bus.gain.value = NORM[nome] || .5; bus.connect(m0); mestre = bus; try { SINT[nome](t); } finally { mestre = m0; } }
  function toca(nome, atraso = 0) {
    if (typeof S === 'undefined' || !S.sound) return;
    try { if (ARQUIVOS[nome]) { setTimeout(() => arquivo(nome), atraso * 1000); } else { const a = ctx(); if (SINT[nome]) sintetiza(nome, a.currentTime + atraso + .01); } } catch {}
  }
  window.SND = { toca };

  /* música: em loop, baixinha, a faixa da abertura (história e tutorial) e a do jogo; pausa quando a aba some */
  const temMus = () => !!(MUSICAS.intro || MUSICAS.jogo);
  const faixas = {}; let atual = '', alvo = '';
  const vol = () => (cfg.mus && S.sound !== false ? cfg.vm * .35 : 0);   // ganho geral mais baixo: o controle do jogador continua de 0 a 100%
  function faixa(k) { const src = MUSICAS[k] || MUSICAS.jogo || MUSICAS.intro; if (!src) return null; const id = src; if (!faixas[id]) { const a = new Audio(src); a.loop = true; a.volume = 0; a.preload = 'none'; a.onerror = () => { MUSICAS.intro = MUSICAS.jogo = null; }; faixas[id] = a; } return faixas[id]; }
  function musicaTick() {
    if (!temMus() || typeof S === 'undefined') return;
    const b = document.body.classList, k = b.contains('histon') || b.contains('tuton') || b.contains('gated') ? 'intro' : 'jogo', a = faixa(k), mudo = document.hidden || !cfg.mus || !S.sound;   // na tela de login toca a faixa de abertura; ela segue na história sem recomeçar
    Object.entries(faixas).forEach(([id, f]) => {   // fade suave entre as faixas
      const ativa = a && f === a && !mudo, meta = ativa ? vol() : 0, v = f.volume + (meta - f.volume) * .06;
      f.volume = Math.min(1, Math.max(0, Math.abs(meta - v) < .005 ? meta : v));
      if (ativa && f.paused && userTocou) f.play().catch(() => {}); else if (!ativa && f.volume === 0 && !f.paused) f.pause();
    });
    if (a && !mudo && a.paused && userTocou) a.play().catch(() => {});
  }
  let userTocou = false; const destrava = () => { userTocou = true; try { ctx(); } catch {} }; addEventListener('pointerdown', destrava, { once: true }); addEventListener('keydown', destrava, { once: true });   // já deixa o áudio pronto no primeiro toque: o primeiro som não atrasa
  setInterval(musicaTick, 120);
  // botão rápido de música no cabeçalho
  const acts = document.querySelector('.hud-acts');
  if (acts && temMus()) { const b = document.createElement('button'); b.type = 'button'; b.className = 'mus-btn'; b.id = 'hud-mus'; acts.prepend(b);
    const pinta = () => { b.innerHTML = `<i class="fa-solid ${cfg.mus ? 'fa-volume-low' : 'fa-volume-xmark'}"></i>`; b.setAttribute('aria-label', cfg.mus ? 'Desligar música' : 'Ligar música'); b.title = b.getAttribute('aria-label'); b.classList.toggle('off', !cfg.mus); const c = $('#set-mus'); if (c) c.checked = cfg.mus; };
    b.onclick = () => { cfg.mus = !cfg.mus; salva(); pinta(); }; pinta(); const c = $('#set-mus'); if (c) c.addEventListener('change', pinta); }
  // botão de som da tela de login (o do cabeçalho só existe depois de entrar)
  const lpm = $('#lp-mus');
  if (lpm && temMus()) { const pl = () => { lpm.innerHTML = `<i class="fa-solid ${cfg.mus ? 'fa-volume-high' : 'fa-volume-xmark'}"></i>`; lpm.classList.toggle('off', !cfg.mus); lpm.setAttribute('aria-label', cfg.mus ? 'Desligar música' : 'Ligar música'); lpm.title = lpm.getAttribute('aria-label'); const h = $('#hud-mus'); if (h) h.dispatchEvent(new Event('mus')); };
    lpm.onclick = () => { cfg.mus = !cfg.mus; salva(); pl(); const c = $('#set-mus'); if (c) c.checked = cfg.mus; }; pl(); }
  // configurações: só aparecem quando há música cadastrada
  const linha = $('#set-mus-row');
  if (linha) { linha.hidden = !temMus(); $('#set-mus').checked = cfg.mus; $('#set-vm').value = Math.round(cfg.vm * 100);
    $('#set-mus').onchange = e => { cfg.mus = e.target.checked; salva(); }; $('#set-vm').oninput = e => { cfg.vm = e.target.value / 100; salva(); }; }

  /* o som certo para cada mensagem do servidor (compra, venda, viagem, chegada, patente, combate…) */
  let ultima = '';
  window.sfx = function (k) {
    const m = ultima; let s = null;
    if (/^Contrato ATIVO/.test(m)) s = 'aceito';
    else if (/^Entregou /.test(m)) s = 'entrega';
    else if (/^Contrato cumprido/.test(m)) s = 'cumprido';
    else if (/^Comprou|adquirida|Upgrade instalado/.test(m)) s = 'compra';
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
