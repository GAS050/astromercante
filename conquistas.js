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

  /** Monta e anima um banner. t: 1–3 (bronze, prata, ouro); sel: { ic, em, kicker, titulo, sub, som, abre }. */
  function banner(t, o) {
    const el = document.createElement('div'); el.className = `conq conq-t${t}`; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    let faiscas = ''; if (!reduz()) for (let i = 0, k = 10 + t * 6; i < k; i++) { const a = Math.random() * 6.283, d = 38 + Math.random() * 62; faiscas += `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--dl:${(Math.random() * .25).toFixed(2)}s;--sz:${(3 + Math.random() * 4).toFixed(1)}px"></i>`; }
    el.innerHTML = `<div class="cq-medal"><span class="cq-rays"></span><span class="cq-ring"></span><i class="fa-solid ${o.ic}"></i>${o.em ? `<em>${o.em}</em>` : ''}<span class="cq-sp">${faiscas}</span></div>`
      + `<div class="cq-txt"><small></small><b></b><span></span></div><span class="cq-shine"></span>`;
    el.querySelector('small').textContent = o.kicker; el.querySelector('b').textContent = o.titulo; el.querySelector('.cq-txt span').textContent = o.sub;
    const sai = (abrir) => { if (el._t) clearTimeout(el._t); el.classList.add('sai'); setTimeout(() => { el.remove(); ativo = false; prox(); }, 450); if (abrir === true) o.abre && o.abre(); };
    el.onclick = () => sai(true); el.tabIndex = 0; el.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Escape') sai(e.key === 'Enter'); };
    document.body.appendChild(el);
    try { window.SND && SND.toca('selo' + t); if (typeof S !== 'undefined' && S.sound) navigator.vibrate?.(t === 3 ? [50, 40, 50, 40, 120] : [40, 30, 70]); } catch {}
    el._t = setTimeout(() => sai(false), t === 3 ? 7000 : 5500);
  }
  const abrirMeu = () => { if (typeof abrirJogador === 'function' && PF && PF.id) abrirJogador(PF.id); };
  function mostrar(f, n) {
    const C = SEL[f]; if (!C || !(n >= 1 && n <= 3)) return;
    banner(n, { ic: C.ic, em: ROM[n], kicker: n === 1 ? 'NOVO SELO' : 'SELO EVOLUÍDO', titulo: `${C.n} ${ROM[n]}`, sub: `${num(C.lim[n - 1])} ${selUn(C, C.lim[n - 1])}`, abre: abrirMeu });
  }
  function mostrarConq(q, extra) {   // r: 1–2 bronze, 3 prata, 4–5 ouro
    banner(q.r >= 4 ? 3 : q.r === 3 ? 2 : 1, { ic: q.ic, em: '', kicker: 'CONQUISTA DESBLOQUEADA', titulo: q.n, sub: q.d + (extra ? ` · +${extra} ${extra === 1 ? 'outra' : 'outras'} no perfil` : ''), abre: () => abrirConquistas(PF.id, PF.apelido) });
  }
  function prox() { if (ativo || !fila.length) return; ativo = true; const [f, n, x] = fila.shift(); setTimeout(() => (f === 'c' ? mostrarConq(n, x) : mostrar(f, n)), 350); }
  window.mostrarSelo = (f, n) => { fila.push([f, n]); prox(); };
  window.mostrarConquista = async (id) => { const q = (await cqCatalogo()).catalogo.find(x => x.id === id); if (q) { fila.push(['c', q, 0]); prox(); } };   // também serve para testar: mostrarSelo('camp', 3)

  async function checar(forca) {
    if (busy || !TOK || !CLOUD() || !READY || typeof PF === 'undefined' || !PF || !PF.id || document.hidden) return;
    if (!forca && Date.now() - ultimo < 8000) return; busy = true; ultimo = Date.now();
    try {
      const r = await api('/selos'), atual = {}; for (const e of r.selos || []) atual[e.f] = e.n;
      const vistos = ler();
      if (vistos) for (const f in atual) if (atual[f] > (vistos[f] || 0)) for (let n = (vistos[f] || 0) + 1; n <= atual[f]; n++) fila.push([f, n]);
      const cv = ler(), ids = r.conq || [], antes = (cv && cv.c) || null;   // conquistas: 1ª vez no aparelho só memoriza
      if (antes && ids.length) { const novas = ids.filter(x => !antes.includes(x)); if (novas.length) { const cat = (await cqCatalogo()).catalogo, qs = novas.map(x => cat.find(q => q.id === x)).filter(Boolean).sort((a, b) => b.r - a.r || b.g - a.g), mostra = qs.slice(0, 3); mostra.forEach((q, i) => fila.push(['c', q, i === mostra.length - 1 ? qs.length - mostra.length : 0])); } }
      gravar({ ...(vistos || {}), ...atual, c: ids.length ? ids : antes || [] }); prox();
    } catch {} busy = false;
  }
  setInterval(checar, 20000); setTimeout(checar, 6000);
  if (typeof act === 'function') { const _act = act; act = async function (...a) { const r = await _act.apply(this, a); if (r) setTimeout(checar, 1200); return r; }; }
})();

