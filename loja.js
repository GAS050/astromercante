/* Loja: avatares e molduras (só aparência), comprados com créditos da carreira. O servidor confere preço, saldo e posse; aqui só mostramos e pedimos. */
let LJ = null, ljTab = 'avatar';
const ljFmt = n => Math.floor(n).toLocaleString('pt-BR');
const ljEsc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function abrirLoja() {
  if (!TOK || !PF) return; $('#lj-err').textContent = ''; $('#loja').hidden = false;
  try { LJ = await api('/loja'); } catch (e) { $('#lj-err').textContent = e.message || 'Não foi possível abrir a loja.'; return; }
  PF = await api('/perfil').catch(() => PF); ljRender();
}
function ljRender() {
  if (!LJ) return; $('#lj-cr').textContent = ljFmt(LJ.creditos);
  document.querySelectorAll('.lj-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === ljTab));
  const ord = { 'comum': 0, 'raro': 1, 'épico': 2, 'lendário': 3, 'conquista': 4 };
  $('#lj-grid').innerHTML = LJ.itens.filter(i => i.tipo === ljTab).sort((a, b) => ord[a.raridade] - ord[b.raridade] || a.preco - b.preco).map(i => {
    const eq = i.tipo === 'avatar' ? PF.avatar === i.id : (PF.moldura || '') === i.id, img = i.tipo === 'avatar' ? `<img class="lj-img mo-${ljEsc(PF.moldura || '')}" src="${avSrc(i.id)}" alt="" width="72" height="72">` : `<img class="lj-img mo-${i.id}" src="${avSrc(PF.avatar)}" alt="" width="72" height="72">`;
    let ac;
    if (i.tem) ac = eq ? `<button type="button" class="ghost" data-lj="des" data-i="${i.id}">${i.tipo === 'moldura' ? 'Remover' : 'Em uso'}</button>` : `<button type="button" class="buy" data-lj="eq" data-i="${i.id}">Usar</button>`;
    else if (i.cond) ac = `<small class="lj-cond">🔒 ${ljEsc(i.cond)}</small>`;
    else ac = `<button type="button" class="buy" data-lj="buy" data-i="${i.id}" ${LJ.creditos < i.preco ? 'disabled' : ''}>${ljFmt(i.preco)} Cr</button>`;
    return `<div class="lj-it r-${i.raridade === 'épico' ? 'epico' : i.raridade === 'lendário' ? 'lendario' : i.raridade}${i.tem ? ' tem' : ''}">${img}<b>${ljEsc(i.nome)}</b><small>${i.raridade}</small>${ac}</div>`;
  }).join('');
}
$('#loja').addEventListener('click', async e => {
  if (e.target.id === 'loja' || e.target.closest('#lj-x')) { $('#loja').hidden = true; return; }
  const t = e.target.closest('.lj-tabs [data-t]'); if (t) { ljTab = t.dataset.t; ljRender(); return; }
  const b = e.target.closest('[data-lj]'); if (!b) return; const id = b.dataset.i, err = $('#lj-err'); err.textContent = ''; b.disabled = true;
  try {
    if (b.dataset.lj === 'buy') { LJ = await api('/loja/comprar', 'POST', { item: id }); PF = await api('/perfil'); refrescar(true); }
    else { const tipo = LJ.itens.find(x => x.id === id).tipo; PF = await api('/perfil', 'POST', tipo === 'avatar' ? { avatar: id } : { moldura: b.dataset.lj === 'des' ? '' : id }); renderAccount(); carregarRanking && carregarRanking(true); }
  } catch (x) { err.textContent = x.message || 'Não foi possível concluir.'; }
  ljRender();
});
