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
  if (!TOK || !CLOUD() || amBusy || (!force && Date.now() - amAt < 30000)) return; amBusy = true;
  try { AM = await api('/amigos'); AM.convites = AM.convites || []; amAt = Date.now(); } catch { amAt = Date.now(); } amBusy = false;
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

/* ---- aba Amigos ---- */
const $a = s => document.querySelector(s), amV = $a('#amv');
let AV = { tab: 'jog', q: '', jog: null, busy: false, msg: '' }, avT = 0;
const amLink = () => location.origin + location.pathname + '?amigo=' + (AM ? AM.meuId : '');
const nAm = () => AM ? AM.recebidos.length + AM.convites.length : 0;
function amBadge() { const b = $a('#nav-am'); if (!b) return; let i = b.querySelector('.rk-b'), n = nAm(); if (!n) { if (i) i.remove(); return; } if (!i) { i = document.createElement('i'); i.className = 'rk-b'; b.appendChild(i); } i.textContent = n; }
const noLobby = () => typeof PT !== 'undefined' && PT && PT.estado === 'espera';
function amRender() {
  amBadge(); if (!amV || document.body.dataset.view !== 'amigos') return;
  if (!AM) { amV.innerHTML = '<p class="empty">Carregando…</p>'; return; }
  const foc = document.activeElement && document.activeElement.id, val = foc === 'amv-q' ? document.activeElement.value : null;
  const lin = (p, bt, ex) => `<li><span class="am-n">${avImg(p.a)}${rkEsc(p.n)}${ex || (p.w ? `<small>${fmt(p.w).replace(',00', '')} Cr</small>` : '')}</span><span class="am-b">${bt}</span></li>`;
  const bt = (k, t, c, i, x) => `<button type="button" class="${c}" data-ac="${k}" data-i="${i}"${x || ''}>${t}</button>`;
  const tab = (k, t, n) => `<button type="button" data-t="${k}" class="${AV.tab === k ? 'on' : ''}">${t}${n ? `<i class="rk-b">${n}</i>` : ''}</button>`;
  let h = `<div class="amv-eu"><span>Seu ID: <b class="mono">#${AM.meuId}</b></span><button type="button" class="buy" id="am-copy"><i class="fa-solid fa-share-nodes"></i> Compartilhar meu link</button></div>`
    + `<form id="am-form" class="am-form"><input id="am-in" class="pf-in" placeholder="Apelido ou ID (ex.: #123)" autocomplete="off" aria-label="Apelido ou ID do piloto"><button type="submit" class="buy">Enviar pedido</button></form>`
    + `<p class="au-err" id="am-err" role="alert">${rkEsc(AV.msg)}</p>`
    + `<div class="amv-tabs">${tab('jog', 'Jogadores')}${tab('amigos', 'Amigos' + (AM.amigos.length ? ' (' + AM.amigos.length + ')' : ''))}${tab('ped', 'Pedidos', AM.recebidos.length)}${tab('conv', 'Convites', AM.convites.length)}</div>`;
  if (AV.tab === 'jog') {
    h += `<input id="amv-q" class="pf-in amv-busca" placeholder="Buscar piloto pelo apelido" autocomplete="off" maxlength="16" aria-label="Buscar piloto">`;
    const J = AV.jog; h += !J ? '<p class="empty">Carregando…</p>' : J.length ? `<p class="amv-sub">${AV.q ? 'Resultados da busca' : 'Maiores patrimônios do jogo'}</p><ul class="am-ul">${J.map(p => lin(p, p.r === 'amigo' ? '<span class="tag ok">✓ Amigo</span>' : p.r === 'enviado' ? '<span class="tag">Pedido enviado</span>' : p.r === 'recebido' ? bt('sim', 'Aceitar', 'buy', p.id) : bt('add', 'Adicionar', 'buy', p.id))).join('')}</ul>` : '<p class="empty">Nenhum piloto encontrado.</p>';
  } else if (AV.tab === 'amigos') {
    h += AM.amigos.length ? `${noLobby() ? '<p class="amv-sub">Você tem uma sala aberta: toque em <b>Convidar</b> para chamar um amigo.</p>' : ''}<ul class="am-ul">${AM.amigos.map(p => lin(p, (noLobby() ? bt('conv', 'Convidar', 'buy', p.id) : '') + bt('rem', 'Remover', 'ghost', p.id))).join('')}</ul>` : '<p class="empty">Nenhum amigo ainda. Veja a lista de Jogadores, envie um pedido acima ou compartilhe o seu link.</p>';
  } else if (AV.tab === 'ped') {
    if (!AM.recebidos.length && !AM.enviados.length) h += '<p class="empty">Nenhum pedido pendente.</p>';
    if (AM.recebidos.length) h += `<p class="amv-sub">Recebidos</p><ul class="am-ul">${AM.recebidos.map(p => lin(p, bt('sim', 'Aceitar', 'buy', p.id) + bt('nao', 'Recusar', 'ghost', p.id))).join('')}</ul>`;
    if (AM.enviados.length) h += `<p class="amv-sub">Enviados</p><ul class="am-ul">${AM.enviados.map(p => lin(p, bt('rem', 'Cancelar', 'ghost', p.id))).join('')}</ul>`;
  } else {
    h += AM.convites.length ? `<p class="amv-sub">Entre antes que a partida comece.</p><ul class="am-ul">${AM.convites.map(c => lin(c.de, bt('ent', 'Entrar', 'buy', c.codigo) + bt('disp', 'Dispensar', 'ghost', c.codigo), `<small>${c.modo === 'torneio' ? 'Torneio' : 'Entre amigos'} · ${c.min} min · ${c.vagas} vagas${c.taxa ? ' · taxa ' + fmt(c.taxa).replace(',00', '') + ' Cr' : ''}</small>`)).join('')}</ul>` : '<p class="empty">Nenhum convite. Quando um amigo criar uma sala e chamar você, ele aparece aqui.</p>';
  }
  const at = $a('#am-in') ? $a('#am-in').value : ''; amV.innerHTML = h; if (at) $a('#am-in').value = at;
  if (foc === 'amv-q' && $a('#amv-q')) { const q = $a('#amv-q'); q.value = val; q.focus(); q.setSelectionRange(val.length, val.length); }
}
async function jogLoad() { if (!TOK || !CLOUD()) return; const q = AV.q; try { const r = await api('/jogadores?q=' + encodeURIComponent(q)); if (q === AV.q) { AV.jog = r.lista; amRender(); } } catch {} }
function abrirAmigos(prefill) {
  if (!TOK) return; AV.msg = ''; if (prefill) AV.tab = 'jog';
  document.querySelector('.nav [data-view=amigos]').click();
  amRender(); if (prefill) $a('#am-in').value = prefill;
  amLoad(true).then(amRender); jogLoad();
}
async function amCall(path, corpo) {
  AV.msg = '';
  try { const r = await api(path, 'POST', corpo); if (r.amigos) { AM = r; AM.convites = AM.convites || []; amAt = Date.now(); } RK.d = {}; rkLoad(true); amRender(); if (AV.tab === 'jog') jogLoad(); return true; } catch (e) { AV.msg = e.message || 'Não foi possível concluir.'; amRender(); return false; }
}
document.querySelectorAll('.nav [data-view=amigos]').forEach(b => b.addEventListener('click', () => { AV.msg = ''; amRender(); amLoad(true).then(amRender); jogLoad(); }));
amV.addEventListener('input', e => { if (e.target.id !== 'amv-q') return; clearTimeout(avT); avT = setTimeout(() => { AV.q = e.target.value.trim(); AV.jog = null; jogLoad(); }, 300); });
amV.addEventListener('click', async e => {
  const tb = e.target.closest('[data-t]'); if (tb) { AV.tab = tb.dataset.t; AV.msg = ''; amRender(); if (AV.tab === 'jog') jogLoad(); else amLoad(true).then(amRender); return; }
  if (e.target.closest('#am-copy')) { const u = amLink(), t = 'Jogue Astromercante comigo! Adicione-me como amigo: ' + u; try { if (navigator.share) await navigator.share({ title: 'Astromercante', text: t, url: u }); else { await navigator.clipboard.writeText(u); AV.msg = 'Link copiado!'; amRender(); } } catch { try { await navigator.clipboard.writeText(u); AV.msg = 'Link copiado!'; } catch { AV.msg = u; } amRender(); } return; }
  const b = e.target.closest('[data-ac]'); if (!b) return; const k = b.dataset.ac, id = b.dataset.i; b.disabled = true;
  if (k === 'add') { await amCall('/amigos/pedir', { apelido: '#' + id }); }
  else if (k === 'sim') await amCall('/amigos/responder', { id: +id, aceitar: true });
  else if (k === 'nao') await amCall('/amigos/responder', { id: +id, aceitar: false });
  else if (k === 'conv') { if (await amCall('/amigos/convidar', { id: +id })) { AV.msg = 'Convite enviado!'; amRender(); } }
  else if (k === 'disp') await amCall('/amigos/dispensar', { codigo: id });
  else if (k === 'ent') { try { aplicarPartida(await api('/partida/entrar', 'POST', { codigo: id })); await amCall('/amigos/dispensar', { codigo: id }); document.querySelector('.nav [data-view=play]').click(); } catch (er) { AV.msg = er.message || 'Não foi possível entrar.'; amRender(); } }
  else if (confirm('Remover este amigo (ou cancelar o pedido)?')) await amCall('/amigos/remover', { id: +id }); else b.disabled = false;
});
amV.addEventListener('submit', async e => { if (e.target.id !== 'am-form') return; e.preventDefault(); const v = $a('#am-in').value.trim(); if (!v) return; if (await amCall('/amigos/pedir', { apelido: v })) { AV.msg = 'Pedido enviado! Se já havia um pedido dele para você, vocês viraram amigos.'; amRender(); } });

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
  if (document.body.dataset.view === 'home') { rkLoad(false); }
  amLoad(false).then(amBadge);
}, 2000);