/* Janela "Conquistas": as 100, com ganhas em destaque e bloqueadas em cinza (com barra de progresso, só no próprio perfil). */
let CQ = null;
const CQ_R = ['Comum', 'Incomum', 'Rara', 'Épica', 'Lendária'];
async function cqCatalogo() { if (!CQ) CQ = await api('/conquistas'); return CQ; }
let cqD = null, cqCat = 'todas', cqEst = 'todas', cqNome = '';
const cqM = document.querySelector('#conqs'), cqB = document.querySelector('#cqm-b'), cqEs = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cqN = v => fmt(v).replace(',00', '');
function cqRender() {
  const d = cqD; if (!d) return; const on = new Set(d.ganhas), cats = Object.entries(d.categorias), eu = !!d.prog;
  const lista = d.catalogo.filter(q => (cqCat === 'todas' || q.c === cqCat) && (cqEst === 'todas' || (cqEst === 'ganhas') === on.has(q.id)));
  const pc = Math.round(on.size / d.total * 100);
  document.querySelector('#cqm-t').textContent = cqNome ? 'Conquistas de ' + cqNome : 'Conquistas';
  const chip = (k, t, n, tot) => `<button type="button" class="cq-chip${cqCat === k ? ' on' : ''}" data-cc="${k}">${t}<small>${n}/${tot}</small></button>`;
  cqB.innerHTML = `<div class="cqm-top"><b>${on.size}<small>/${d.total}</small></b><div><div class="cq-prog"><i style="width:${Math.max(on.size ? 2 : 0, pc)}%"></i></div><small>${pc}% concluído${eu ? '' : ' · o progresso das bloqueadas só aparece no próprio perfil'}</small></div></div>`
    + `<div class="cqm-f">${chip('todas', 'Todas', on.size, d.total)}${cats.map(([k, t]) => chip(k, t, d.catalogo.filter(q => q.c === k && on.has(q.id)).length, d.catalogo.filter(q => q.c === k).length)).join('')}</div>`
    + `<div class="cqm-e">${[['todas', 'Todas'], ['ganhas', 'Conquistadas'], ['faltam', 'Bloqueadas']].map(([k, t]) => `<button type="button" class="${cqEst === k ? 'on' : ''}" data-ce="${k}">${t}</button>`).join('')}</div>`
    + `<div class="cqm-g">${lista.map(q => { const ok = on.has(q.id), v = eu ? Math.min(d.prog[q.m] || 0, q.g) : 0, p = Math.round(v / q.g * 100);
      return `<div class="cqc r${q.r} ${ok ? 'on' : 'off'}"><span class="cqi r${q.r}"><i class="fa-solid ${ok ? cqEs(q.ic) : 'fa-lock'}"></i></span><div><b>${cqEs(q.n)}</b><small>${cqEs(q.d)}</small>`
        + (ok ? `<em>${CQ_R[q.r - 1]}</em>` : eu ? `<div class="lj-bar"><i style="width:${Math.max(p ? 4 : 0, p)}%"></i></div><em>${cqN(v)} / ${cqN(q.g)}</em>` : `<em>${CQ_R[q.r - 1]}</em>`) + '</div></div>'; }).join('') || '<p class="empty">Nada por aqui.</p>'}</div>`;
}
async function abrirConquistas(id, nome) {
  if (!TOK) return; cqD = null; cqCat = 'todas'; cqEst = 'todas'; cqNome = (PF && id === PF.id) ? '' : (nome || ''); cqB.innerHTML = '<p class="empty">Carregando…</p>'; cqM.hidden = false;
  try { cqD = await api('/conquistas?id=' + id); CQ = CQ || { catalogo: cqD.catalogo, categorias: cqD.categorias }; cqRender(); } catch (e) { cqB.innerHTML = `<p class="au-err">${cqEs(e.message || 'Não foi possível abrir as conquistas.')}</p>`; }
}
cqM.addEventListener('click', e => {
  if (e.target === cqM || e.target.closest('#cqm-x')) { cqM.hidden = true; return; }
  const c = e.target.closest('[data-cc]'), s = e.target.closest('[data-ce]'); if (c) { cqCat = c.dataset.cc; cqRender(); } if (s) { cqEst = s.dataset.ce; cqRender(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !cqM.hidden) { cqM.hidden = true; e.stopPropagation(); } }, true);
document.querySelector('#pf-ver')?.addEventListener('click', () => { if (PF && PF.id) abrirJogador(PF.id); });
