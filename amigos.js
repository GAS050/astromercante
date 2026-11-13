/* Rankings (Global, Semana, Mês, Amigos) e lista de amigos. O servidor calcula tudo; aqui só pedimos e mostramos.
   Semana e Mês ranqueiam o GANHO no período (patrimônio agora − patrimônio no começo do período), então quem entrou hoje também compete. */
let RK = { tab: 'global', sub: 'total', d: {} }, AM = null, amAt = 0, amBusy = false;
const rkEsc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rkKey = () => RK.tab + (RK.tab === 'amigos' ? ':' + RK.sub : '');
const rkUrl = () => RK.tab === 'global' ? '/ranking' : RK.tab === 'amigos' ? '/ranking?p=amigos&q=' + RK.sub : '/ranking?p=' + RK.tab;
async function rkLoad(force) {
  if (!TOK || !CLOUD() || MODE === 'partida' || document.hidden) return; const k = rkKey(), c = RK.d[k];
  if (!force && c && (c.busy || Date.now() - c.at < 20000)) return;
  RK.d[k] = { ...(c || {}), busy: true, at: c ? c.at : 0 };
  try { RK.d[k] = { data: await api(rkUrl()), at: Date.now() }; } catch { RK.d[k] = { ...(RK.d[k] || {}), busy: false, at: Date.now() }; }
}
async function amLoad(force) {
  if (!TOK || !CLOUD() || amBusy || (!force && Date.now() - amAt < 60000)) return; amBusy = true;
  try { AM = await api('/amigos'); amAt = Date.now(); } catch { amAt = Date.now(); } amBusy = false;
}
const rkFalta = fim => { const ms = fim - Date.now(); if (ms <= 0) return 'terminando'; const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4); return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`; };
const rkFmt = (w, per) => per ? (w > 0 ? '+' : w < 0 ? '−' : '') + fmt(Math.abs(w)).replace(',00', '') : fmt(w).replace(',00', '');
function rkCard() {
  const nPend = AM ? AM.recebidos.length : 0, d = (RK.d[rkKey()] || {}).data, per = RK.tab === 'semana' || RK.tab === 'mes' || (RK.tab === 'amigos' && RK.sub !== 'total');
  const tab = (k, t, b) => `<button type="button" data-rk="${k}" class="${RK.tab === k ? 'on' : ''}">${t}${b ? `<i class="rk-b">${b}</i>` : ''}</button>`;
  let h = `<div class="hm-card rk"><div class="hm-h"><b>Ranking</b><small>${RK.tab === 'global' ? 'patrimônio total' : RK.tab === 'amigos' ? 'você e seus amigos' : 'ganho no ' + (RK.tab === 'mes' ? 'mês' : 'semana')}</small></div>`
    + `<div class="rk-tabs">${tab('global', 'Global')}${tab('semana', 'Semana')}${tab('mes', 'Mês')}${tab('amigos', 'Amigos', nPend)}</div>`;
  if (RK.tab === 'amigos') h += `<div class="rk-sub">${['total', 'semana', 'mes'].map(q => `<button type="button" data-rks="${q}" class="${RK.sub === q ? 'on' : ''}">${{ total: 'Total', semana: 'Semana', mes: 'Mês' }[q]}</button>`).join('')}</div>`;
  if (!d) return h + '<p class="empty">Carregando ranking…</p></div>';
  let rows = '', foot = '';
  const li = (i, r, me) => `<li class="${me ? 'me' : ''}"><span><i class="pos">${i}</i> ${avImg(r.a)}${rkEsc(r.n)}</span><b class="mono ${per ? (r.w > 0 ? 'rk-up' : r.w < 0 ? 'rk-dn' : '') : ''}">${rkFmt(r.w, per)}</b></li>`;
  if (RK.tab === 'amigos') {
    const L = d.lista || []; rows = L.slice(0, 8).map((r, i) => li(i + 1, r, r.eu)).join('');
    const eu = L.findIndex(r => r.eu); if (eu >= 8) rows += `<li class="gap"><span>…</span></li>` + li(eu + 1, L[eu], true);
    foot = d.amigos ? '' : '<p class="empty">Você ainda não tem amigos. Toque em Gerenciar amigos para convidar.</p>';
    if (per && d.fim) foot += `<p class="hm-pos">Ganho no período · termina em <b>${rkFalta(d.fim)}</b></p>`;
    foot += `<button type="button" class="rk-am" data-am="1"><i class="fa-solid fa-user-group"></i> Gerenciar amigos${nPend ? `<i class="rk-b">${nPend}</i>` : ''}</button>`;
  } else {
    const T = d.top || [], me = d.eu; rows = T.slice(0, 5).map((r, i) => li(i + 1, r, me && r.n === me.n)).join('');
    if (me && me.pos && me.pos > 5) rows += `<li class="gap"><span>…</span></li>` + li(me.pos, me, true);
    if (!T.length) foot = `<p class="empty">${per ? 'Ninguém pontuou ainda neste período. Seja o primeiro!' : 'Sem pilotos ainda.'}</p>`;
    else if (per && me && !me.pos) foot = '<p class="hm-pos">Você ainda não pontuou neste período: faça lucro para entrar!</p>';
    else if (RK.tab === 'global' && me && me.pos > 5) foot = '';
    if (per && d.fim) foot += `<p class="hm-pos">Ganho no período · termina em <b>${rkFalta(d.fim)}</b>${d.total ? ` · ${d.total} pontuando` : ''}</p>`;
    else if (RK.tab === 'global') foot += `<p class="hm-pos">${d.total || ''} pilotos${me && me.pos ? ` · você está em <b>${me.pos}º</b>` : ''}</p>`;
  }
  return h + `<ol class="board">${rows}</ol>${foot}</div>`;
}

/* ---- janela de amigos ---- */
const $a = s => document.querySelector(s), amM = $a('#amigos');
const amLink = () => location.origin + location.pathname + '?amigo=' + (AM ? AM.meuId : '');
function amRender() {
  if (!AM) { $a('#am-lista').innerHTML = '<p class="empty">Carregando…</p>'; return; }
  $a('#am-id').textContent = '#' + AM.meuId;
  const lin = (p, bt) => `<li><span class="am-n">${avImg(p.a)}${rkEsc(p.n)}${p.w ? `<small>${fmt(p.w).replace(',00', '')} Cr</small>` : ''}</span><span class="am-b">${bt}</span></li>`;
  let h = '';
  if (AM.recebidos.length) h += `<h3>Pedidos recebidos</h3><ul class="am-ul">${AM.recebidos.map(p => lin(p, `<button type="button" class="buy" data-ac="sim" data-i="${p.id}">Aceitar</button><button type="button" class="ghost" data-ac="nao" data-i="${p.id}">Recusar</button>`)).join('')}</ul>`;
  h += `<h3>Meus amigos (${AM.amigos.length})</h3>` + (AM.amigos.length ? `<ul class="am-ul">${AM.amigos.map(p => lin(p, `<button type="button" class="ghost" data-ac="rem" data-i="${p.id}">Remover</button>`)).join('')}</ul>` : '<p class="empty">Nenhum amigo ainda. Envie um pedido acima ou compartilhe o seu link.</p>');
  if (AM.enviados.length) h += `<h3>Pedidos enviados</h3><ul class="am-ul">${AM.enviados.map(p => lin(p, `<button type="button" class="ghost" data-ac="rem" data-i="${p.id}">Cancelar</button>`)).join('')}</ul>`;
  $a('#am-lista').innerHTML = h;
}
async function abrirAmigos(prefill) {
  if (!TOK) return; $a('#am-err').textContent = ''; if (prefill) $a('#am-in').value = prefill; amM.hidden = false; AM ? amRender() : amRender(); await amLoad(true); amRender();
}
async function amCall(path, corpo) {
  $a('#am-err').textContent = '';
  try { AM = await api(path, 'POST', corpo); amAt = Date.now(); amRender(); RK.d = {}; rkLoad(true); return true; } catch (e) { $a('#am-err').textContent = e.message || 'Não foi possível concluir.'; return false; }
}
amM.addEventListener('click', async e => {
  if (e.target === amM || e.target.closest('#am-x')) { amM.hidden = true; return; }
  if (e.target.closest('#am-copy')) { const u = amLink(), t = 'Jogue Astromercante comigo! Adicione-me como amigo: ' + u; try { if (navigator.share) await navigator.share({ title: 'Astromercante', text: t, url: u }); else { await navigator.clipboard.writeText(u); $a('#am-err').textContent = 'Link copiado!'; } } catch { try { await navigator.clipboard.writeText(u); $a('#am-err').textContent = 'Link copiado!'; } catch { $a('#am-err').textContent = u; } } return; }
  const b = e.target.closest('[data-ac]'); if (!b) return; const id = +b.dataset.i; b.disabled = true;
  if (b.dataset.ac === 'sim') await amCall('/amigos/responder', { id, aceitar: true });
  else if (b.dataset.ac === 'nao') await amCall('/amigos/responder', { id, aceitar: false });
  else if (confirm('Remover este amigo (ou cancelar o pedido)?')) await amCall('/amigos/remover', { id }); else b.disabled = false;
});
$a('#am-form').addEventListener('submit', async e => { e.preventDefault(); const v = $a('#am-in').value.trim(); if (!v) return; if (await amCall('/amigos/pedir', { apelido: v })) { $a('#am-in').value = ''; $a('#am-err').textContent = 'Pronto! Se já havia um pedido dele para você, vocês viraram amigos.'; } });

/* ---- cliques no card do Início e link de convite (?amigo=ID) ---- */
document.addEventListener('click', e => {
  const t = e.target.closest('#home [data-rk]'); if (t) { RK.tab = t.dataset.rk; rkLoad(false); return home_refresh(); }
  const s = e.target.closest('#home [data-rks]'); if (s) { RK.sub = s.dataset.rks; rkLoad(false); return home_refresh(); }
  if (e.target.closest('#home [data-am]')) abrirAmigos();
});
function home_refresh() { const h = $a('#home'); if (h) h._h = ''; }
let convite = null; try { const u = new URL(location.href), a = u.searchParams.get('amigo'); if (a && /^\d+$/.test(a)) { sessionStorage.setItem('astromercante_convite', a); u.searchParams.delete('amigo'); history.replaceState(null, '', u.pathname + u.search + u.hash); } convite = sessionStorage.getItem('astromercante_convite'); } catch {}
setInterval(() => {
  if (!TOK || !CLOUD() || !READY || typeof PF === 'undefined' || !PF || !PF.completo) return;
  if (convite) { const c = convite; convite = null; try { sessionStorage.removeItem('astromercante_convite'); } catch {} if (+c !== PF.id) { document.querySelector('.nav [data-view=home]').click(); abrirAmigos('#' + c); } }
  if (document.body.dataset.view === 'home') { rkLoad(false); amLoad(false); }
}, 2000);
