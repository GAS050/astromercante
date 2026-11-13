/* Banner de conquista: aparece no alto da tela quando um selo sobe de nível (não trava o jogo; toque para ver o perfil).
   O servidor só informa os níveis atuais (/selos); o aparelho compara com os que já viu e mostra um banner por subida.
   Na primeira vez que abre num aparelho, só memoriza o que já existe (ninguém leva uma enxurrada de banners antigos). */
(() => {
  const fila = []; let ativo = false, ultimo = 0, busy = false;
  const chave = () => 'astromercante_selos_' + (typeof PF !== 'undefined' && PF && PF.id ? PF.id : '');
  const ler = () => { try { return JSON.parse(localStorage.getItem(chave()) || 'null'); } catch { return null; } };
  const gravar = o => { try { localStorage.setItem(chave(), JSON.stringify(o)); } catch {} };
  const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches || (typeof S !== 'undefined' && S.fx === false);
  const num = v => (typeof fmt === 'function' ? fmt(v).replace(',00', '') : String(v));

  function mostrar(f, n) {
    const C = SEL[f]; if (!C || !(n >= 1 && n <= 3)) return;
    const el = document.createElement('div'); el.className = `conq conq-t${n}`; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    let faiscas = ''; if (!reduz()) for (let i = 0, k = 10 + n * 6; i < k; i++) { const a = Math.random() * 6.283, d = 38 + Math.random() * 62; faiscas += `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--dl:${(Math.random() * .25).toFixed(2)}s;--sz:${(3 + Math.random() * 4).toFixed(1)}px"></i>`; }
    el.innerHTML = `<div class="cq-medal"><span class="cq-rays"></span><span class="cq-ring"></span><i class="fa-solid ${C.ic}"></i><em>${ROM[n]}</em><span class="cq-sp">${faiscas}</span></div>`
      + `<div class="cq-txt"><small>${n === 1 ? 'NOVO SELO' : 'SELO EVOLUÍDO'}</small><b></b><span></span></div><span class="cq-shine"></span>`;
    el.querySelector('b').textContent = `${C.n} ${ROM[n]}`; el.querySelector('.cq-txt span').textContent = `${num(C.lim[n - 1])} ${C.un}`;
    const sai = (abrir) => { if (el._t) clearTimeout(el._t); el.classList.add('sai'); setTimeout(() => { el.remove(); ativo = false; prox(); }, 450); if (abrir === true && typeof abrirJogador === 'function' && PF && PF.id) abrirJogador(PF.id); };
    el.onclick = () => sai(true); el.tabIndex = 0; el.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Escape') sai(e.key === 'Enter'); };
    document.body.appendChild(el);
    try { window.SND && SND.toca('selo' + n); if (typeof S !== 'undefined' && S.sound) navigator.vibrate?.(n === 3 ? [50, 40, 50, 40, 120] : [40, 30, 70]); } catch {}
    el._t = setTimeout(() => sai(false), n === 3 ? 7000 : 5500);
  }
  function prox() { if (ativo || !fila.length) return; ativo = true; const [f, n] = fila.shift(); setTimeout(() => mostrar(f, n), 350); }
  window.mostrarSelo = (f, n) => { fila.push([f, n]); prox(); };   // também serve para testar: mostrarSelo('camp', 3)

  async function checar(forca) {
    if (busy || !TOK || !CLOUD() || !READY || typeof PF === 'undefined' || !PF || !PF.id || document.hidden) return;
    if (!forca && Date.now() - ultimo < 8000) return; busy = true; ultimo = Date.now();
    try {
      const r = await api('/selos'), atual = {}; for (const e of r.selos || []) atual[e.f] = e.n;
      const vistos = ler();
      if (vistos) for (const f in atual) if (atual[f] > (vistos[f] || 0)) for (let n = (vistos[f] || 0) + 1; n <= atual[f]; n++) fila.push([f, n]);
      gravar({ ...(vistos || {}), ...atual }); prox();
    } catch {} busy = false;
  }
  setInterval(checar, 20000); setTimeout(checar, 6000);
  if (typeof act === 'function') { const _act = act; act = async function (...a) { const r = await _act.apply(this, a); if (r) setTimeout(checar, 1200); return r; }; }
})();
