/* Loja: naves, molduras e avatares. Categorias e busca à esquerda, produtos no centro, miniatura + botão de comprar no canto superior direito.
   O servidor confere preço, saldo, patente e posse; aqui só mostramos e pedimos. */
let LJ = null, ljTab = 'nave', ljSel = null, ljQ = '';
const ljFmt = n => Math.floor(n).toLocaleString('pt-BR');
const ljEsc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ljNorm = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ljRar = { 'comum': 0, 'raro': 1, 'épico': 2, 'lendário': 3, 'conquista': 4 };
/** Abre a aba Loja (quem chama de outro lugar, como o Hangar, vem por aqui). */
function abrirLoja(aba) {
  if (!TOK || !PF) return; if (aba) { ljTab = aba; ljQ = ''; $('#lj-q').value = ''; }
  if (document.body.dataset.view !== 'loja') document.querySelector('.nav [data-view=loja]').click(); else ljCarregar();
}
async function ljCarregar() {
  if (!TOK || !PF) return; $('#lj-err').textContent = ''; ljSel = null;
  try { LJ = await api('/loja'); PF = await api('/perfil').catch(() => PF); } catch (e) { LJ = null; $('#lj-err').textContent = e.message || 'Não foi possível abrir a loja.'; }
  ljRender();
}
function ljMiniNave(n, f) {
  const c = f ? f.c : 1, m = f ? f.m : 1, a = f ? f.a : 1;
  return `<div class="lj-nv"><img alt="" src="${nsrc(n.id, 'motor', m)}"><img alt="" src="${nsrc(n.id, 'casco')}"><img alt="" src="${nsrc(n.id, 'porao', c)}"><img alt="" src="${nsrc(n.id, 'armas', a)}"></div>`;
}
const LJ_ST = [
  { k: 'cap', ic: 'fa-boxes-stacked', rot: 'Porão', txt: 'mercadoria por viagem: mais lucro em cada carga', val: (n, f) => capDe(n, f ? f.c : 1), max: 922, mx: n => capDe(n, 5), fmt: v => v },
  { k: 'eng', ic: 'fa-bolt', rot: 'Motor', txt: 'viagens mais rápidas', val: (n, f) => engDe(n, f ? f.m : 1), max: 4.2, mx: n => engDe(n, 5), fmt: v => v.toFixed(1) },
  { k: 'wp', ic: 'fa-crosshairs', rot: 'Armas', txt: 'poder de fogo contra piratas e monstros', val: (n, f) => wpDe(n, f ? f.a : 1), max: 6, mx: n => wpDe(n, 5), fmt: v => v.toFixed(1) }
];
function ljStats(n) {
  const f = S.frota[n.id], at = NAVES[(S.nave || 1) - 1], fa = S.frota[S.nave];
  return `<div class="lj-stats"><ul class="lj-st">` + LJ_ST.map(t => {
    const v = t.val(n, f), w = Math.max(6, Math.round(Math.sqrt(v / t.max) * 100)), d = n.id === S.nave ? 0 : v - t.val(at, fa), dd = Math.round(d * 100) / 100;
    const cmp = n.id === S.nave ? '' : `<em class="${dd > 0 ? 'ljm' : dd < 0 ? 'ljn' : ''}">${dd > 0 ? '▲ +' : dd < 0 ? '▼ −' : '= '}${dd === 0 ? 'igual' : t.fmt(Math.abs(dd))}</em>`;
    return `<li title="${t.rot}: ${t.txt}"><i class="fa-solid ${t.ic}"></i><div><span>${t.rot} <b>${t.fmt(v)}</b> ${cmp}</span><div class="lj-bar"><i style="width:${w}%"></i></div><small>${t.txt} · no nível 5: <b>${t.fmt(t.mx(n))}</b></small></div></li>`;
  }).join('') + `</ul><p class="lj-note">Cada item sobe até o nível 5 com melhorias na aba Frotas. ▲▼ comparam com a sua nave equipada (nível atual).</p></div>`;
}
/** Junta naves (estado do jogo) e avatares/molduras (servidor) numa lista só, no mesmo formato. */
function ljItens() {
  const itens = [], emPartida = !!(S.partida);
  if (S.frota) for (const n of NAVES) {
    const f = S.frota[n.id], eq = n.id === S.nave, trav = !f && S.rank < n.rank;
    itens.push({ k: 'n' + n.id, tipo: 'nave', nome: n.nome, raridade: n.rank >= 6 ? 'lendário' : n.rank >= 4 ? 'épico' : n.rank >= 2 ? 'raro' : 'comum', preco: n.preco, tem: !!f, eq, cond: trav ? 'Patente ' + RANKS[n.rank][1] : '', bloq: emPartida,
      desc: f ? `Nv. ${f.c}/${f.m}/${f.a} · porão ${capDe(n, f.c)}` : `Porão ${n.cap0} · motor ${n.eng0.toFixed(1)} · armas ${n.wp0.toFixed(1)}`, thumb: ljMiniNave(n, f), id: n.id, stats: ljStats(n) });
  }
  if (LJ) for (const i of LJ.itens) {
    const eq = i.tipo === 'avatar' ? PF.avatar === i.id : (PF.moldura || '') === i.id;
    itens.push({ k: i.id, tipo: i.tipo, nome: i.nome, raridade: i.raridade, preco: i.preco, tem: i.tem, eq, cond: i.cond && !i.tem ? i.cond : '', id: i.id, desc: i.tipo === 'avatar' ? 'Imagem do seu perfil' : 'Borda do seu avatar',
      thumb: i.tipo === 'avatar' ? `<img class="lj-img mo-${ljEsc(PF.moldura || '')}" src="${avSrc(i.id)}" alt="">` : `<img class="lj-img mo-${i.id}" src="${avSrc(PF.avatar)}" alt="">` });
  }
  return itens;
}
function ljRender() {
  $('#lj-cr').textContent = ljFmt(S.credits);
  document.querySelectorAll('.lj-side [data-t]').forEach(b => b.classList.toggle('on', !ljQ && b.dataset.t === ljTab));
  const q = ljNorm(ljQ.trim()), todos = ljItens();
  const lista = (q ? todos.filter(i => ljNorm(i.nome).includes(q)) : todos.filter(i => i.tipo === ljTab)).sort((a, b) => a.tipo === b.tipo ? (a.tipo === 'nave' ? a.id - b.id : ljRar[a.raridade] - ljRar[b.raridade] || a.preco - b.preco) : a.tipo.localeCompare(b.tipo));
  if (!ljSel || !lista.some(i => i.k === ljSel)) ljSel = (lista.find(i => !i.tem && !i.cond) || lista[0] || {}).k;
  const it = lista.find(i => i.k === ljSel), rot = { nave: 'Nave', moldura: 'Moldura', avatar: 'Avatar' };
  $('#lj-list').innerHTML = lista.map(i => `<button type="button" role="option" class="lj-row${i.k === ljSel ? ' sel' : ''}${i.tem ? ' tem' : ''}" data-k="${i.k}" aria-selected="${i.k === ljSel}"><span class="lj-n">${ljEsc(i.nome)}${q ? `<small> · ${rot[i.tipo]}</small>` : ''}</span><span class="lj-p">${i.eq ? 'Em uso' : i.tem ? 'Sua' : i.cond ? '🔒' : ljFmt(i.preco) + ' Cr'}</span></button>`).join('') || '<p class="empty">Nenhum item encontrado.</p>';
  if (!it) { $('#lj-detail').innerHTML = '<p class="empty">Escolha um item.</p>'; return; }
  const sem = it.tipo === 'nave' && it.bloq ? ' disabled' : '';
  let ac;
  if (it.eq) ac = it.tipo === 'moldura' ? '<button type="button" class="ghost" data-ac="des">Remover moldura</button>' : '<span class="tag">Em uso</span>';
  else if (it.tem) ac = `<button type="button" class="buy" data-ac="eq"${sem}>Usar</button>`;
  else if (it.cond) ac = `<span class="tag lock">🔒 ${ljEsc(it.cond)}</span>`;
  else ac = `<button type="button" class="buy" data-ac="buy"${S.credits < it.preco || sem ? ' disabled' : ''}>Comprar · ${ljFmt(it.preco)} Cr</button>`;
  const falta = !it.tem && !it.cond && S.credits < it.preco ? `<small class="lj-falta">Faltam ${ljFmt(it.preco - S.credits)} Cr</small>` : '', pt = it.tipo === 'nave' && it.bloq ? '<small class="lj-falta">Indisponível durante uma partida.</small>' : '';
  $('#lj-detail').innerHTML = `<div class="lj-thumb r-${it.raridade === 'épico' ? 'epico' : it.raridade === 'lendário' ? 'lendario' : it.raridade}">${it.thumb}</div><div class="lj-info"><b>${ljEsc(it.nome)}</b><small>${rot[it.tipo]} · ${it.raridade}</small><small>${it.tipo === 'nave' ? '' : ljEsc(it.desc)}</small></div>${it.stats || ''}<div class="lj-buy">${ac}${falta}${pt}</div>`;
  const row = $('#lj-list .sel'); if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
}
$('#lj-q').addEventListener('input', e => { ljQ = e.target.value; ljSel = null; ljRender(); });
document.querySelector('.nav [data-view=loja]').addEventListener('click', () => { window.scrollTo(0, 0); ljCarregar(); });
$('#p-loja').addEventListener('click', async e => {
  const t = e.target.closest('.lj-side [data-t]'); if (t) { ljTab = t.dataset.t; ljQ = ''; $('#lj-q').value = ''; ljSel = null; ljRender(); return; }
  const r = e.target.closest('.lj-row'); if (r) { ljSel = r.dataset.k; ljRender(); return; }
  const b = e.target.closest('[data-ac]'); if (!b) return; const it = ljItens().find(i => i.k === ljSel); if (!it) return; const err = $('#lj-err'); err.textContent = ''; b.disabled = true;
  try {
    if (it.tipo === 'nave') {
      const ok = await act(b.dataset.ac === 'buy' ? 'comprarNave' : 'equipar', { i: it.id }); if (ok && b.dataset.ac === 'eq') pvShip = 0;
      if (!ok) err.textContent = 'Não foi possível concluir. Veja o aviso no jogo.';
    } else if (b.dataset.ac === 'buy') { LJ = await api('/loja/comprar', 'POST', { item: it.id }); PF = await api('/perfil'); await refrescar(true); }
    else { PF = await api('/perfil', 'POST', it.tipo === 'avatar' ? { avatar: it.id } : { moldura: b.dataset.ac === 'des' ? '' : it.id }); renderAccount(); carregarRanking && carregarRanking(true); }
  } catch (x) { err.textContent = x.message || 'Não foi possível concluir.'; }
  ljRender();
});
