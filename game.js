'use strict';
/* ASTROMERCANTE – lógica do jogo. Preços = alvo vindo de APIs gratuitas + ruído controlado. */
const KEY = 'astromercante_v1', FEED_EVERY = 300000;
const CLOUD = () => !!(CONFIG.PRECOS_URL || '').trim();   // com o Worker configurado, o servidor é dono do jogo: preços, saldos, viagens e sorteios
let TOK = localStorage.getItem('astromercante_tok') || '', USER = localStorage.getItem('astromercante_user') || '', CTS = +localStorage.getItem('astromercante_cts') || 0, syncT = 0, syncMsg = '', asking = false, feedSlot = -1;
const RES = [
  { id:'neutronio',   nome:'Cristais de Neutrônio',  base:120, vol:.006, src:'btc',  corr:'Correl. Tech / Cripto (BTC)', icon:'fa-brands fa-bitcoin' },
  { id:'titanio',     nome:'Minério de Titânio',     base:45,  vol:.003, src:'gold', corr:'Correl. Ouro (PAXG)',         icon:'fa-coins' },
  { id:'helio3',      nome:'Gás Hélio-3',            base:80,  vol:.005, src:'eth',  corr:'Correl. Energia (ETH)',       icon:'fa-oil-can' },
  { id:'especiarias', nome:'Especiarias de Júpiter', base:25,  vol:.004, src:'fx',   corr:'Correl. Câmbio (USD/BRL)',    icon:'fa-dollar-sign' },
];
RES.push(
  { id:'plasma',      nome:'Plasma Sombrio',  base:300,  vol:.007, src:'xmr',  corr:'Correl. Privacidade (Monero · XMR)', icon:'fa-bolt',           t:1 },
  { id:'antimateria', nome:'Antimatéria',     base:900,  vol:.008, src:'sol',  corr:'Correl. Alta velocidade (Solana · SOL)', icon:'fa-atom',           t:2 },
  { id:'cristal',     nome:'Cristal Temporal', base:2400, vol:.009, src:'xaut', corr:'Correl. Ouro digital (Tether Gold · XAUt)', icon:'fa-hourglass-half', t:3 });
RES.push(...MINERALS);
const FEED_KEYS = ['btc', 'gold', 'eth', 'fx', ...Object.keys(FEEDS)];   // ativos reais seguidos (FEEDS vem de galaxias.js)
const $ = (s, r = document) => r.querySelector(s);
const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios || um + 's'}`;   // concordância: pl(1,'dia') → "1 dia"; pl(3,'salto') → "3 saltos"
const avSrc = id => id === 'cap' ? 'assets/avatar/capitao.webp' : `assets/avatar/${/^(a[1-8]|b[1-6])$/.test(id) ? id : 'a1'}.svg?v=2`;
const avImg = id => id ? `<img class="av" src="${avSrc(id)}" alt="" width="20" height="20">` : '';
const fmt = n => n.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Estado ---------- */
const fresh = () => ({ credits:10000, inv:{}, price:{}, prev:{}, interval:30, loc:'orionis', cap:40, capLv:1, engLv:1, hist:{}, ev:null, rank:0, trip:null, sound:true, t0:Date.now(), daily:null, streak:0, lastDay:'', pos:null, fx:true, vis:{ 0:1 }, gal:0, wpLv:1, stock:{}, hull:100, maxHull:100 });
let S = fresh();
const PREFS = ['fx', 'sound', 'fxChecked', 'interval'];   // só isto fica no aparelho; o resto do jogo vive na conta (servidor)
try { const o = JSON.parse(localStorage.getItem(KEY)) || {}; S = { ...fresh(), ...(CLOUD() ? Object.fromEntries(PREFS.filter(k => k in o).map(k => [k, o[k]])) : o) }; } catch {}
let MODE = 'carreira', PT = null;   // MODE: 'partida' = jogando um torneio/sala (estado separado, no servidor); PT = última visão da partida
let SKEW = 0, V = 0, READY = !CLOUD(), busy = false, pulling = false, tripT = 0;   // SKEW: diferença entre o relógio do servidor e o do aparelho
const NOW = () => Date.now() + SKEW;
if (CLOUD()) { S.daily = { day:'', p:{ trades:0, trips:0, profit:0 }, done:{} }; document.body.classList.add('loading'); }
document.documentElement.classList.remove('pre', 'pretok');   // a partir daqui as classes do corpo (loading, gated) mandam
RES.forEach(r => { S.price[r.id] ??= r.base; S.prev[r.id] ??= S.price[r.id]; S.inv[r.id] ??= { qty:0, avg:0 }; S.hist[r.id] ??= [S.price[r.id]]; });
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(CLOUD() ? Object.fromEntries(PREFS.map(k => [k, S[k]])) : S)); } catch {} };

/* ---------- Feed de dados ---------- */
const STEP = 30000, FEED_KEY = 'astromercante_feed', cyc = t => Math.floor(t / STEP) * STEP;   // preço muda em ciclos fixos do relógio (:00 e :30), iguais para todos
let change = {}, ant = {}, feedAt = 0, live = false, lastFeed = 0, NEWS = [], NOTICIAS = [];   // NEWS: efeitos no preço; NOTICIAS: textos do painel
try { const c = JSON.parse(localStorage.getItem(FEED_KEY) || 'null'); if (c && c.change) { change = c.change; ant = c.ant || {}; feedAt = c.feedAt || 0; live = Object.keys(change).length > 0; } } catch {}   // último feed conhecido: o preço não "pula" ao recarregar
const get = async url => { const r = await fetch(url, { cache:'no-store', signal: AbortSignal.timeout(8000) }); if (!r.ok) throw 0; return r.json(); };

function novasNoticias(lista) {   // avisa 1x cada notícia nova (não avisa as que já existiam quando o jogador abriu o jogo)
  let vistas = []; try { vistas = JSON.parse(localStorage.getItem('astromercante_news') || 'null') || []; } catch {}
  const primeira = !vistas.length && !NOTICIAS.length, novas = lista.filter(n => !vistas.includes(n.id));
  if (!novas.length) return;
  try { localStorage.setItem('astromercante_news', JSON.stringify(lista.map(n => n.id).slice(0, 30))); } catch {}
  if (!primeira && NOTICIAS.length) { const n = novas[0], nome = id => (RES.find(r => r.id === id) || {}).nome || id; note(`📰 ${n.ti}${n.s ? ` (${n.s > 0 ? '▲' : '▼'} ${n.r.map(nome).join(', ')})` : ''}`, 'alert'); }
}
async function fetchFeed() {
  lastFeed = Date.now(); feedSlot = Math.floor((Date.now() - 20000) / FEED_EVERY);
  if (CONFIG.PRECOS_URL) {          // caminho principal: Worker com cache (veja worker/README.md)
    try {
      const d = await get(CONFIG.PRECOS_URL.replace(/\/$/, '') + '/precos'), c = {}, a = {};
      FEED_KEYS.forEach(k => { if (Number.isFinite(d[k])) c[k] = d[k]; if (Number.isFinite(d.ant?.[k])) a[k] = d.ant[k]; });
      if (Array.isArray(d.noticias)) { novasNoticias(d.noticias); NOTICIAS = d.noticias; NEWS = d.noticias.filter(n => n.s); }
      if (Object.keys(c).length) { change = c; ant = a; feedAt = +d.updated || 0; try { localStorage.setItem(FEED_KEY, JSON.stringify({ change, ant, feedAt })); } catch {} }
    } catch {}
    live = Object.keys(change).length > 0; setFeed(); return;   // se o Worker falhar, usa a simulação (não sobrecarrega as APIs)
  }
  const [cg, fx] = await Promise.allSettled([
    get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,pax-gold,ethereum&vs_currencies=usd&include_24hr_change=true'),
    get('https://economia.awesomeapi.com.br/json/last/USD-BRL'),
  ]);
  const c = {};
  if (cg.status === 'fulfilled') { const d = cg.value; c.btc = d.bitcoin?.usd_24h_change; c.gold = d['pax-gold']?.usd_24h_change; c.eth = d.ethereum?.usd_24h_change; }
  if (fx.status === 'fulfilled') c.fx = parseFloat(fx.value.USDBRL?.pctChange);
  Object.keys(c).forEach(k => { if (Number.isFinite(c[k])) change[k] = c[k]; });
  live = Object.values(change).some(Number.isFinite);
  setFeed();
}

/* alvo de preço: 24h real amplificado (x3) ou passeio aleatório se offline */
/* Preço = função pura do relógio + dados do Worker: todos os jogadores veem o mesmo valor, em qualquer aparelho. */
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = n => { let t = (n + 0x6D2B79F5) | 0; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function vnoise(id, x) { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f), h = hash(id), a = rnd(h + i), b = rnd(h + i + 1); return (a + (b - a) * s) * 2 - 1; }
function feedCh(src, t) {   // variação 24h do feed, suavizada entre uma atualização do Worker e a seguinte (sem degraus)
  const c = change[src]; if (!Number.isFinite(c)) return null; const a = ant[src];
  return Number.isFinite(a) && feedAt ? a + (c - a) * clamp((t - feedAt) / FEED_EVERY, 0, 1) : c;
}
const newsMult = (id, t) => {   // por produto vale a notícia mais recente (a anterior sai suavemente em 5 min): nunca soma efeitos; no máx. ±20%
  const at = []; if (S.partida && !S.partida.eventos) return 0;   // partidas sem eventos também ficam sem notícias
  
  for (const n of NEWS) if (n.s && t >= n.t0 && t < n.t1 && n.r?.includes(id)) at.push(n);
  if (!at.length) return 0;
  at.sort((a, b) => b.t0 - a.t0);
  const env = (n) => Math.min(1, (t - n.t0) / 300000, (n.t1 - t) / ((n.t1 - n.t0) * .25)), ent = Math.min(1, (t - at[0].t0) / 300000);
  return clamp(at[0].s * env(at[0]) + (at[1] ? (1 - ent) * at[1].s * env(at[1]) : 0), -.2, .2);
};
function priceNow(r, t) {
  const s = t / 1000, n = vnoise(r.id + 'a', s / 900) * .55 + vnoise(r.id + 'b', s / 240) * .3 + vnoise(r.id + 'c', s / 60) * .15;
  const ch = feedCh(r.src, t), tg = Number.isFinite(ch) ? clamp(ch * 3, -30, 30) / 100 : 0;
  return Math.max(1, r.base * (1 + tg) * (1 + newsMult(r.id, t)) * (1 + n * Math.min(.35, r.vol * 18)));
}
const EVWIN = 180000;
const evNow = now => S.partida && !S.partida.eventos ? null : evAt(now);   // partidas podem desligar os eventos
function evAt(now) {   // eventos sorteados pelo relógio: também iguais para todos
  const k = Math.floor(now / EVWIN);
  for (const j of [k, k - 1]) if (rnd(hash('ev' + j)) < .18) {
    const e = EVENTS[Math.floor(rnd(hash('evi' + j)) * EVENTS.length)], end = (j + 2) * EVWIN;
    if (now < end) return { ...e, k:j, left:Math.ceil((end - now) / 60000) };
  }
  return null;
}
let histCyc = cyc(NOW());
/** Refaz preço atual, anterior e histórico a partir do relógio (função pura): a variação ▲/▼ e o gráfico não "zeram" ao atualizar a página. */
function refazPrecos() { const c0 = cyc(NOW()); RES.forEach(r => { S.hist[r.id] = Array.from({ length:30 }, (_, i) => priceNow(r, c0 - (29 - i) * STEP)); S.price[r.id] = S.hist[r.id][29]; S.prev[r.id] = S.hist[r.id][28]; }); histCyc = c0; }
function tick() {
  const now = NOW(), ev = evNow(now);
  if (ev && !(S.ev && S.ev.k === ev.k)) { note('⚡ ' + ev.t + '!', 'alert'); sfx('alert'); }
  S.ev = ev;
  RES.forEach(r => {
    const p = priceNow(r, cyc(now) - STEP); S.prev[r.id] = p; S.price[r.id] = priceNow(r, cyc(now));   // variação sempre contra o ciclo anterior (30 s), mesmo logo após abrir a página
    const pct = (S.price[r.id] / p - 1) * 100;
    if ((r.t || 0) <= S.rank && Math.abs(pct) >= 1.2) note(`${pct > 0 ? 'Alta' : 'Queda'} de ${fmt(Math.abs(pct))}% em ${r.nome} (${r.corr.replace('Correl. ', '')}).${pct < 0 ? ' Oportunidade de compra!' : ''}`, 'alert');
  });
  if (cyc(now) !== histCyc) { histCyc = cyc(now); RES.forEach(r => { S.hist[r.id].push(S.price[r.id]); S.hist[r.id] = S.hist[r.id].slice(-30); }); }
  save(); render();
}

/* ---------- Negociação ---------- */
const qty = () => Math.max(1, Math.floor(+$('#qty').value) || 1);

function trade(id, side) {
  if (CLOUD()) return act('negociar', { id, lado:side, n:qty(), esperado:px(id) });
  const LIQ = .4 / (1 + .4 * S.gal), r = RES.find(x => x.id === id), n = qty(), s0 = stk(id), p = pxAt(id, side === 'buy' ? s0 - n * LIQ / 2 : s0 + n * LIQ / 2) * (side === 'buy' ? 1 : .97), h = S.inv[id], total = n * p;
  if (S.trip) return say('Nave em trânsito.', 'err');
  if (side === 'buy') {
    if (escasso(S.loc, NOW()) === id) return say(`${r.nome} está em falta neste planeta: não há estoque para comprar. Traga de outro lugar: aqui ele paga mais caro.`, 'err');
    if (n > (s0 - 1) / LIQ) return say(`Este planeta só tem ${Math.floor((s0 - 1) / LIQ)} un. em oferta. Procure outro mercado.`, 'err');
    if (total > S.credits) return say(`Créditos insuficientes: faltam ${fmt(total - S.credits)}.`, 'err');
    if (used() + n > S.cap) return say(`Porão cheio (${used()}/${S.cap}). Venda ou faça upgrade.`, 'err');
    h.avg = (h.avg * h.qty + total) / (h.qty + n); h.qty += n; S.credits -= total; setStk(id, s0 - n * LIQ);
    say(`Comprou ${n} × ${r.nome} por ${fmt(total)}.`, 'ok');
  } else {
    if (n > h.qty) return say(`Você tem apenas ${h.qty} × ${r.nome}.`, 'err');
    S.daily.p.profit += Math.max(0, n * (p - h.avg)); h.qty -= n; S.credits += total; setStk(id, s0 + n * LIQ); if (!h.qty) h.avg = 0;
    say(`Vendeu ${n} × ${r.nome} por ${fmt(total)}.`, 'ok');
  }
  S.daily.p.trades++; save(); render();
}

/* ---------- Interface ---------- */
const cargo = () => RES.reduce((s, r) => s + S.inv[r.id].qty * px(r.id), 0);
/** Igual ao servidor (worker/motor.js): 40% do preço das naves e 10% das melhorias contam como patrimônio na carreira. */
function valorFrota() {
  if (!CLOUD() || S.partida || !S.frota) return 0; let v = 0;
  for (const k of Object.keys(S.frota)) { const n = NAVES[k - 1], f = S.frota[k]; if (!n || !f) continue; v += .4 * n.preco; for (const [t, c] of [['cap', 'c'], ['eng', 'm'], ['wp', 'a']]) for (let L = 1; L < (f[c] || 1); L++) v += .1 * upCusto(n, t, L); }
  return v;
}
const patTotal = () => S.credits + cargo() + valorFrota();

function iconSrc(r) {
  if (!r.ex) return `assets/img/item_${r.id}.svg`;
  let h = 0; for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const a = `hsl(${h},90%,62%)`, b = `hsl(${h},80%,32%)`, t = `hsl(${h},95%,82%)`;
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="22" fill="#060d1b"/><rect x="2" y="2" width="124" height="124" rx="20" fill="none" stroke="#1b3a5a" stroke-width="2"/><path d="M64 14 94 52 64 114 34 52Z" fill="${b}" stroke="${t}" stroke-width="3" stroke-linejoin="round"/><path d="M64 14 94 52H34Z" fill="${a}" opacity=".85"/><path d="M64 52V114" stroke="${t}" stroke-width="2" opacity=".7"/></svg>`);
}
function buildMarket() {
  $('#market').innerHTML = RES.map((r, i) => `
    <article class="res" data-id="${r.id}">
      <span class="res__n">${i + 1}.</span>
      <img class="res__img" src="${iconSrc(r)}" alt="" onerror="this.style.visibility='hidden'">
      <div>
        <div class="res__name">${r.nome}<span class="falta-tag">EM FALTA</span></div>
        <div class="res__price mono" data-f="price"></div>
        <div class="res__meta"><span class="mono" data-f="chg"></span> | ${r.corr} | Oferta: <span data-f="sup"></span></div>
        <div class="res__pos" data-f="pos" hidden></div>
      </div>
      <div class="res__side"><svg class="spark" viewBox="0 0 60 20"><polyline fill="none" stroke-width="1.5"/></svg><i class="${r.icon}"></i>
        <div class="trade"><button class="buy" data-act="buy">Comprar</button><button class="sell" data-act="sell">Vender</button></div>
      </div>
    </article>`).join('');
}

let OF = [], ctSig = '', ctBucket = 0;   // ofertas de contrato (vêm do servidor)
const resNome = id => RES.find(x => x.id === id)?.nome || id;
const resIcon = id => { const r = RES.find(x => x.id === id); return r ? iconSrc(r) : ''; };
const destNome = (g, id) => GALAXIES[g]?.planetas.find(p => p.id === id)?.nome || id;
const ctTempo = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
function renderContratos() {
  const el = $('#contratos'); if (!el) return;
  if (MODE === 'partida' || !TOK) { el.innerHTML = ''; ctSig = ''; return; }
  const now = NOW(), b = Math.floor(now / 1200000), ativos = S.ct || [], feitos = new Set([...(S.cf || []), ...ativos.map(x => x.id)]);
  if ((!OF.length || Number(OF[0].id.split(':')[1]) !== b) && ctBucket !== b && !S.trip && CLOUD()) { ctBucket = b; refrescar(true); }   // ofertas ausentes ou de outra janela: pede ao servidor
  const card = (x, atv) => {
    const aqui = !S.trip && S.gal === x.gal && S.loc === x.dest, h = S.inv[x.r]?.qty || 0, pct = Math.round(100 * (x.q0 ? 1 - x.q / x.q0 : 0)), pr = Math.round((x.mult - 1) * 100);
    return `<li class="ctc ${atv ? 'on' : ''}${x.gal !== S.gal ? ' ig' : ''}"><div class="ctc__ic"><img src="${resIcon(x.r)}" alt="" onerror="this.style.visibility='hidden'"></div>
      <div class="ctc__b">${(x.gal !== S.gal || atv || x.falta || x.esp || (!atv && (x.risco || x.ap))) ? `<div class="ctc__tags">${x.gal !== S.gal ? '<span class="ctc__ig">INTERGALÁCTICO</span>' : ''}${atv ? '<span class="ctc__tag">ATIVO</span>' : ''}${x.esp ? '<span class="ctc__fr">FRÁGIL · NÃO LUTE</span>' : ''}${x.falta ? '<span class="ctc__fl">EM FALTA NO DESTINO</span>' : ''}${!atv && x.risco ? '<span class="ctc__fl">INIMIGO NA ROTA</span>' : ''}${!atv && x.ap ? '<span class="ctc__fr">PRAZO APERTADO</span>' : ''}</div>` : ''}
      <div class="ctc__t"><b>${x.q} × ${resNome(x.r)}</b></div>
      <div class="ctc__s">${x.gal !== S.gal ? `Galáxia <b>${GALAXIES[x.gal].nome}</b><br>Planeta <b>${destNome(x.gal, x.dest)}</b>` : `Planeta <b>${destNome(x.gal, x.dest)}</b>`}</div>
      ${atv ? `<div class="ctc__s"><span class="ctc__time" data-ate="${x.ate}">⏱ ${ctTempo(x.ate - now)}</span> · porão ${Math.min(h, x.q)}/${x.q}${x.q0 > x.q ? ` · entregue ${pct}%` : ''}</div><div class="ctc__s">Caução retida: ${fmt(x.cau)} Cr</div><div class="ctc__bar"><i style="width:${pct}%"></i></div>`
        : `<div class="ctc__s">Mercado <b>+${pr}%</b> + combustível · ⏱ ${x.dur} s${x.gal !== S.gal ? ' · salto custa ' + fmt(x.comb).replace(',00', '') + ' Cr (60% volta)' : ''}</div><div class="ctc__s">Caução ${fmt(x.cau)} Cr (volta na entrega)</div>${x.esp ? '<div class="ctc__s">Se houver luta no caminho, o contrato é perdido. A rota segura evita lutas.</div>' : ''}`}</div>
      ${atv ? `<button class="ctb" data-ce="${x.id}" ${aqui && h ? '' : 'disabled'}>${aqui ? (h ? 'Entregar carga' : 'Sem carga') : (S.trip ? 'Em viagem' : 'Vá até lá')}</button>`
        : `<button class="ctb" data-ca="${x.id}" ${ativos.length >= 3 || S.trip || x.cau > S.credits ? 'disabled' : ''}>Aceitar contrato</button>`}</li>`; };
  const ofs = S.trip ? [] : OF.filter(o => !feitos.has(o.id));
  const html = (ativos.length || ofs.length) ? `<section class="ct${ativos.length ? ' ct--on' : ''}">
    <h3><span>Contratos de entrega</span><small class="ct__n">${ativos.length}/3 ativos</small></h3>
    ${ativos.length ? `<ul>${ativos.map(x => card(x, true)).join('')}</ul>` : '<p class="ct__vz">Nenhum contrato ativo. Aceite uma oferta abaixo.</p>'}
    ${ofs.length ? `<h4>Ofertas neste planeta</h4><ul>${ofs.map(o => card(o, false)).join('')}</ul>` : ''}</section>` : '';
  const sig = html.replace(/⏱ \d+:\d+/g, ''); if (sig !== ctSig) { ctSig = sig; el.innerHTML = html; }
}
setInterval(() => { const n = NOW(); document.querySelectorAll('.ctc__time').forEach(e => { const t = Number(e.dataset.ate) - n; e.textContent = '⏱ ' + ctTempo(t); e.classList.toggle('urg', t < 60000); }); }, 1000);
$('#contratos')?.addEventListener('click', e => { const a = e.target.closest('[data-ca]'), d = e.target.closest('[data-ce]'); if (a && !a.disabled) act('contratoAceitar', { id:a.dataset.ca }); else if (d && !d.disabled) act('contratoEntregar', { id:d.dataset.ce }); });
function render() {
  renderContratos();
  $('#hud-credits').textContent = fmt(S.credits);
  $('#hud-networth').textContent = fmt(patTotal());
  RES.forEach(r => {
    const el = $(`[data-id="${r.id}"]`), g = S.price[r.id], p = px(r.id), pct = (g / S.prev[r.id] - 1) * 100;
    el.hidden = r.t > S.rank; const fl = !S.trip && escasso(S.loc, NOW()) === r.id; el.classList.toggle('falta', fl); const bb = $('[data-act=buy]', el); if (bb) bb.title = fl ? 'Em falta: sem estoque neste planeta' : ''; const su = $('[data-f=sup]', el); su.textContent = Math.round(stk(r.id)) + '%'; su.className = stk(r.id) < 50 ? 'down' : '';
    $('[data-f=price]', el).textContent = fmt(p) + ' Cr';
    const c = $('[data-f=chg]', el);
    c.textContent = `${pct >= 0 ? '▲ +' : '▼ '}${fmt(pct)}%`; c.className = 'mono ' + (pct >= 0 ? 'up' : 'down');
    const hh = S.inv[r.id], ps = $('[data-f=pos]', el); ps.hidden = !hh.qty;
    if (hh.qty) { const pnl = hh.qty * (p - hh.avg); ps.innerHTML = `Você tem <b>${hh.qty}</b> · pago em média ${fmt(hh.avg)} · <span class="mono ${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}${fmt(pnl)} Cr</span>`; }
    el.querySelectorAll('.trade button').forEach(b => b.disabled = !!S.trip || (b.dataset.act === 'buy' && fl));
    const h = S.hist[r.id], mn = Math.min(...h), mx = Math.max(...h), sp = $('.spark', el);
    sp.firstChild.setAttribute('points', h.map((v, i) => `${i / Math.max(h.length - 1, 1) * 60},${18 - (v - mn) / ((mx - mn) || 1) * 16}`).join(' '));
    sp.className.baseVal = 'spark ' + (h[h.length - 1] >= h[0] ? 'up' : 'down');
  });
  $('#cargobar').innerHTML = `Porão <b>${used()}/${S.cap}</b> · carga avaliada <b class="mono">${fmt(cargo())} Cr</b>`;
  renderWorld();
}

function note(msg, kind = '') {
  const li = document.createElement('li'); li.className = kind;
  li.textContent = `[${new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}] ${msg}`;
  $('#notes').prepend(li); while ($('#notes').children.length > 30) $('#notes').lastChild.remove();
}
let toastT;
function say(msg, kind) {
  note(msg, kind); sfx(kind); const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
function setFeed() {
  $('#feed').dataset.state = live ? 'live' : 'sim';
  $('#feed-text').textContent = live ? 'Dados reais' : 'Simulação';
}

/* ---------- Mundo: mapa, viagem, frota, eventos, patentes ---------- */
const SHORT = { neutronio:'Neutrônio', titanio:'Titânio', helio3:'Hélio-3', especiarias:'Especiarias', plasma:'Plasma', antimateria:'Antimatéria', cristal:'C. Temporal' };
MINERALS.forEach(m => { SHORT[m.id] = m.nome; });
const EVENTS = [
  { t:'Tempestade solar eleva o Hélio-3', r:'helio3', m:1.3 },
  { t:'Colapso de mina: Titânio escasso', r:'titanio', m:1.35 },
  { t:'Piratas inundam o mercado de Especiarias', r:'especiarias', m:.7 },
  { t:'Febre hacker: Neutrônio dispara', r:'neutronio', m:1.4 },
  { t:'Excesso de oferta derruba o Neutrônio', r:'neutronio', m:.72 },
  { t:'Greve em Nyx: Neutrônio nas alturas', r:'neutronio', m:1.5, p:'nyx' },
  { t:'Boom de demanda em Ícaro: Especiarias valem ouro', r:'especiarias', m:1.45, p:'icaro' },
];
const RANKS = [[0,'Recruta'],[12000,'Contrabandista'],[30000,'Mercador estelar'],[100000,'Barão orbital'],[300000,'Comodoro'],[1000000,'Almirante galáctico'],[3000000,'Lenda das estrelas'],[10000000,'Imperador dos dados'],[30000000,'Soberano do vazio'],[100000000,'Arquiteto do universo']];
const plan = id => PL.find(p => p.id === id);
const used = () => RES.reduce((s, r) => s + S.inv[r.id].qty, 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const trip = to => { const d = dist(plan(S.loc), plan(to)), bq = situacao(to, NOW()) === 'bloqueio' ? 1 : 0; return { d, cost:Math.round((bq ? 1.3 : 1) * d * .8 * .8 * (1 + .3 * (S.engLv - 1) + .25 * (S.capLv - 1)) * (1 + (100 - S.hull) / 150)), secs:Math.max(3, Math.round((bq ? 1.5 : 1) * d / (18 + S.engLv * 7) * (S.hull < 40 ? 1.3 : 1))) }; };
const recov = (o, now = NOW()) => 100 - (100 - o.v) * Math.pow(.94, (now - o.t) / 30000);   // a oferta volta a 100% com o tempo: função do relógio, igual em qualquer aparelho
const escFator = id => (escasso(S.loc, NOW()) === id ? 1 - .3 * (1 - (NOW() % ESC_JAN) / ESC_JAN) : 1);   // espelho do servidor: em falta = estoque efetivo baixo, que volta ao normal em 10 min
const stk = id => { const o = S.stock[S.loc]?.[id]; return (o ? recov(o) : 100) * escFator(id); };
const setStk = (id, v) => { (S.stock[S.loc] ??= {})[id] = { v:Math.max(1, v / escFator(id)), t:Date.now() }; };
const SIT_JAN = 900000, SITS = { quarentena: ['Quarentena', 'ninguém pousa aqui'], greve: ['Greve', 'vendas rendem 10% menos'], feira: ['Feira', 'vendas rendem 8% mais'], bloqueio: ['Bloqueio', 'viagens até aqui: +50% de tempo e +30% de combustível'] };
function situacao(planId, now) {   // espelho do servidor: a cada 15 min ~21% dos planetas entram em quarentena, greve, feira ou bloqueio
  if (S.partida) return null;
  const h = hash(`sit:${GI()}:${planId}:${Math.floor(now / SIT_JAN)}`) % 100;
  return h < 4 ? 'quarentena' : h < 10 ? 'greve' : h < 16 ? 'feira' : h < 21 ? 'bloqueio' : null;
}
const sitTag = (planId, cls = 'sit') => { const k = situacao(planId, NOW()); return k ? `<span class="${cls} sit-${k}" title="${SITS[k][1]}">${SITS[k][0].toUpperCase()}</span>` : ''; };
const ESC_JAN = 600000;   // espelho do servidor: a cada 10 min ~35% dos planetas ficam sem um produto (não dá para comprar; preço sobe e desce sozinho)
function escasso(planId, now) {
  if (S.partida) return null;
  const prods = RES.filter(r => (r.t || 0) <= S.rank), h = hash(`esc:${GI()}:${planId}:${Math.floor(now / ESC_JAN)}`);
  return prods.length && h % 100 < 35 ? prods[(h >>> 8) % prods.length].id : null;
}
function pxAt(id, st) { return S.price[id] * (plan(S.loc).m[id] || 1) * (1 + .12 * GI()) * clamp((100 / Math.max(st, 5)) ** .4, .6, 2.5) * (S.ev && S.ev.r === id && (!S.ev.p || S.ev.p === S.loc) ? S.ev.m : 1); }
function px(id) { return pxAt(id, stk(id)); }

function goTo(to, rota) {
  if (S.trip) return say('Nave em trânsito.', 'err');
  if (to === S.loc) return;
  if (CLOUD()) return act('viajar', { to, rota }).then(ok => { if (ok) { sel = selG = null; const g = GALAXIES[S.gal]; flyTo(g.wx, g.wy, 1, 700); renderInfo(); } });
  if (plan(to).t > S.rank) return say('Setor bloqueado: suba de patente.', 'err');
  if (S.hull < 15) return say('Casco crítico: repare a nave na aba Frotas.', 'err');
  const t = trip(to);
  if (t.cost > S.credits) return say(`Combustível custa ${fmt(t.cost)} Cr. Créditos insuficientes.`, 'err');
  S.credits -= t.cost; S.trip = { from:S.loc, to, start:Date.now(), end:Date.now() + t.secs * 1000 }; sel = null; selG = null; { const g = GALAXIES[S.gal]; flyTo(g.wx, g.wy, 1, 700); }   // fecha a janela e centraliza na galáxia
  save(); render(); say(`Rumo a ${plan(to).nome}: ${t.secs}s, combustível ${fmt(t.cost)} Cr.`);
  setTimeout(arrive, t.secs * 1000);
}
function arrive() {
  if (CLOUD()) return refrescar();
  if (!S.trip) return; const d = dist(plan(S.trip.from), plan(S.trip.to)); S.loc = S.trip.to; S.trip = null; S.daily.p.trips++; wear(d); save(); render();
  const m = plan(S.loc).m, deals = Object.keys(m).filter(k => m[k] < 1).map(k => SHORT[k]);
  say(`Chegada em ${plan(S.loc).nome}.` + (deals.length ? ` Compre barato: ${deals.join(', ')}.` : ''), 'ok');
}
const fixCost = () => Math.round((S.maxHull - S.hull) * 12 * (1 + .25 * (S.capLv + S.engLv - 2)));
const overCost = () => Math.round((100 - S.maxHull) * 12 * (1 + .25 * (S.capLv + S.engLv - 2)) * 10);
function wear(d) {
  const D = GI();
  let dmg = Math.round((2 + Math.random() * 4) * d / 120 * (1 + (S.engLv - 1) * .1) * (1 + D * .2)), msg = '', kind = 'err';
  if (Math.random() < Math.min(.6, .28 + .05 * D)) {
    const foe = D >= 4 ? 'Leviatã estelar' : D >= 2 ? 'Enxame de drones' : 'Piratas', r = Math.random();
    if (r < .3) { const h = [['Chuva de asteroides', 9, 16], ['Tempestade solar', 6, 11]][Math.random() * 2 | 0]; dmg += ((h[1] + Math.random() * (h[2] - h[1])) * (1 + D * .15)) | 0; msg = h[0] + '! '; }
    else if (Math.random() < clamp(.4 + .13 * S.wpLv - .06 * D, .1, .9)) { const b = Math.round((300 + Math.random() * 500) * (1 + D)); S.credits += b; dmg += 2; kind = 'win'; msg = `${foe} repelidos! Recompensa +${fmt(b)} Cr. `; }
    else { dmg += ((6 + Math.random() * 8) * (1 + D * .5)) | 0; msg = `${foe} atacaram! `;
      const own = RES.filter(x => S.inv[x.id].qty > 0);
      if (own.length) { const x = own[Math.random() * own.length | 0], q = Math.ceil(S.inv[x.id].qty * (.25 + D * .05)); S.inv[x.id].qty -= q; if (!S.inv[x.id].qty) S.inv[x.id].avg = 0; msg += `Perdeu ${q} × ${x.nome}. `; } }
  }
  S.hull = Math.max(0, S.hull - dmg);
  if (msg || dmg >= 8) say(`${msg}Casco -${dmg}% (agora ${S.hull}%).`, kind); else note(`Casco -${dmg}% (agora ${S.hull}%).`);
  if (S.hull < 30) note('⚠ Casco crítico: repare a nave na aba Frotas.', 'alert');
  save(); render();
}
function service(k) {
  const c = k === 'fix' ? fixCost() : overCost();
  if (c > S.credits) return say(`Faltam ${fmt(c - S.credits)} créditos.`, 'err');
  S.credits -= c; if (k === 'fix') { S.maxHull = Math.max(40, S.maxHull - 1); S.hull = S.maxHull; } else { S.maxHull = 100; S.hull = 100; }
  save(); render(); say(k === 'fix' ? 'Casco reparado.' : 'Revisão completa: nave como nova.', 'ok');
}
function upgrade(k) {
  if (CLOUD()) return act('melhorar', { k });
  if (k === 'fix' || k === 'over') return service(k);
  const c = k === 'cap' ? 1000 * S.capLv : k === 'wp' ? 1500 * S.wpLv : 1200 * S.engLv;
  if (k === 'eng' && S.engLv >= 5) return;
  if (c > S.credits) return say(`Faltam ${fmt(c - S.credits)} créditos.`, 'err');
  S.credits -= c; if (k === 'cap') { S.cap += 40; S.capLv++; } else if (k === 'wp') S.wpLv++; else S.engLv++;
  save(); render(); say('Upgrade instalado!', 'ok');
}

const ROTULO = { cap:'Porão', eng:'Motor', wp:'Armamento' };
function upRowsNave() {   // melhorias da nave equipada (níveis 1 a 5)
  if (!S.frota || !S.frota[S.nave]) return '';
  const n = NAVES[S.nave - 1], f = S.frota[S.nave], val = { cap:L => capDe(n, L), eng:L => engDe(n, L).toFixed(1), wp:L => wpDe(n, L).toFixed(1) }, dica = { cap:'Capacidade', eng:'Classe do motor (viagens mais rápidas)', wp:'Poder de fogo contra piratas' };
  const outra = pvShip && pvShip !== S.nave;   // olhando a prévia de outra nave: os upgrades abaixo continuam sendo da nave equipada
  const LJ = typeof LJ_ST !== 'undefined' ? LJ_ST : [];
  return `<div class="${outra ? 'dim' : ''}"><h3 class="nave-t">${n.nome} <small>Nave ${S.nave} de ${NAVES.length}</small></h3><p class="empty">Porão ${used()}/${S.cap} · Motor ${S.engLv.toFixed(1)} · Armas ${S.wpLv.toFixed(1)}</p><ul class="lj-st up-st">` + ['cap', 'eng', 'wp'].map((k, ix) => {
    const L = f[PVK[k]], max = L >= 5, t = LJ[ix], px = v => Math.max(6, Math.round(Math.sqrt(v / t.max) * 100)), v = t.val(n, f), vn = max ? v : t.val(n, { ...f, [PVK[k]]: L + 1 });
    return `<li><i class="fa-solid ${t.ic}"></i><div><span>${t.rot} <em class="up-nv">nv. ${L}/5</em> <b>${t.fmt(v)}</b>${max ? '' : ` <em class="ljm">▲ ${t.fmt(vn)}</em>`}</span><div class="lj-bar up-bar"><i class="nx" style="width:${px(vn)}%"></i><i style="width:${px(v)}%"></i></div><small>${t.txt} · no nível 5: <b>${t.fmt(t.mx(n))}</b></small>`
      + `<button class="buy" data-up="${k}" ${max ? 'disabled' : ''}>${max ? 'Nível máximo' : `Melhorar para o nv. ${L + 1} · ${fmt(upCusto(n, k, L)).replace(',00', '')} Cr`}</button></div></li>`;
  }).join('') + '</ul></div>';
}
let hangarSig = '', hangarTab = 'minhas';
const peq = x => x >= 1e6 ? (x / 1e6).toFixed(x % 1e6 ? 1 : 0).replace('.', ',') + ' mi' : x >= 1e3 ? (x / 1e3).toFixed(x % 1e3 ? 1 : 0).replace('.', ',') + ' mil' : String(x);
function renderHangar() {   // hangar: minhas naves e loja (50 naves; patente e créditos para comprar)
  const el = $('#hangar'); if (!el) return;
  if (!CLOUD() || !S.frota) { el.hidden = true; return; } el.hidden = false;
  const emPartida = !!S.partida;
  const estado = NAVES.map(n => S.frota[n.id] ? (n.id === S.nave ? 'E' : 'O') : S.rank < n.rank ? 'L' : S.credits >= n.preco ? 'B' : 'P');
  const sig = hangarTab + '|' + emPartida + '|' + estado.join('') + '|' + Object.values(S.frota).map(f => f.c + '' + f.m + f.a).join(',');
  if (sig === hangarSig) return; hangarSig = sig;
  const lista = NAVES.filter(n => S.frota[n.id]);
  const tile = n => {
    const f = S.frota[n.id], st = estado[n.id - 1], c = f ? f.c : 1, m = f ? f.m : 1, a = f ? f.a : 1;
    const img = `<div class="ntile-img" data-prev="${n.id}"><img loading="lazy" alt="" src="${nsrc(n.id, 'motor', m)}"><img loading="lazy" alt="" src="${nsrc(n.id, 'casco')}"><img loading="lazy" alt="" src="${nsrc(n.id, 'porao', c)}"><img loading="lazy" alt="" src="${nsrc(n.id, 'armas', a)}"></div>`;
    const info = f ? `Nv. ${f.c}/${f.m}/${f.a} · porão ${capDe(n, f.c)}` : `porão ${n.cap0} · motor ${n.eng0.toFixed(1)} · armas ${n.wp0.toFixed(1)}`;
    const btn = st === 'E' ? '<span class="tag">Equipada</span>' : st === 'O' ? `<button type="button" class="buy" data-equip="${n.id}" ${emPartida ? 'disabled' : ''}>Equipar</button>`
      : st === 'L' ? `<span class="tag lock">🔒 ${RANKS[n.rank][1]}</span>` : `<button type="button" class="buy" data-compra="${n.id}" ${st === 'P' || emPartida ? 'disabled' : ''}>${fmt(n.preco).replace(',00', '')} Cr</button>`;
    return `<div class="ntile ${st === 'E' ? 'eq' : ''} ${st === 'L' ? 'lk' : ''}">${img}<b>${n.nome}</b><small>Nave ${n.id} · ${info}</small>${btn}</div>`;
  };
  el.innerHTML = `<h3 class="nave-t">Hangar <small>${Object.keys(S.frota).length} de ${NAVES.length} naves</small></h3><button type="button" class="buy hg-loja" data-shop="nave"><i class="fa-solid fa-bag-shopping"></i> Comprar mais naves na Loja</button>`
    + (emPartida ? '<p class="empty">Troca e compra de naves ficam desligadas durante uma partida.</p>' : '')
    + `<div class="ngrid">${lista.map(tile).join('') || '<p class="empty">Nada por aqui.</p>'}</div>`;
}
function renderWorld() {
  renderInfo(); renderShipCard();
  $('#trip').textContent = S.trip ? `Em trânsito para ${plan(S.trip.to)?.nome || ''}…` : '';
  $('#p-market h2').innerHTML = 'Terminal de mercado · ' + (S.trip ? 'em trânsito' : (plan(S.loc)?.nome || '')) + (S.trip ? '' : ' ' + sitTag(S.loc));
  $('#fleet').innerHTML = (semCasco() ? `<p class="empty">Esta partida não tem desgaste de casco: viagens e lutas não danificam a nave, então não há reparo.</p>` : `<ul class="lj-st up-st hull-st"><li><i class="fa-solid fa-heart-pulse"></i><div><span>Casco <b class="${S.hull < 30 ? 'down' : ''}">${S.hull}%</b> <em class="up-nv">máx. ${S.maxHull}%</em></span><div class="lj-bar up-bar${S.hull < 30 ? ' low' : ''}"><i class="nx" style="width:${S.maxHull}%"></i><i style="width:${S.hull}%"></i></div><small>Casco baixo enfraquece o poder de fogo. A parte clara da barra é a integridade máxima.</small>
      <button class="buy" data-up="fix" ${S.hull >= S.maxHull ? 'disabled' : ''}>${S.hull >= S.maxHull ? 'Casco no máximo' : `Reparar casco · ${fmt(fixCost()).replace(',00', '')} Cr`}</button><small class="up-n">Cada reparo desgasta 1% da integridade máxima.</small></div></li>
    <li><i class="fa-solid fa-screwdriver-wrench"></i><div><span>Revisão completa <em class="up-nv">máx. ${S.maxHull}% → 100%</em></span><small>Restaura a integridade máxima a 100%.</small><button class="buy" data-up="over" ${S.maxHull >= 100 ? 'disabled' : ''}>${S.maxHull >= 100 ? 'Integridade em 100%' : `Revisão completa · ${fmt(overCost()).replace(',00', '')} Cr`}</button></div></li></ul>
`) + `
    ${CLOUD() ? upRowsNave() : `<p class="empty">Porão: ${used()}/${S.cap} · Motor nv.${S.engLv}</p>
    <div class="up"><div><b>Porão nv.${S.capLv}</b><small>+40 de capacidade</small></div><button class="buy" data-up="cap">${fmt(1000 * S.capLv)} Cr</button></div>
    <div class="up"><div><b>Motor nv.${S.engLv}</b><small>Viagens mais rápidas · alcance de ${pl(S.engLv, 'salto galáctico', 'saltos galácticos')}</small></div><button class="buy" data-up="eng" ${S.engLv >= 5 ? 'disabled' : ''}>${S.engLv >= 5 ? 'MÁX' : fmt(1200 * S.engLv) + ' Cr'}</button></div>
    <div class="up"><div><b>Armamento nv.${S.wpLv}</b><small>Chance de repelir piratas e monstros aqui: ${Math.round(clamp(.4 + .13 * S.wpLv - .06 * GI(), .1, .9) * 100)}%</small></div><button class="buy" data-up="wp">${fmt(1500 * S.wpLv)} Cr</button></div>`}`;
  renderHangar();
  const e = $('#evt'); e.hidden = !S.ev || (!!S.ev.p && !plan(S.ev.p)); if (!e.hidden) e.textContent = `⚡ ${S.ev.t}${S.ev.p ? ' (só em ' + plan(S.ev.p).nome + ')' : ''} · ${S.ev.left} min`;
  let k = S.rank; const w = S.credits + cargo(); if (!CLOUD()) RANKS.forEach((r, i) => { if (w >= r[0] && i > k) k = i; });   // a patente só sobe: nunca fica abaixo da já conquistada
  $('#rank').textContent = RANKS[k][1];
  if (!CLOUD() && k > S.rank) { S.rank = k; save(); const nu = GALAXIES.flatMap(g => g.planetas).filter(p => p.t === k).map(p => p.nome).slice(0, 4).concat(RES.filter(r => r.t === k).map(r => r.nome)); say(`Nova patente: ${RANKS[k][1]}! Desbloqueado: ${nu.join(', ') || '—'}.`, 'win'); render(); }
  renderMeta();
}

/* ---------- Galáxias: dados FIXOS em galaxias.js (gerado por tools/gerar_galaxias.py) ---------- */
const GI = () => S.gal;
const galName = () => GALAXIES[S.gal].nome;
const IMGS = {};
function planetImg(p) {
  const f = p.img; if (!f) return null; const e = IMGS[f];
  if (e) return e.ok ? e.cv : null;
  const im = new Image(), en = IMGS[f] = { ok:false };
  im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(im, 0, 0, 256, 256); en.cv = c; en.ok = true; };
  im.src = 'assets/planets/' + f; return null;
}
function setGalaxy(i) {
  S.gal = i; sel = null; selG = null; hov = null; PL.length = 0; document.body.dataset.gal = i;
  PL.push(...GALAXIES[i].planetas); PL.forEach(p => { PST[p.id] = p; }); buildLanes();
}
function buildLanes() {
  lanes.length = 0; const seen = new Set();
  PL.forEach(a => PL.filter(b => b !== a).sort((x, y) => dist(a, x) - dist(a, y)).slice(0, 2).forEach(b => { const k = [a.id, b.id].sort().join(); if (!seen.has(k)) { seen.add(k); lanes.push([a, b]); } }));
}
const galOk = i => S.rank >= GALAXIES[i].t && S.engLv >= GALAXIES[i].eng;
const jumpCost = i => Math.round(150 * (1 + i) * hops(i) * (1 + .3 * (S.engLv - 1) + .25 * (S.capLv - 1)) * (1 + (100 - S.hull) / 150));
let warpT = 0;
function jump(i) {
  if (S.trip) return say('Nave em trânsito.', 'err');
  if (CLOUD()) { if (i !== S.gal) act('saltar', { i }); return; }
  const g = GALAXIES[i], hop = hops(i), c = jumpCost(i); if (i === S.gal) return;
  if (S.rank < g.t) return say(`A galáxia ${g.nome} exige a patente ${RANKS[g.t][1]}.`, 'err');
  if (S.engLv < g.eng) return say(`A galáxia ${g.nome} exige motor nv.${g.eng}.`, 'err');
  if (S.hull < 25) return say('Casco crítico: repare antes de saltar.', 'err');
  if (c > S.credits) return say(`O salto custa ${fmt(c)} Cr. Créditos insuficientes.`, 'err');
  S.credits -= c; setGalaxy(i); S.loc = PL[0].id; warpT = performance.now(); flyTo(g.wx, g.wy, 1, 1400); S.daily.p.trips++;
  const first = !S.vis[i]; S.vis[i] = 1; say(`Salto concluído: Galáxia ${g.nome}${first ? ' (nova!)' : ''}.`, 'ok');
  if (first) { const b = 200 * i; S.credits += b; say(`Bônus de exploração: +${fmt(b)} Cr!`, 'win'); }
  wear(120 * hop + i * 40);
}
const GAL_R = 150, HOP = 560, GLANES = [];
const hops = i => Math.max(1, Math.round(Math.hypot(GALAXIES[i].wx - GALAXIES[S.gal].wx, GALAXIES[i].wy - GALAXIES[S.gal].wy) / HOP));
const gHue = i => (i * 53 + 190) % 360;
const GSTAR = Array.from({ length:110 }, (_, k) => { const r = Math.pow((k + .5) / 110, .7); return { r, a:r * 4 + (k % 3) * 2.094 + ((k * 7919) % 100) / 100 * .5, b:((k * 37) % 10) / 10, l:62 + (k % 4) * 8 }; });

/* ---------- Nave: camadas SVG (motor, casco, porão, armas), hangar e prévia ---------- */
const NIMG = {};
const nimg = p => NIMG[p] || (NIMG[p] = Object.assign(new Image(), { src:p }));
const nsrc = (id, parte, L) => { const n = String(id).padStart(2, '0'); return `assets/naves/nave_${n}/nave_${n}_${parte}${L == null ? '' : '_n' + L}.svg`; };
const naveLv = () => {   // nave equipada e níveis (1 a 5). Sem servidor (modo local) usa a Nave 1 com os níveis antigos limitados a 5.
  const f = S.frota && S.frota[S.nave];
  return f ? { id:S.nave, c:f.c, m:f.m, a:f.a } : { id:1, c:Math.min(5, S.capLv | 0 || 1), m:Math.min(5, S.engLv | 0 || 1), a:Math.min(5, S.wpLv | 0 || 1) };
};
const shipLv = () => ({ ...naveLv(), hull:S.hull, max:S.maxHull });
const PVK = { cap:'c', eng:'m', wp:'a' };
function paintShip(c, o, ts, size = 56) {   // desenha de trás para a frente: motor, casco, porão, armas
  const half = size / 2, hl = o.hl, camadas = [['m', nsrc(o.id, 'motor', o.m)], ['', nsrc(o.id, 'casco')], ['c', nsrc(o.id, 'porao', o.c)], ['a', nsrc(o.id, 'armas', o.a)]];
  c.save();
  for (const [k, src] of camadas) {
    const im = nimg(src); if (!im.complete || !im.naturalWidth) continue;
    c.shadowColor = '#3ee6ff'; c.shadowBlur = hl && k === hl ? 12 : 0; c.drawImage(im, -half, -half, size, size);
  }
  c.shadowBlur = 0;
  if (o.hull < 70) { c.strokeStyle = 'rgba(15,8,4,.75)'; c.lineWidth = .6; c.beginPath(); c.moveTo(-3, -4); c.lineTo(-1, 0); c.lineTo(-4, 4); c.moveTo(3, 2); c.lineTo(5, 8); c.stroke(); }
  if (o.hull < 40) {
    for (let i = 0; i < 3; i++) { const t = (ts / 700 + i / 3) % 1; c.fillStyle = `rgba(150,150,150,${.5 * (1 - t)})`; c.beginPath(); c.arc(3 + Math.sin(t * 6 + i) * 2, 2 - t * 14, 1.5 + t * 2.5, 0, 7); c.fill(); }
    if (Math.sin(ts / 90) > .3) { c.fillStyle = '#ffb347'; c.fillRect(-4 + Math.sin(ts / 40) * 3, 3, 1.2, 1.2); }
  }
  c.restore();
}
function drawHangar(cv2, o, ts, big) {
  if (!cv2) return; const w = cv2.clientWidth; if (!w) return;
  const dpr = devicePixelRatio || 1, r = big ? .7 : .8, H = 100 * r;
  if (cv2.width !== Math.round(w * dpr)) { cv2.width = Math.round(w * dpr); cv2.height = Math.round(w * r * dpr); }
  const c = cv2.getContext('2d'); c.setTransform(dpr * w / 100, 0, 0, dpr * w / 100, 0, 0);
  const g = c.createRadialGradient(50, H * .5, 4, 50, H * .5, 70); g.addColorStop(0, '#0f2b52'); g.addColorStop(1, '#030710'); c.fillStyle = g; c.fillRect(0, 0, 100, H);
  c.fillStyle = '#fff'; for (let i = 0; i < 24; i++) { c.globalAlpha = .3 + .5 * Math.abs(Math.sin(ts / 900 + i)); c.fillRect((i * 37) % 100, (i * 23) % H, .5, .5); } c.globalAlpha = 1;
  c.strokeStyle = 'rgba(62,230,255,.55)'; c.lineWidth = .5; c.setLineDash([2, 2]); c.lineDashOffset = -ts / 90;
  [[28, 6.5], [20, 4.6]].forEach(([rx, ry]) => { c.beginPath(); c.ellipse(50, H * .84, rx, ry, 0, 0, 7); c.stroke(); }); c.setLineDash([]);
  c.save(); c.translate(50, H * .46 + Math.sin(ts / 700) * 1.2); paintShip(c, o, ts, big ? 86 - (o.id - 1) * .56 : 76 - (o.id - 1) * .3); c.restore();   // naves pequenas são desenhadas maiores na caixa, para aparecerem

  if (big && o.label) { c.fillStyle = '#3ee6ff'; c.font = '600 3.6px Chakra Petch, sans-serif'; c.textAlign = 'left'; c.fillText(o.label, 3, 6); }
}
let pvHover = null, pvPin = null, pvShown = '', pvShip = 0;   // pvShip: nave da loja em prévia
const PVN = { cap:'Porão', eng:'Motor', wp:'Armamento' };
function shipFrame(ts) {
  requestAnimationFrame(shipFrame); if (document.hidden) return;
  const lv = shipLv(), k = pvHover || pvPin;
  let o = lv, txt = '';
  if (pvShip && pvShip !== lv.id) { const nv = NAVES[pvShip - 1], f = S.frota && S.frota[pvShip]; o = { id:pvShip, c:f ? f.c : 1, m:f ? f.m : 1, a:f ? f.a : 1, hull:f ? f.h : 100, max:100, label:nv.nome }; }
  else if (k) { const f = PVK[k]; o = { ...lv, [f]:Math.min(5, lv[f] + 1), hl:f }; }
  txt = '';
  drawHangar($('#shipview'), o, ts, true);
  drawHangar($('#shipmini'), lv, ts, false);
  if (txt !== pvShown) { pvShown = txt; $('#pvlabel').textContent = txt; }
}
function renderShipCard() {
  const n = NAVES[(S.nave || 1) - 1], lv = naveLv();
  $('#shipstat').innerHTML = `<li>Nave <b>${n.nome}</b></li><li>Casco <b class="${S.hull < 30 ? 'down' : 'up'}">${S.hull}%</b></li><li>Porão <b>${used()}/${S.cap}</b></li><li>Motor <b>${S.engLv.toFixed(1)}</b></li><li>Armas <b>${S.wpLv.toFixed(1)}</b></li>`;
}

/* ---------- Mapa 2.5D animado (canvas) ---------- */
const PL = [];
const PST = {};
let cv, cx, K = 1, sel = null, selG = null, hov = null, trail = [], stars = [], touched = false, camT = null;
const cam = { x:0, y:0, z:1 };
const lanes = [];
function lscr(i, p) {   // planeta da galáxia i -> mundo e tela
  const G = GALAXIES[i], t = p.y / 300, wx = G.wx + (p.x - 200) * (.82 + .3 * t), wy = G.wy + p.y * .8 - 104;
  return { wx, wy, x:(wx - cam.x) * cam.z + 200, y:(wy - cam.y) * cam.z + 150, sc:(.72 + .5 * t) * cam.z };
}
function proj(p, ts) { const o = lscr(S.gal, p); p._s = { x:o.x, y:o.y + Math.sin(ts / 900 + p.x) * 1.6 * o.sc, sc:o.sc }; }
const gScr = i => ({ x:(GALAXIES[i].wx - cam.x) * cam.z + 200, y:(GALAXIES[i].wy - cam.y) * cam.z + 150 });
function hitPlanet(p) { if (cam.z < .35) return null; return PL.find(q => q._s && Math.hypot(q._s.x - p.x, q._s.y - p.y) < Math.max((PST[q.id].r + 10) * q._s.sc, 9)) || null; }
function hitGal(p) {
  let best = -1, bd = 9;
  GALAXIES.forEach((g, i) => { const s = gScr(i), R = Math.max(GAL_R * cam.z, 32), d = ((p.x - s.x) / R) ** 2 + ((p.y - s.y) / (R * .62)) ** 2; if (d < 1 && d < bd) { bd = d; best = i; } });
  return best;
}
function flyTo(x, y, z, dur = 1100) { camT = { fx:cam.x, fy:cam.y, fz:cam.z, x, y, z, t0:performance.now(), dur }; }
function zoomAt(pt, f) { camT = null; const wx = cam.x + (pt.x - 200) / cam.z, wy = cam.y + (pt.y - 150) / cam.z, z = clamp(cam.z * f, .12, 1.8); cam.z = z; cam.x = wx - (pt.x - 200) / z; cam.y = wy - (pt.y - 150) / z; }
function fitAll() { const xs = GALAXIES.map(g => g.wx), ys = GALAXIES.map(g => g.wy), x0 = Math.min(...xs) - 230, x1 = Math.max(...xs) + 230, y0 = Math.min(...ys) - 170, y1 = Math.max(...ys) + 170; flyTo((x0 + x1) / 2, (y0 + y1) / 2, clamp(Math.min(400 / (x1 - x0), 300 / (y1 - y0)), .12, 1), 1300); }
function placeSheet() {   // janela de dados encostada no alvo, do lado com mais espaço
  const sh = $('#mapsheet'); if (!cv || sh.hidden) return;
  let tx, ty, rr;
  if (selG != null) { const o = gScr(selG); tx = o.x; ty = o.y; rr = Math.max(GAL_R * cam.z, 32) * .85; }
  else if (sel && PST[sel] && PST[sel]._s) { const o = PST[sel]._s; tx = o.x; ty = o.y; rr = PST[sel].r * o.sc * 1.5 + 8; } else return;
  const W = cv.clientWidth, H = cv.clientHeight, w = sh.offsetWidth, h = sh.offsetHeight, px = tx * K, py = ty * K, right = px < W / 2;
  let x = clamp(right ? px + rr * K + 12 : px - rr * K - 12 - w, 8, Math.max(8, W - 8 - w));
  const y = clamp(py - h / 2, 8, Math.max(8, H - 8 - h)); if (y < 178) x = Math.max(8, Math.min(x, W - 52 - w));   // não cobre os botões de zoom
  sh.classList.toggle('at-r', right); sh.classList.toggle('at-l', !right);
  sh.style.setProperty('--ay', clamp(py - y, 16, h - 16) + 'px'); sh.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
}
function clickMap(p) {
  const q = hitPlanet(p); touched = true;
  if (q) { sel = q.id; selG = null; } else { const i = hitGal(p); sel = null; selG = i >= 0 ? i : null; }
  renderInfo();
  const f = sel ? lscr(S.gal, PST[sel]) : selG != null ? { wx:GALAXIES[selG].wx, wy:GALAXIES[selG].wy } : null;
  if (f) { const o = sel ? lscr(S.gal, PST[sel]) : gScr(selG); if (o.x < 60 || o.x > 340 || o.y < 50 || o.y > 250) flyTo(f.wx, f.wy, cam.z, 450); }   // só recentra se o alvo estiver perto da borda
  placeSheet();
}
function buildMap() {
  cv = $('#map'); cx = cv.getContext('2d'); buildLanes();
  stars = Array.from({ length:220 }, () => ({ x:Math.random() * 400, y:Math.random() * 300, s:Math.random() * 1.2 + .3, p:Math.random() * 6, z:Math.random() }));
  GLANES.length = 0; const seen = new Set();
  GALAXIES.forEach((a, i) => GALAXIES.map((b, j) => j).filter(j => j !== i).sort((x, y) => Math.hypot(GALAXIES[x].wx - a.wx, GALAXIES[x].wy - a.wy) - Math.hypot(GALAXIES[y].wx - a.wx, GALAXIES[y].wy - a.wy)).slice(0, 2).forEach(j => { const k = [i, j].sort().join(); if (!seen.has(k)) { seen.add(k); GLANES.push([i, j]); } }));
  const c = GALAXIES[S.gal]; cam.x = c.wx; cam.y = c.wy; cam.z = 1;
  const ptrs = new Map(); let drag = null, pinch = 0;
  const lpos = e => { const r = cv.getBoundingClientRect(); return { x:(e.clientX - r.left) / K, y:(e.clientY - r.top) / K }; };
  const pd = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }, pm = () => { const [a, b] = [...ptrs.values()]; return { x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 }; };
  cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch {} const p = lpos(e); ptrs.set(e.pointerId, p); drag = { id:e.pointerId, moved:0 }; camT = null; touched = true; if (ptrs.size === 2) { pinch = pd(); drag.moved = 99; } });
  cv.addEventListener('pointermove', e => {
    const p = lpos(e);
    if (!ptrs.has(e.pointerId)) { hov = hitPlanet(p); cv.style.cursor = hov || hitGal(p) >= 0 ? 'pointer' : 'grab'; return; }
    const pr = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) { const d = pd(); if (pinch) zoomAt(pm(), d / pinch); pinch = d; if (drag) drag.moved = 99; return; }
    if (!drag) return; drag.moved += Math.abs(p.x - pr.x) + Math.abs(p.y - pr.y);
    if (drag.moved > 6) { cam.x -= (p.x - pr.x) / cam.z; cam.y -= (p.y - pr.y) / cam.z; }
  });
  const up = e => { const p = lpos(e); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (drag && drag.id === e.pointerId && drag.moved <= 6 && e.type === 'pointerup') clickMap(p); if (!ptrs.size) drag = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); touched = true; zoomAt(lpos(e), Math.exp(-e.deltaY * .0015)); }, { passive:false });
  $('#mz-in').onclick = () => zoomAt({ x:200, y:150 }, 1.4); $('#mz-out').onclick = () => zoomAt({ x:200, y:150 }, 1 / 1.4);
  $('#sheetx').onclick = () => { sel = selG = null; renderInfo(); };
  $('#mz-home').onclick = () => { const g = GALAXIES[S.gal]; flyTo(g.wx, g.wy, 1); }; $('#mz-all').onclick = fitAll;
  requestAnimationFrame(frame);
}
function shipPos(t) {
  if (S.trip) {
    const a = plan(S.trip.from)._s, b = plan(S.trip.to)._s, st = S.trip.start || S.trip.end - 6000;
    const f0 = S.trip.enc && S.trip.enc[0], now = NOW(), m = f0 ? (now < f0.tc ? now - st : now < f0.tc + PAUSA ? f0.tc - st : now - st - PAUSA) : now - st;   // na luta a nave para
    let u = clamp(m / (S.trip.end - st - (f0 ? PAUSA : 0)), 0, 1); u = u * u * (3 - 2 * u);
    return { x:a.x + (b.x - a.x) * u, y:a.y + (b.y - a.y) * u, ang:Math.atan2(b.y - a.y, b.x - a.x), sc:a.sc + (b.sc - a.sc) * u, fly:1 };
  }
  const s = plan(S.loc)._s, r = (PST[S.loc].r + 16) * s.sc, a = t / 2500;
  return { x:s.x + Math.cos(a) * r * 1.1, y:s.y - 4 * s.sc + Math.sin(a) * r * .4, ang:Math.atan2(Math.cos(a) * .4, -Math.sin(a)), sc:s.sc, fly:0 };
}
function miniShip(x, y, ang, sc, col) {
  cx.save(); cx.translate(x, y); cx.rotate(ang + Math.PI / 2); cx.scale(sc, sc); cx.fillStyle = col; cx.shadowColor = col; cx.shadowBlur = 6;
  cx.beginPath(); cx.moveTo(0, -5); cx.lineTo(3, 4); cx.lineTo(0, 2); cx.lineTo(-3, 4); cx.closePath(); cx.fill(); cx.restore();
}
function ringArc(s, r, back) { cx.strokeStyle = 'rgba(232,194,122,.8)'; cx.lineWidth = 2 * s.sc; cx.beginPath(); cx.ellipse(s.x, s.y, r * 1.8, r * .5, -.35, back ? Math.PI : 0, back ? 2 * Math.PI : Math.PI); cx.stroke(); }
const LBL = [];
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Rótulos dos planetas sem sobreposição: prioridade para onde você está, o planeta escolhido e o destino; os demais só aparecem se couberem
 *  (embaixo ou, se não couber, em cima) e sem cobrir outro planeta. A linha de detalhe (minério e combustível) depende do zoom. */
function drawLabels() {
  const placed = [], discs = LBL.map(l => ({ x: l.x - l.r * 1.3, y: l.y - l.r * 1.3, w: l.r * 2.6, h: l.r * 2.6, l }));
  LBL.sort((a, b) => b.pr - a.pr || b.r - a.r || a.y - b.y);
  for (const l of LBL) {
    const p = l.p, m = p.m, best = Object.keys(m).sort((x, y) => m[x] - m[y])[0], fs = (l.dense ? 7 : 8.5) * Math.max(p._s.sc, .9);
    cx.font = `600 ${fs}px Chakra Petch, sans-serif`; cx.textAlign = 'center';
    const w = cx.measureText(p.nome).width + 10, det = l.here || l.on || l.lock || (!l.dense && cam.z >= .9) || cam.z >= 1.6;
    const txt2 = !det ? '' : l.lock ? '🔒 ' + RANKS[p.t][1] : l.here ? '● você está aqui' : `${best && m[best] < 1 ? '▼' + SHORT[best] + ' ' : ''}⛽${trip(p.id).cost}`;
    const down = l.y + l.r * 1.5 + 12, up = l.y - l.r * 1.5 - 4;
    let done = false;
    for (const [px, ty] of [[l.x, down], [l.x, up], [l.x + l.r * 1.5 + w / 2 + 2, l.y + 3], [l.x - l.r * 1.5 - w / 2 - 2, l.y + 3]]) {
      const baixo = px === l.x && ty === down, box = { x: px - w / 2, y: ty - 9, w, h: 12 }, area = baixo && txt2 ? { x: box.x, y: box.y, w, h: 22 } : box;
      if (l.pr < 3 && (placed.some(o => hit(area, o)) || discs.some(d => d.l !== l && hit(area, d)))) continue;
      cx.globalAlpha = l.lock ? .3 : 1; cx.fillStyle = 'rgba(4,10,20,.7)'; cx.fillRect(box.x, box.y, w, 12); cx.fillStyle = '#e6f1fb'; cx.fillText(p.nome, px, ty);
      { const sk = situacao(p.id, NOW()); if (sk) { cx.font = '700 6.5px Chakra Petch, sans-serif'; cx.fillStyle = { quarentena: '#ff4d6d', greve: '#ffb347', feira: '#39ff88', bloqueio: '#ff9f43' }[sk]; cx.fillText(SITS[sk][0].toUpperCase(), px, ty - 10); cx.font = `600 ${fs}px Chakra Petch, sans-serif`; cx.fillStyle = '#e6f1fb'; } }
      placed.push(box);
      if (txt2 && baixo) { cx.fillStyle = l.here ? '#39ff88' : '#8fa3b8'; cx.font = '7px Chakra Petch, sans-serif'; cx.fillText(txt2, l.x, ty + 10); placed.push({ x: l.x - w / 2, y: ty + 2, w, h: 10 }); }
      done = true; break;
    }
    cx.globalAlpha = 1; void done;
  }
  LBL.length = 0;
}
function drawPlanet(p, ts) {
  const st = PST[p.id], s = p._s, dense = PL.length > 16, r = st.r * s.sc * (dense ? .78 : 1), here = !S.trip && p.id === S.loc, on = sel === p.id || hov === p;
  const col = here ? '57,255,136' : on ? '62,230,255' : '170,110,255', lock = p.t > S.rank; if (lock) cx.globalAlpha = .3;
  // anel de órbita no "chão" (como no mockup)
  cx.globalCompositeOperation = 'lighter'; cx.setLineDash([5, 4]); cx.lineDashOffset = -ts / 70;
  [[5, .12], [1.4, on || here ? .95 : .5]].forEach(([w, a]) => { cx.strokeStyle = `rgba(${col},${a})`; cx.lineWidth = w; cx.beginPath(); cx.ellipse(s.x, s.y + r * .95, r * 2.2, r * .62, 0, 0, 7); cx.stroke(); });
  cx.setLineDash([]);
  let g = cx.createRadialGradient(s.x, s.y, r * .7, s.x, s.y, r * 2.8); g.addColorStop(0, st.c + (on || here ? '99' : '55')); g.addColorStop(1, 'transparent');
  cx.fillStyle = g; cx.beginPath(); cx.arc(s.x, s.y, r * 2.8, 0, 7); cx.fill(); cx.globalCompositeOperation = 'source-over';
  const im = planetImg(p);
  if (im) { const w = 2 * r * (p.k || 2); cx.drawImage(im, s.x - w / 2, s.y - w / 2, w, w); } else {
  if (st.ring) ringArc(s, r, true);
  g = cx.createRadialGradient(s.x - r * .45, s.y - r * .45, r * .1, s.x, s.y, r * 1.05); g.addColorStop(0, '#fff'); g.addColorStop(.28, st.c); g.addColorStop(1, '#03060d');
  cx.fillStyle = g; cx.beginPath(); cx.arc(s.x, s.y, r, 0, 7); cx.fill();
  if (st.bands) { cx.save(); cx.beginPath(); cx.arc(s.x, s.y, r, 0, 7); cx.clip(); cx.fillStyle = 'rgba(0,0,0,.18)'; [-.5, -.1, .3, .65].forEach(o => cx.fillRect(s.x - r, s.y + o * r, r * 2, r * .16)); cx.restore(); }
  cx.strokeStyle = st.c + 'cc'; cx.lineWidth = .8 * s.sc; cx.beginPath(); cx.arc(s.x, s.y, r, -2.6, -.4); cx.stroke();
  if (st.ring) ringArc(s, r, false);
  const a = ts / 1800 + p.x; cx.fillStyle = '#d8efff'; cx.beginPath(); cx.arc(s.x + Math.cos(a) * r * 1.6, s.y + Math.sin(a) * r * .55, 1.7 * s.sc, 0, 7); cx.fill();
  }
  if (cam.z < .5) { cx.globalAlpha = 1; return; }
  // rótulo: não é desenhado aqui; entra numa fila e drawLabels() decide quais cabem sem se sobrepor (nomes nunca ficam escondidos)
  LBL.push({ p, x: s.x, y: s.y, r, dense, here, on, lock, pr: here || on ? 4 : S.trip && S.trip.to === p.id ? 3 : lock ? 0 : 1 });
  cx.globalAlpha = 1;
}

/* sprites pré-desenhados (naves pequenas do mapa): evita redesenhar/rasterizar SVG grande a cada quadro, o que travava o celular */
const SPR = {};
function sprite(id, m, armas) {
  const key = id + '_' + m + '_' + (armas ? 1 : 0); if (SPR[key]) return SPR[key];
  const ims = [nsrc(id, 'motor', m), nsrc(id, 'casco')].concat(armas ? [nsrc(id, 'armas', 1)] : []).map(nimg);
  if (!ims.every(im => im.complete && im.naturalWidth)) return null;
  const c = document.createElement('canvas'); c.width = c.height = 100; const g = c.getContext('2d'), z = (150 - (id - 1) * .8) * (100 / 150);
  ims.forEach(im => g.drawImage(im, 50 - z / 2, 50 - z / 2, z, z)); return SPR[key] = c;
}

/* ---------- tráfego ambiente: naves do jogo (decorativas) cruzando as rotas, menores e discretas para não confundir com a sua ---------- */
const NPCS = Array.from({ length:4 }, (_, i) => ({ id:1 + Math.floor(Math.random() * 50), m:1 + Math.floor(Math.random() * 3), a:null, b:null, t0:0, dur:0, wait:Math.random() * 6000 }));
function trafego(ts) {
  if (!PL.length || cam.z < .5 || !S.fx || S.trip) return;
  cx.save();
  NPCS.forEach(n => {
    let p1 = n.a && plan(n.a), p2 = n.b && plan(n.b);
    if (!p1 || !p2 || ts > n.t0 + n.dur) {   // sorteia a próxima etapa: qualquer planeta para qualquer outro, sempre diferente
      if (ts < n.t0 + n.dur + n.wait && p1 && p2) return;
      const o = PL[Math.random() * PL.length | 0]; let d = PL[Math.random() * PL.length | 0]; if (d === o) d = PL[(PL.indexOf(o) + 1) % PL.length];
      n.a = o.id; n.b = d.id; n.t0 = ts; n.dur = 6000 + Math.random() * 9000; n.wait = Math.random() * 5000; p1 = o; p2 = d;
    }
    const q = (ts - n.t0) / n.dur, d = q * q * (3 - 2 * q), a = p1._s, b = p2._s; if (!a || !b) return;
    const x = a.x + (b.x - a.x) * d, y = a.y + (b.y - a.y) * d, ang = Math.atan2(b.y - a.y, b.x - a.x), sc = (a.sc + b.sc) / 2, fade = Math.min(1, q * 8, (1 - q) * 8);
    cx.globalAlpha = .42 * fade; cx.strokeStyle = 'rgba(127,233,255,.3)'; cx.lineWidth = Math.max(.6, sc * .8); cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - Math.cos(ang) * 14 * sc, y - Math.sin(ang) * 14 * sc); cx.stroke();
    const im = sprite(n.id, n.m, false); if (im) { cx.save(); cx.translate(x, y); cx.rotate(ang + Math.PI / 2); const k = sc * .42 * .4 * 1.5; cx.scale(k, k); cx.drawImage(im, -50, -50); cx.restore(); }
  });
  cx.restore();
}
/* ---------- piratas e monstros: o servidor decide as lutas (S.trip.enc); aqui só se desenha. Mesma fórmula de patrulha do servidor. ---------- */
const HH = n => { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 0x45d9f3b); n ^= n >>> 4; n = Math.imul(n, 0x45d9f3b); n ^= n >>> 15; return n >>> 0; };
const PTG = g => (2 + .5 * g) * (1 + .02 * g);   // poder típico na galáxia (igual ao servidor)
function iniG(g, k) {
  const h = HH(g * 977 + k * 131 + 7), h2 = HH(h + 1), m = g >= 2 && k % 3 === 2, tier = clamp(1 + Math.floor((g + (k % 3)) * .4), 1, 5);
  const lv = Math.max(1, Math.round(10 * (m ? PTG(g) * 1.15 : PTG(g) * [.5, .8, .95][k % 3])) / 10);
  return { g, k, T:30000 + (h >> 4) % 25000, ph:((h2 >> 6) % 1000) / 1000, m, lv, tier, R:m ? 38 : 26 };
}
function iniAt(e, t) {
  const pl = GALAXIES[e.g].planetas, tt = t / e.T + e.ph, n = Math.floor(tt), u = tt - n, q = i => pl[HH(e.g * 977 + e.k * 131 + i * 7919 + 13) % pl.length], x = Math.min(1, u / .8);
  return { a:q(n - 1), b:q(n), f:x * x * (3 - 2 * x) };
}
const semCasco = () => !!(S.partida && S.partida.casco === false);   // partida sem desgaste de casco (regra definida na criação)
const poderJog = () => (S.wpLv || 1) * (.6 + .4 * (S.hull == null ? 100 : S.hull) / 100) * (1 + .02 * (S.rank || 0));
const corNv = e => { const r = poderJog() / e.lv; return r >= 1.09 ? '#6dff9f' : r >= .8 ? '#ffd24a' : '#ff6b6b'; };   // verde: vence; amarelo: incerto/empate; vermelho: perde
const PAUSA = 4800;   // igual ao servidor: tempo da luta, com a nave parada
const iniOn = () => CLOUD() && !(S.partida && !S.partida.piratas);
function iniTela(e, t) {
  const w = iniAt(e, t), a = plan(w.a.id), b = plan(w.b.id); if (!a || !b || !a._s || !b._s) return null;
  const dw = Math.hypot(a.x - b.x, a.y - b.y), ds = Math.hypot(a._s.x - b._s.x, a._s.y - b._s.y), ref = plan(S.loc)?._s;
  let k = dw > 1 ? ds / dw : (ref ? ref.sc * 1.5 : 1.5); if (!(k > 0)) k = 1.5;
  return { x:a._s.x + (b._s.x - a._s.x) * w.f, y:a._s.y + (b._s.y - a._s.y) * w.f, sc:a._s.sc + (b._s.sc - a._s.sc) * w.f, k };
}
const INIM = {};   // sprites dos inimigos (SVG em assets/inimigos), rasterizados uma vez em 256px
const tierDe = lv => lv <= 2 ? 1 : lv === 3 ? 2 : lv <= 5 ? 3 : lv <= 7 ? 4 : 5;
const CAM = ['sombra', 'membros', 'corpo', 'detalhes', 'brilho'];
function inimSprite(m, tier) {
  const key = (m ? 'monstro_' : 'pirata_') + tier, o = INIM[key];
  if (o) return o.c || null;
  const e = INIM[key] = { c:null, L:null }, url = `assets/inimigos/${key}.svg`;
  const rast = u => new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(im, 0, 0, 256, 256); ok(c); }; im.onerror = () => ok(null); im.src = u; });
  if (!m) { rast(url).then(c => { e.c = c; }); return null; }
  // monstros: cada camada (sombra, membros, corpo, detalhes, brilho) vira um sprite próprio, para o corpo e os membros se mexerem separados
  fetch(url).then(r => r.text()).then(async txt => {
    const L = {};
    for (const nome of CAM) {
      const svg = txt.replace(/<g id="([a-z]+)"/g, (t, id) => id === nome || !CAM.includes(id) ? t : `<g display="none" id="${id}"`);
      L[nome] = await rast(URL.createObjectURL(new Blob([svg], { type:'image/svg+xml' })));
    }
    e.L = L; e.c = L.corpo || null;
  }).catch(() => { rast(url).then(c => { e.c = c; }); });
  return e.c;
}
/** Monstro em camadas: respira, balança os membros (asas batem, tentáculos ondulam) e pisca o brilho. */
function monstroAnim(L, sz, tm, t, k, g = cx) {
  const lay = (c, f) => { if (!c) return; g.save(); f && f(); g.drawImage(c, -sz / 2, -sz / 2, sz, sz); g.restore(); };
  const w = Math.sin(tm * 2.1 + k), w2 = Math.sin(tm * 1.3 + k * 2), resp = 1 + Math.sin(tm * 1.7) * .035;
  lay(L.sombra);
  lay(L.membros, () => { if (t === 4) g.scale(1 + w * .12, 1 - w * .04); else if (t === 5) g.rotate(Math.sin(tm * .6) * .12); else { g.rotate(w * .06); g.scale(1 + w2 * .04, 1 - w2 * .04); } });
  g.save(); g.translate(0, Math.sin(tm * 1.6 + k) * sz * .025); g.scale(resp, resp);
  lay(L.corpo); lay(L.detalhes);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = .55 + .45 * Math.sin(tm * 3 + k); lay(L.brilho); g.restore();
}
function desenhaInimigo(p, e, ts, alvo, forca) {   // p: posição na tela; alvo: ângulo para onde olha (só os piratas giram)
  const k = p.sc * (cam.z < .5 ? .7 : 1), tm = ts / 1000 + e.k * 1.7, tier = e.tier || (e.tier || tierDe(e.lv)), im = inimSprite(e.m, tier), sz = (e.m ? 26 + tier * 5 : 22 + tier * 3) * k * (tier >= 4 ? .85 : 1);
  cx.save(); cx.translate(p.x, p.y);
  cx.fillStyle = e.m ? 'rgba(178,75,255,.08)' : 'rgba(255,50,50,.09)'; cx.beginPath(); cx.arc(0, 0, sz * .5, 0, 7); cx.fill();   // halo de aviso, sem shadowBlur
  if (im) {
    const st = INIM[(e.m ? 'monstro_' : 'pirata_') + tier];
    if (e.m && st && st.L) { cx.translate(Math.sin(tm * .8 + e.k) * sz * .03, Math.sin(tm * 1.1) * sz * .04); cx.rotate(Math.sin(tm * .9) * .05); monstroAnim(st.L, sz, tm, tier, e.k); }   // flutua e se mexe por camadas
    else { cx.rotate(e.m ? 0 : alvo + Math.PI / 2); cx.drawImage(im, -sz / 2, -sz / 2, sz, sz); }
  }
  cx.restore();
  if (forca) { cx.save(); cx.font = '700 7px Chakra Petch, sans-serif'; cx.textAlign = 'center'; const tx = (e.m ? '☣ ' : '☠ ') + e.lv.toFixed(1), ty = p.y - (e.m ? 17 + (e.tier || tierDe(e.lv)) * 2.5 : 14 + (e.tier || tierDe(e.lv)) * 1.5) * p.sc; cx.lineWidth = 2; cx.strokeStyle = 'rgba(0,0,0,.7)'; cx.strokeText(tx, p.x, ty); cx.fillStyle = corNv(e); cx.fillText(tx, p.x, ty); cx.restore(); }
}
function inimigos(ts, fase) {   // fase 0: patrulha (desenhada ANTES dos planetas, nomes ficam por cima); fase 1: lutas (acima dos planetas, abaixo da nave)
  if (!iniOn() || !PL.length) return;
  const now = NOW(), enc = S.trip?.enc || [], n = 2 + Math.min(S.gal, 2), sp = shipPos(ts), rs = !S.trip && sel && sel !== S.loc && plan(sel), rf = rs && plan(S.loc);
  for (let k = 0; k < n; k++) {
    const e = iniG(S.gal, k), f = enc.find(x => x.k === k), pos = iniTela(e, now); if (!pos) continue;
    if (f && S.trip) { if (now >= f.tc + PAUSA) continue; if (now >= f.td) { if (fase === 1) desenhaLuta(e, f, now, ts); continue; } }
    if (fase === 1) continue;
    // perto da nave (ou da rota escolhida)? só então mostra o anel de alcance e o nível
    const rr = e.R * pos.k; let perto = Math.hypot(pos.x - sp.x, pos.y - sp.y) < rr * 3.2;
    if (!perto && rf && rf._s && rs._s) { const ax = rf._s.x, ay = rf._s.y, bx = rs._s.x, by = rs._s.y, L = Math.hypot(bx - ax, by - ay) || 1, u = clamp(((pos.x - ax) * (bx - ax) + (pos.y - ay) * (by - ay)) / (L * L), 0, 1); perto = Math.hypot(pos.x - (ax + (bx - ax) * u), pos.y - (ay + (by - ay) * u)) < rr * 1.6; }
    if (perto) { cx.save(); cx.globalAlpha = .3 + .1 * Math.sin(ts / 500 + k); cx.strokeStyle = e.m ? '#b24bff' : '#ff4040'; cx.lineWidth = 1; cx.beginPath(); cx.arc(pos.x, pos.y, rr, 0, 7); cx.stroke(); cx.restore(); }
    const nx = iniTela(e, now + 400), ang = nx ? Math.atan2(nx.y - pos.y, nx.x - pos.x) : 0;
    cx.save(); cx.globalAlpha = .92; desenhaInimigo(pos, e, ts, ang, perto); cx.restore();
  }
}
let SHAKE = 0;
function desenhaLuta(e, f, now, ts) {
  const sp = shipPos(ts), lt = now - f.tc, th = e.k * 1.3 - .8, dist0 = 30 * sp.sc, so = { x:sp.x + Math.cos(th) * dist0, y:sp.y + Math.sin(th) * dist0 * .8 - 4 * sp.sc }; let p;
  if (lt < 0) { const a = iniTela(e, f.td), q = clamp((now - f.td) / (f.tc - f.td), 0, 1), s2 = q * q; p = { x:a.x + (so.x - a.x) * s2, y:a.y + (so.y - a.y) * s2, sc:a.sc }; }
  else { p = { x:so.x + Math.cos(ts / 700) * 2.5 * sp.sc, y:so.y + Math.sin(ts / 500) * 2 * sp.sc, sc:sp.sc }; if (f.w !== 1 && lt > 3000) { const q = clamp((lt - 3000) / 1800, 0, 1); p.x += Math.cos(th) * 70 * q * sp.sc; p.y += Math.sin(th) * 50 * q * sp.sc - 20 * q * sp.sc; } }
  const ang = Math.atan2(sp.y - p.y, sp.x - p.x), cor = e.m ? '200,100,255' : '255,80,60';
  const hp = lt < 0 ? 1 : f.w === 1 ? 1 - clamp(lt / 3000, 0, 1) : 1 - (f.w === 2 ? .5 : .25) * clamp(lt / 3000, 0, 1), vivo = !(f.w === 1 && lt > 3000);
  if (vivo) { cx.save(); cx.globalAlpha = f.w !== 1 && lt > 3000 ? clamp(1 - (lt - 3000) / 1800, 0, 1) : 1; desenhaInimigo(p, e, ts, ang, true); cx.restore(); }
  if (lt >= 0 && lt < 3000) {   // troca de tiros: um projétil a cada 240ms, alternando os lados
    const step = 240, j = Math.floor(lt / step); cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round';
    for (let jj = Math.max(0, j - 3); jj <= j; jj++) {
      const tt = (lt - jj * step) / 380; if (tt < 0 || tt > 1.4) continue; const meu = jj % 2 === 1, A = meu ? sp : p, B = meu ? p : sp, q = Math.min(tt, 1), q0 = Math.max(0, q - .3);
      if (tt <= 1) { cx.strokeStyle = meu ? 'rgba(90,240,255,.95)' : `rgba(${cor},.95)`; cx.lineWidth = 2 * sp.sc; cx.beginPath(); cx.moveTo(A.x + (B.x - A.x) * q0, A.y + (B.y - A.y) * q0); cx.lineTo(A.x + (B.x - A.x) * q, A.y + (B.y - A.y) * q); cx.stroke(); }
      else { const k = (tt - 1) / .4; cx.fillStyle = meu ? `rgba(120,255,255,${1 - k})` : `rgba(${cor},${1 - k})`; cx.beginPath(); cx.arc(B.x, B.y, (3 + 7 * k) * sp.sc, 0, 7); cx.fill(); if (!meu && tt < 1.15) SHAKE = Math.max(SHAKE, now + 150); }
    }
    cx.restore();
    // barra de vida do inimigo
    const w = 26 * p.sc, y0 = p.y - 26 * p.sc; cx.fillStyle = 'rgba(0,0,0,.65)'; cx.fillRect(p.x - w / 2 - 1, y0 - 1, w + 2, 5 * p.sc + 2); cx.fillStyle = hp > .5 ? '#ff6a4a' : '#ffb13a'; cx.fillRect(p.x - w / 2, y0, w * hp, 5 * p.sc);
  } else if (lt >= 3000 && f.w === 1) {   // vitória: explosão do inimigo
    const q = clamp((lt - 3000) / 900, 0, 1); cx.save(); cx.globalCompositeOperation = 'lighter';
    cx.fillStyle = `rgba(255,${200 - q * 120 | 0},60,${1 - q})`; cx.beginPath(); cx.arc(p.x, p.y, (5 + q * 26) * p.sc, 0, 7); cx.fill();
    cx.strokeStyle = `rgba(255,255,200,${1 - q})`; cx.lineWidth = 2; cx.beginPath(); cx.arc(p.x, p.y, (8 + q * 40) * p.sc, 0, 7); cx.stroke(); cx.restore();
  }
  if (lt >= 3000) {   // resultado flutuando sobre a nave
    const q = (lt - 3000) / 1800; cx.save(); cx.globalAlpha = clamp(1.6 - q * 1.2, 0, 1); cx.font = '700 11px Chakra Petch, sans-serif'; cx.textAlign = 'center'; cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.75)';
    const tx = f.w === 1 ? `+${f.loot} Cr` : semCasco() ? (f.w === 2 ? 'empate' : 'carga perdida') : `casco -${f.dmg}%`, ty = sp.y - 26 * sp.sc - q * 18; cx.strokeText(tx, sp.x, ty); cx.fillStyle = f.w === 1 ? '#5dff9b' : f.w === 2 ? '#ffd24a' : '#ff6b6b'; cx.fillText(tx, sp.x, ty); cx.restore();
  }
}

/* ---------- avisos da luta: bordas do mapa + falas do Capitão ---------- */
let capT = 0, alertaAtual = '', FL = { k:0 }, shaking = false;
function cap(txt, tom, ms) {
  const el = $('#cap'); if (!el) return; $('#cap-t').textContent = txt; el.className = 'cap ' + (tom || ''); el.hidden = false;
  clearTimeout(capT); capT = setTimeout(() => { el.hidden = true; }, ms || 4800);
}
function setAlerta(c) { if (c === alertaAtual) return; alertaAtual = c; const el = $('#mapalert'); if (el) el.className = 'mapalert ' + c; }
function alertas(now) {
  const f = iniOn() && S.trip && S.trip.enc && S.trip.enc[0];
  if (!f) { setAlerta(''); if (shaking) { shaking = false; $('.mapwrap').style.transform = ''; } return; }
  if (FL.k !== S.trip.start) FL = { k:S.trip.start };
  const diz = (n, ate, fn) => { if (!FL[n] && now >= ate - 1) { FL[n] = 1; if (now - ate < 2500) fn(); } };
  const cl = f.m ? 'mon' : 'on';
  if (now >= f.td && now < f.tc) setAlerta(cl); else if (now >= f.tc && now < f.tc + 3000) setAlerta(cl + ' fast'); else if (now >= f.tc + 3000 && now < f.tc + PAUSA) setAlerta(f.w === 1 ? 'win' : 'lose'); else setAlerta('');
  diz(1, f.td, () => cap(`Comandante, ${f.nm} (poder ${f.lv.toFixed(1)}) na nossa cola! ${f.r >= 1.09 ? 'Podemos com eles.' : f.r >= .8 ? 'Vai ser equilibrado.' : 'Isso é perigoso!'}`, 'alert', 4500));
  diz(2, f.tc, () => cap(`Poder de fogo ${(+S.wpLv).toFixed(1)} contra ${f.lv.toFixed(1)}. ${f.r >= 1.09 ? 'Vantagem nossa!' : f.r >= .8 ? 'Luta apertada!' : 'Estamos em desvantagem!'}`, 'alert', 3000));
  diz(3, f.tc + 3000, () => cap(f.w === 1 ? `${f.nm} eliminados! Saque: +${f.loot} Cr.` : f.w === 2 ? `Empate! ${f.nm} recuaram.${semCasco() ? '' : ` Casco -${f.dmg}%.`}` : semCasco() ? 'Derrota! Parte da carga foi perdida.' : `Derrota! Casco -${f.dmg}% e carga perdida. Repare em Frotas.`, f.w === 1 ? 'win' : f.w === 2 ? 'alert' : 'lose', 5200));
  const w = $('.mapwrap');
  if (now < SHAKE) { shaking = true; w.style.transform = `translate(${(Math.random() - .5) * 4}px,${(Math.random() - .5) * 4}px)`; } else if (shaking) { shaking = false; w.style.transform = ''; }
}


/* ---------- Duelo X1: o rival no mapa ---------- */
const DUELO_ALC = 70;   // igual a DUELO.alcance no servidor
const emDuelo = () => MODE === 'partida' && PT && PT.modo === 'duelo' && PT.estado === 'andamento';
function locPos(loc, trip, now) {   // posição local (a mesma conta do servidor: suavização entre os planetas)
  if (trip && plan(trip.from) && plan(trip.to)) { const A = plan(trip.from), B = plan(trip.to), u = clamp((now - trip.start) / Math.max(1, trip.end - trip.start), 0, 1), q = u * u * (3 - 2 * u); return { x:A.x + (B.x - A.x) * q, y:A.y + (B.y - A.y) * q, ang:Math.atan2(B.y - A.y, B.x - A.x), fly:1 }; }
  const P = plan(loc); return P ? { x:P.x, y:P.y, ang:0, fly:0 } : null;
}
function duelInfo() {   // distância e situação do ataque, para o painel e o desenho
  if (!emDuelo() || !PT.rival || PT.rival.gal !== S.gal) return null;
  const R = PT.rival, now = NOW(), me = locPos(S.loc, S.trip, now), rv = locPos(R.loc, R.trip, now); if (!me || !rv) return null;
  const d = Math.hypot(me.x - rv.x, me.y - rv.y), pa = S.partida || {}, esfria = Math.max(0, (pa.atk || 0) + 40000 - now), prot = Math.max(0, (R.prot || 0) - now);
  let bloq = ''; if (S.trip) bloq = 'Pouse para atacar'; else if (R.trip && R.trip.seg) bloq = 'Rival em rota segura'; else if (prot) bloq = 'Rival protegido ' + Math.ceil(prot / 1000) + ' s'; else if (esfria) bloq = 'Canhões ' + Math.ceil(esfria / 1000) + ' s'; else if (d > DUELO_ALC) bloq = 'Fora do alcance'; else if (!R.carga) bloq = 'Rival sem carga';
  return { d, rv, me, R, bloq, alvo:!bloq };
}
let avisoT = 0;
function duelAvisos() {   // ataques recebidos: aparecem uma vez, com som de alerta
  const av = S.partida && S.partida.avisos; if (!av || MODE !== 'partida') return;
  const novos = av.filter(a => a.t > avisoT && a.t > NOW() - 40000); av.forEach(a => { if (a.t > avisoT) avisoT = a.t; });
  novos.forEach(a => say(a.m, a.k || 'err')); if (novos.length) SHAKE = Math.max(SHAKE, NOW() + 500);
}
function drawRival(ts) {
  const di = duelInfo(); if (!di) return;
  const { rv, me, R } = di, a = lscr(S.gal, rv), m = lscr(S.gal, me), kx = (.82 + .3 * me.y / 300) * cam.z, ky = .8 * cam.z;
  cx.save(); cx.strokeStyle = di.alvo ? 'rgba(255,77,109,.9)' : 'rgba(255,77,109,.28)'; cx.lineWidth = 1; cx.setLineDash([4, 4]); cx.lineDashOffset = -ts / 90;
  cx.beginPath(); cx.ellipse(m.x, m.y, DUELO_ALC * kx, DUELO_ALC * ky, 0, 0, 7); cx.stroke(); cx.restore();
  const t = ts / 600, ox = R.trip ? 0 : Math.cos(t) * 12 * a.sc, oy = R.trip ? 0 : Math.sin(t) * 5 * a.sc - 8 * a.sc, x = a.x + ox, y = a.y + oy;
  if (R.trip) { cx.fillStyle = 'rgba(255,77,109,.35)'; for (let i = 1; i < 6; i++) { cx.beginPath(); cx.arc(x - Math.cos(rv.ang) * i * 5 * a.sc, y - Math.sin(rv.ang) * i * 4 * a.sc, Math.max(.6, 2.4 * a.sc - i * .3), 0, 7); cx.fill(); } }
  miniShip(x, y, R.trip ? rv.ang : Math.atan2(Math.cos(t) * .4, -Math.sin(t)), Math.max(1.3, a.sc * 2.4), R.on === false ? '#8a8f99' : '#ff4d6d');
  if (di.alvo) { const k = (ts / 30) % 22; cx.strokeStyle = `rgba(255,77,109,${1 - k / 22})`; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(x, y, 6 + k, 0, 7); cx.stroke(); }
  cx.font = '600 9px Chakra Petch, sans-serif'; cx.textAlign = 'center'; cx.fillStyle = '#ff9db0'; cx.fillText('⚔ ' + R.n + (R.on === false ? ' (offline)' : ''), x, y - 14 * Math.max(1, a.sc));
  const w = 26, h = Math.max(0, Math.min(100, R.hull || 0)); cx.fillStyle = 'rgba(0,0,0,.6)'; cx.fillRect(x - w / 2, y - 11 * Math.max(1, a.sc), w, 3); cx.fillStyle = h > 50 ? '#39ff88' : h > 25 ? '#ffb347' : '#ff4d6d'; cx.fillRect(x - w / 2, y - 11 * Math.max(1, a.sc), w * h / 100, 3);
}
function drawShip(ts) {
  const s = shipPos(ts);
  if (s.fly) { trail.push({ x:s.x, y:s.y }); if (trail.length > 36) trail.shift(); } else trail.length = 0;
  cx.globalCompositeOperation = 'lighter';
  trail.forEach((t, i) => { cx.fillStyle = `rgba(255,170,60,${i / trail.length * .55})`; cx.beginPath(); cx.arc(t.x, t.y, (1 + i / 10) * s.sc, 0, 7); cx.fill(); });
  cx.globalCompositeOperation = 'source-over';
  cx.save(); cx.translate(s.x, s.y); cx.rotate(s.ang + Math.PI / 2); cx.scale(s.sc * .42, s.sc * .42); paintShip(cx, shipLv(), ts, 150 - (shipLv().id - 1) * .8); cx.restore();
}
function drawEmblem(i, ts, s, cur) {
  const G = GALAXIES[i], ok = galOk(i), R = Math.max(GAL_R * cam.z, 32), h = gHue(i), a = cur ? .55 : ok ? 1 : .5, sel1 = selG === i;
  cx.save(); cx.globalCompositeOperation = 'lighter'; cx.translate(s.x, s.y); cx.scale(1, .6);
  let g = cx.createRadialGradient(0, 0, 0, 0, 0, R * 1.2); g.addColorStop(0, `hsla(${h},90%,60%,${.36 * a})`); g.addColorStop(.5, `hsla(${h},80%,45%,${.14 * a})`); g.addColorStop(1, 'transparent');
  cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, R * 1.2, 0, 7); cx.fill();
  const rot = ts / 9000 * (i % 2 ? 1 : -1), sz = Math.max(1, 1.5 * Math.sqrt(cam.z));
  GSTAR.forEach(st => { const r = st.r * R, an = st.a + rot; cx.fillStyle = `hsla(${h},90%,${st.l}%,${(.25 + .55 * st.b) * a})`; cx.fillRect(Math.cos(an) * r, Math.sin(an) * r, sz * (.6 + st.b), sz * (.6 + st.b)); });
  cx.restore(); cx.globalCompositeOperation = 'source-over';
  if (cam.z >= .5 && !cur) G.planetas.forEach(p => {   // prévia fantasma dos planetas ainda não visitados
    const o = lscr(i, p); if (o.x < -30 || o.x > 430 || o.y < -30 || o.y > 330) return;
    const im = planetImg(p), r = p.r * o.sc * .8, w = 2 * r * (p.k || 2); cx.globalAlpha = ok ? .5 : .25;
    if (im) cx.drawImage(im, o.x - w / 2, o.y - w / 2, w, w); else { cx.fillStyle = p.c; cx.beginPath(); cx.arc(o.x, o.y, r, 0, 7); cx.fill(); } cx.globalAlpha = 1;
  });
  if (sel1) { cx.strokeStyle = 'rgba(62,230,255,.9)'; cx.lineWidth = 1.4; cx.setLineDash([5, 4]); cx.lineDashOffset = -ts / 70; cx.beginPath(); cx.ellipse(s.x, s.y, R * .95, R * .58, 0, 0, 7); cx.stroke(); cx.setLineDash([]); }
  if (!cur && !ok) { cx.globalAlpha = .9; cx.font = `${Math.round(clamp(R * .3, 12, 26))}px sans-serif`; cx.textAlign = 'center'; cx.fillText('🔒', s.x, s.y + 6); cx.globalAlpha = 1; }
  if (cur && cam.z >= .7) return;   // dentro da própria galáxia os rótulos são os dos planetas (o nome da galáxia está na legenda do mapa)
  const ty = s.y + R * .6 + 12, lock = S.rank < G.t ? RANKS[G.t][1] : S.engLv < G.eng ? 'motor nv.' + G.eng : '';
  cx.textAlign = 'center'; cx.font = '600 9px Chakra Petch, sans-serif'; const w = cx.measureText(G.nome).width + 12;
  cx.fillStyle = 'rgba(4,10,20,.72)'; cx.fillRect(s.x - w / 2, ty - 10, w, 13); cx.fillStyle = `hsl(${h},90%,${ok ? 78 : 62}%)`; cx.fillText(G.nome, s.x, ty);
  cx.font = '7px Chakra Petch, sans-serif'; cx.fillStyle = cur ? '#39ff88' : ok ? '#9fb3c8' : '#7a8aa0';
  cx.fillText(cur ? '● você está aqui' : lock ? '🔒 ' + lock : `${S.vis[i] ? '✓ ' : ''}⛽ ${fmt(jumpCost(i))}`, s.x, ty + 10);
}
function frame(ts) {
  requestAnimationFrame(frame);
  const w = cv.clientWidth; if (!w || document.hidden) return;
  const dpr = devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(w * .75 * dpr); }
  K = w / 400; cx.setTransform(dpr * K, 0, 0, dpr * K, 0, 0);
  if (camT) { const u = clamp((performance.now() - camT.t0) / camT.dur, 0, 1), e = u * u * (3 - 2 * u); cam.x = camT.fx + (camT.x - camT.fx) * e; cam.y = camT.fy + (camT.y - camT.fy) * e; cam.z = camT.fz * Math.pow(camT.z / camT.fz, e); if (u >= 1) camT = null; }
  cam.x = clamp(cam.x, -1700, 1700); cam.y = clamp(cam.y, -1200, 1200);
  PL.forEach(p => proj(p, ts));
  cx.clearRect(0, 0, 400, 300);
  let g = cx.createRadialGradient(200, 160, 10, 200, 160, 280); g.addColorStop(0, 'rgba(15,43,82,.45)'); g.addColorStop(1, 'rgba(3,7,16,.78)'); cx.fillStyle = g; cx.fillRect(0, 0, 400, 300);
  stars.forEach(s => { const f = .04 + .3 * s.z, x = ((s.x - cam.x * f) % 400 + 400) % 400, y = ((s.y - cam.y * f) % 300 + 300) % 300; cx.globalAlpha = .35 + .65 * Math.abs(Math.sin(ts / 900 + s.p)); cx.fillStyle = '#fff'; cx.fillRect(x, y, s.s, s.s); }); cx.globalAlpha = 1;
  const cs = gScr(S.gal);
  if (cam.z >= .35) { cx.lineWidth = .7; for (let i = 1; i <= 4; i++) { cx.strokeStyle = `rgba(62,160,230,${.26 - i * .04})`; cx.setLineDash(i % 2 ? [2, 6] : []); cx.lineDashOffset = ts / (50 * i) * (i % 2 ? 1 : -1); cx.beginPath(); cx.ellipse(cs.x, cs.y + 25 * cam.z, i * 58 * cam.z, i * 29 * cam.z, 0, 0, 7); cx.stroke(); } cx.setLineDash([]); }
  // rotas entre galáxias
  GLANES.forEach(([a, b]) => { const p1 = gScr(a), p2 = gScr(b), near = a === S.gal || b === S.gal; cx.strokeStyle = near ? 'rgba(140,190,255,.38)' : 'rgba(120,160,230,.16)'; cx.lineWidth = near ? 1.1 : .8; cx.setLineDash([3, 7]); cx.lineDashOffset = -ts / 90; cx.beginPath(); cx.moveTo(p1.x, p1.y); cx.lineTo(p2.x, p2.y); cx.stroke(); }); cx.setLineDash([]);
  GALAXIES.forEach((G, i) => { if (i === S.gal) return; const s = gScr(i), R = GAL_R * cam.z * 1.3; if (s.x < -R || s.x > 400 + R || s.y < -R || s.y > 300 + R) return; drawEmblem(i, ts, s, false); });
  drawEmblem(S.gal, ts, cs, true);
  if (selG != null && selG !== S.gal) { const b = gScr(selG); cx.globalCompositeOperation = 'lighter'; [[6, .14], [1.6, .9]].forEach(([lw, al]) => { cx.strokeStyle = `rgba(62,230,255,${al})`; cx.lineWidth = lw; cx.beginPath(); cx.moveTo(cs.x, cs.y); cx.lineTo(b.x, b.y); cx.stroke(); }); cx.globalCompositeOperation = 'source-over'; }
  // rotas neon do sistema atual
  const t = S.trip, here = plan(S.loc); cx.globalCompositeOperation = 'lighter';
  lanes.forEach(([a, b], i) => {
    const p1 = a._s, p2 = b._s;
    [[4, .14], [.9, .38]].forEach(([lw, al]) => { cx.strokeStyle = `rgba(255,138,61,${al})`; cx.lineWidth = lw; cx.beginPath(); cx.moveTo(p1.x, p1.y); cx.lineTo(p2.x, p2.y); cx.stroke(); });
    const u = (ts / 3200 + i * .37) % 1; cx.fillStyle = 'rgba(255,255,255,.6)'; cx.beginPath(); cx.arc(p1.x + (p2.x - p1.x) * u, p1.y + (p2.y - p1.y) * u, 1.4, 0, 7); cx.fill();
  });
  const rf = t ? plan(t.from) : here, rt = t ? plan(t.to) : (sel && sel !== S.loc ? plan(sel) : null);
  if (rt) { const a = rf._s, b = rt._s; [[6, .16], [1.6, .9]].forEach(([lw, al]) => { cx.strokeStyle = `rgba(62,230,255,${al})`; cx.lineWidth = lw; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); }); }
  cx.globalCompositeOperation = 'source-over';
  trafego(ts);
  inimigos(ts, 0);
  LBL.length = 0; PL.slice().sort((a, b) => a._s.y - b._s.y).forEach(p => drawPlanet(p, ts)); drawLabels();
  if (t) { const d = plan(t.to)._s, k = (ts / 25) % 30; cx.strokeStyle = `rgba(62,230,255,${1 - k / 30})`; cx.lineWidth = 1.2; cx.beginPath(); cx.ellipse(d.x, d.y + 14 * d.sc, k * d.sc, k * d.sc * .35, 0, 0, 7); cx.stroke(); }
  inimigos(ts, 1);
  alertas(NOW());
  drawShip(ts); drawRival(ts);
  if (cam.z < .5) { const sp = shipPos(ts), k = (ts / 40) % 24; cx.strokeStyle = `rgba(57,255,136,${1 - k / 24})`; cx.lineWidth = 1.4; cx.beginPath(); cx.arc(sp.x, sp.y, 4 + k, 0, 7); cx.stroke(); cx.fillStyle = '#39ff88'; cx.beginPath(); cx.arc(sp.x, sp.y, 2.2, 0, 7); cx.fill(); }
  const wk = (performance.now() - warpT) / 900; if (wk < 1) { g = cx.createRadialGradient(200, 150, 0, 200, 150, 300); g.addColorStop(0, '#fff'); g.addColorStop(1, '#3ee6ff'); cx.globalAlpha = 1 - wk; cx.fillStyle = g; cx.fillRect(0, 0, 400, 300); cx.globalAlpha = 1; }
  g = cx.createRadialGradient(200, 150, 120, 200, 150, 260); g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,.6)'); cx.fillStyle = g; cx.fillRect(0, 0, 400, 300);
  let near = -1, nd = GAL_R * 1.1; GALAXIES.forEach((G, i) => { const d = Math.hypot(G.wx - cam.x, G.wy - cam.y); if (d < nd) { nd = d; near = i; } });
  cx.fillStyle = 'rgba(20,70,95,.85)'; cx.beginPath(); cx.moveTo(3, 3); cx.lineTo(150, 3); cx.lineTo(138, 19); cx.lineTo(3, 19); cx.fill();
  cx.textAlign = 'left'; cx.fillStyle = '#7fe9ff'; cx.font = '600 9px Chakra Petch, sans-serif'; cx.fillText('CARTA ESTELAR', 9, 15);
  cx.fillStyle = '#8fa3b8'; cx.font = '7px Chakra Petch, sans-serif'; cx.fillText(near >= 0 ? GALAXIES[near].nome + (near === S.gal ? ' · você está aqui' : '') : 'Espaço profundo', 9, 30);
  if (!touched) { cx.textAlign = 'center'; cx.fillStyle = `rgba(200,225,245,${.55 + .35 * Math.sin(ts / 500)})`; cx.font = '8px Chakra Petch, sans-serif'; cx.fillText('Arraste para explorar · pinça ou rolagem para zoom', 200, 288); }
  cx.strokeStyle = '#3ee6ff'; cx.lineWidth = 1.5; [[3, 3, 1, 1], [397, 3, -1, 1], [3, 297, 1, -1], [397, 297, -1, -1]].forEach(([x, y, dx, dy]) => { cx.beginPath(); cx.moveTo(x, y + 14 * dy); cx.lineTo(x, y); cx.lineTo(x + 14 * dx, y); cx.stroke(); });
  placeSheet();
  if (t) $('#trip').textContent = `Em trânsito para ${plan(t.to).nome} · chegada em ${Math.max(0, Math.ceil((t.end - NOW()) / 1000))}s`;
}
function galInfo(i) {
  const g = GALAXIES[i], here = i === S.gal, mins = MINERALS.filter(m => m.t === g.t).map(m => m.nome);
  const fora = S.partida && !S.partida.galaxias.includes(i);
  const lock = fora ? 'ser uma das galáxias escolhidas para esta partida' : S.rank < g.t ? `a patente <b>${RANKS[g.t][1]}</b> (patrimônio ${fmt(RANKS[g.t][0])})` : S.engLv < g.eng ? `motor <b>nv.${g.eng}</b>` : '';
  return `<h3>🌌 ${g.nome}</h3><ul class="chips"><li>${g.planetas.length} planetas</li><li>${S.vis[i] ? 'Explorada' : 'Inexplorada'}</li>${mins.map(n => `<li class="up">${n}</li>`).join('')}</ul>`
    + (here ? '<small>Você está aqui. Toque num planeta para viajar.</small>'
      : lock ? `<small>🔒 Exige ${lock}.</small>`
      : `<button class="buy" data-jump="${i}" ${S.trip ? 'disabled' : ''}>Saltar<small>⛽ ${fmt(jumpCost(i))} Cr · ${pl(hops(i), 'salto')}</small></button>`);
}
function renderInfo() {
  $('#mapsheet').hidden = sel == null && selG == null; if (sel == null && selG == null) return;
  setTimeout(placeSheet, 0);
  if (selG != null) { $('#mapinfo').innerHTML = galInfo(selG); return; }
  const p = plan(sel), here = !S.trip && p.id === S.loc, m = p.m, t = trip(p.id);
  const chips = Object.keys(m).map(k => `<li class="${m[k] < 1 ? 'up' : 'down'}">${SHORT[k]} ${m[k] < 1 ? '▼' : '▲'} ${Math.abs(Math.round((m[k] - 1) * 100))}%</li>`).join('') || '<li>Hub: preços neutros</li>';
  $('#mapinfo').innerHTML = `<h3>${p.img ? `<img class="pimg" src="assets/planets/${p.img}" alt="">` : ''}${p.nome}</h3><ul class="chips">${chips}</ul>`
    + (situacao(p.id, NOW()) ? `<p class="evtl">${sitTag(p.id)} ${SITS[situacao(p.id, NOW())][1]}</p>` : '')
    + (S.ev && S.ev.p === p.id ? `<p class="evtl">⚡ ${S.ev.t}</p>` : '')
    + (p.t > S.rank ? `<small>🔒 Exige a patente <b>${RANKS[p.t][1]}</b>.</small>` : here ? '<small>Você está aqui. Toque em outro planeta ou galáxia.</small>'
            : `<div class="rotas"><button class="buy" data-go="${p.id}" ${S.trip || situacao(p.id, NOW()) === 'quarentena' ? 'disabled' : ''}><b>Rota direta</b><small>⛽ ${fmt(t.cost).replace(',00', '')} Cr · ${t.secs}s</small><em>Rápida, mas pode cruzar inimigos e sofrer imprevistos</em></button>`
              + (CLOUD() && (!S.partida || S.partida.duelo) && (S.tv === undefined || S.tv > 1) && situacao(p.id, NOW()) !== 'quarentena' ? `<button class="rt-seg" data-go="${p.id}" data-rota="segura" ${S.trip ? 'disabled' : ''}><b>Rota segura</b><small>⛽ ${fmt(Math.round(t.cost * 1.25)).replace(',00', '')} Cr · ${Math.round(t.secs * 1.6)}s</small><em>Mais longa: sem inimigos nem imprevistos, metade do desgaste</em></button>` : '') + '</div>');
}

/* ---------- Vício: som, missões, ranking, gráfico ---------- */
let AC;
function sfx(k) {   // mesmo sistema de áudio dos efeitos (volume igual para todos)
  if (!S.sound) return;
  try {
    const nome = { ok:'ok', err:'err', win:'win', alert:'alerta' }[k]; if (nome && window.SND) window.SND.toca(nome);
    if (nome) navigator.vibrate?.(k === 'err' ? [60, 40, 60] : k === 'win' ? [40, 30, 80] : 20);
  } catch {}
}
const MIS = [
  { k:'trades', t:'Faça negociações', n:() => 6, r:300 },
  { k:'trips',  t:'Viaje entre planetas', n:() => 2, r:400 },
  { k:'profit', t:'Lucre vendendo (Cr)', n:() => 300 * (1 + S.rank), r:600 },
];
function checkDay() {
  const d = new Date().toLocaleDateString('sv'); if (S.daily && S.daily.day === d) return;
  const y = new Date(Date.now() - 864e5).toLocaleDateString('sv');
  S.streak = S.lastDay === y ? S.streak + 1 : 1; S.lastDay = d;
  S.daily = { day:d, p:{ trades:0, trips:0, profit:0 }, done:{} };
  const b = 100 * Math.min(S.streak, 7); S.credits += b; save();
  setTimeout(() => say(`Bônus diário: ${fmt(b)} Cr (sequência de ${pl(S.streak, 'dia')}). Volte amanhã para mais!`, 'win'), 800);
}
/* Rivais simulados. Para ranking global real, envie {nome, patrimônio} a uma API (Cloudflare Worker + KV, Supabase) em renderMeta(). */
const RIVALS = [['Kira Vex',9000,380],['Dr. Orbit',14000,300],['Zenobia',6000,420],['Capitão Nulo',22000,220],['Lyra-7',11000,330],['Barão Rubro',40000,180]];
let RANK = null, rankAt = 0, lastPos = 0;
async function carregarRanking(force) {   // ranking global real (cloud): patrimônio guardado pelo servidor
  if (MODE === 'partida' || !TOK || !CLOUD() || document.hidden || ($('#p-notes').offsetParent === null && document.body.dataset.view !== 'home')) return;   // só busca com o painel à vista
  if (!force && Date.now() - rankAt < (document.body.dataset.view === 'home' ? 20000 : 60000)) return; rankAt = Date.now();
  try { RANK = await api('/ranking'); } catch { return; }
  if (RANK.eu) { if (lastPos && RANK.eu.pos < lastPos) say(`Você subiu para #${RANK.eu.pos} no ranking global!`, 'win'); lastPos = RANK.eu.pos; }
  renderBoard();
}
function renderBoard() {
  if (MODE === 'partida') { renderPlacar(); return; }
  if (!RANK) { $('#board').innerHTML = '<li class="empty">Carregando ranking…</li>'; return; }
  const me = RANK.eu, rows = RANK.top.map((r, i) => `<li class="${me && r.n === me.n ? 'me' : ''}"><span><i class="pos">${i + 1}</i> ${avImg(r.a)}${r.n}</span><b class="mono">${fmt(me && r.n === me.n ? patTotal() : r.w)}</b></li>`);
  if (me && me.pos > RANK.top.length && !RANK.top.some(r => r.n === me.n)) rows.push(`<li class="gap"><span>…</span></li>`, `<li class="me"><span><i class="pos">${me.pos}</i> ${avImg(me.a)}${me.n}</span><b class="mono">${fmt(me.w)}</b></li>`);
  $('#board').innerHTML = rows.join('') + `<li class="tot"><span>${RANK.total} piloto${RANK.total === 1 ? '' : 's'} na galáxia</span></li>`;
}
function board() {
  const h = (Date.now() - S.t0) / 36e5, rows = RIVALS.map(([n, s, r]) => ({ n, w:s + r * h }));
  rows.push({ n:'Você', w:patTotal(), me:1 }); return rows.sort((a, b) => b.w - a.w);
}
function renderMeta() {
  const d = S.daily;
  if (!CLOUD()) MIS.forEach(m => { if (!d.done[m.k] && d.p[m.k] >= m.n()) { d.done[m.k] = 1; S.credits += m.r; save(); $('#hud-credits').textContent = fmt(S.credits); say(`Missão cumprida: ${m.t}! +${fmt(m.r)} Cr`, 'win'); } });
  $('#mis').innerHTML = MIS.map(m => { const n = Math.round(m.n()), v = Math.min(Math.round(d.p[m.k]), n);
    return `<li class="${d.done[m.k] ? 'done' : ''}"><span>${m.t} <b class="mono">${v}/${n}</b></span><small>+${m.r} Cr</small><i style="width:${v / n * 100}%"></i></li>`; }).join('');
  $('#streak').textContent = `· Sequência de ${pl(S.streak, 'dia')}`;
  if (MODE === 'partida') { renderPlacar(); return; }
  if (CLOUD()) { carregarRanking(); return; }
  const rows = board(), pos = rows.findIndex(r => r.me) + 1;
  if (S.pos && pos < S.pos) say(`Você ultrapassou ${rows[pos].n}! Agora é #${pos}.`, 'win');
  S.pos = pos;
  $('#board').innerHTML = rows.map(r => `<li class="${r.me ? 'me' : ''}"><span>${r.n}</span><b class="mono">${fmt(r.w)}</b></li>`).join('');
}
function showChart(id) {
  const r = RES.find(x => x.id === id), h = S.hist[id], mn = Math.min(...h), mx = Math.max(...h);
  $('#chart-t').textContent = `${r.nome} · últimos ${h.length} ciclos`;
  const pts = h.map((v, i) => `${i / Math.max(h.length - 1, 1) * 300},${105 - (v - mn) / ((mx - mn) || 1) * 90}`).join(' ');
  $('#chart-svg').innerHTML = `<g class="${h[h.length - 1] >= h[0] ? 'up' : 'down'}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/></g><text x="2" y="10">máx ${fmt(mx)}</text><text x="2" y="119">mín ${fmt(mn)}</text>`;
  $('#chart').hidden = false;
}

/* ---------- Eventos ---------- */
$('#hangar').addEventListener('click', e => {
  const t = e.target.closest('[data-shop]'); if (t) return void abrirLoja(t.dataset.shop);
  const c = e.target.closest('[data-compra]'); if (c) return void act('comprarNave', { i:+c.dataset.compra });
  const q = e.target.closest('[data-equip]'); if (q) return void act('equipar', { i:+q.dataset.equip }).then(ok => { if (ok) pvShip = 0; });
  const p = e.target.closest('[data-prev]'); if (p) { const i = +p.dataset.prev; pvShip = pvShip === i ? 0 : i; pvPin = null; renderWorld(); }
});
$('#market').addEventListener('click', e => { const s = e.target.closest('.spark'); if (s) showChart(s.closest('[data-id]').dataset.id); });
$('#chart').onclick = e => { if (e.target.id === 'chart' || e.target.id === 'chart-x') $('#chart').hidden = true; };
document.body.classList.toggle('still', !S.fx);
$('#set-fx').checked = S.fx; $('#set-fx').onchange = e => { S.fx = e.target.checked; document.body.classList.toggle('still', !S.fx); save(); };
$('#set-sound').checked = S.sound; $('#set-sound').onchange = e => { S.sound = e.target.checked; save(); };
$('#mapinfo').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) goTo(b.dataset.go, b.dataset.rota); const j = e.target.closest('[data-jump]'); if (j) jump(...j.dataset.jump.split(',').map(Number)); });
$('#shipcard').onclick = () => document.querySelector('.nav [data-view=fleet]').click();
$('#fleet').addEventListener('pointerover', e => { const b = e.target.closest('[data-up]'), k = b && b.dataset.up; pvHover = PVN[k] ? k : null; });
$('#fleet').addEventListener('pointerleave', () => { pvHover = null; });
$('#fleet').addEventListener('click', e => { const b = e.target.closest('[data-up]'); if (b) upgrade(b.dataset.up); });
$('#market').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (b) trade(b.closest('[data-id]').dataset.id, b.dataset.act);
});
document.querySelectorAll('[data-qty]').forEach(b => b.onclick = () => $('#qty').value = b.dataset.qty);
document.querySelectorAll('.nav [data-view]').forEach(b => b.onclick = () => {
  document.body.dataset.view = b.dataset.view; store('astromercante_view', b.dataset.view); if (b.dataset.view === 'market') carregarRanking();
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('on', x === b));
});

/* ---------- Loop principal ---------- */
/* ---------- Cena de fundo da tela de login: planetas, parallax e uma nave viajando ---------- */
const REDUZ = matchMedia('(prefers-reduced-motion: reduce)').matches;
let introOn = false, introCv = null, introCx = null, introPl = null, introRun = null;
function introSetup() {
  const all = GALAXIES.flatMap(g => g.planetas), pick = [0, 3, 6, 9, 12, 15, 19, 23, 27, 31, 36, 41, 47, 52].map(i => all[i % all.length]);
  const R = (a, b, i) => a + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * (b - a);
  introPl = pick.map((p, i) => ({ p, x:R(.05, .95, i + 1), y:R(.12, .88, i + 7), d:.35 + R(0, .65, i + 3), ph:R(0, 6.28, i + 5) }));
  introPl.sort((a, b) => a.d - b.d);
  introRun = { a:0, b:1, t0:performance.now(), dur:7000, wait:0, trail:[] };
}
const introXY = (o, ts, W, H) => { const sp = .004 * o.d; let x = ((o.x - ts / 1000 * sp) % 1.15 + 1.15) % 1.15 - .075; return { x:x * W, y:o.y * H + Math.sin(ts / 2200 + o.ph) * 8 * o.d, r:(16 + 48 * o.d) * Math.min(W, H) / 800 }; };
/* ---- Eventos da tela de login: piratas, monstros, batalhas, chuva de asteroides e tempestade solar (só visual; nada aqui toca no jogo) ---- */
const INTRO_ORDEM = ['ast', 'sol', 'pirata', 'monstro'];   // ordem fixa: asteroides, tempestade solar, piratas e, por último, monstros
let introSeq = 0, introEv = null, introNext = 0, introLast = 0, introFx = [], introLastTipo = '';
const rng = (a, b) => a + Math.random() * (b - a), easeIO = u => u * u * (3 - 2 * u);
const INTRO_TXT = { pirata:['fa-skull-crossbones', 'Piratas na rota', 'Combate de naves'], monstro:['fa-dragon', 'Monstro do vazio', 'Criatura gigante à vista'], ast:['fa-meteor', 'Chuva de asteroides', 'Desvie ou aguente o casco'], sol:['fa-sun', 'Tempestade solar', 'Radiação alta no setor'] };
function introCaption(tipo) {
  const el = $('#lp-evt'); if (!el) return;
  if (!tipo) { el.classList.remove('on'); return; }
  const L = INTRO_TXT[tipo]; el.className = 'lp-evt on lp-' + tipo; el.innerHTML = `<i class="fa-solid ${L[0]}"></i><span><b>${L[1]}</b><small>${L[2]}</small></span>`;
}
function introNovoEvento(ts, W, H, voando, forca) {
  const tipo = forca || INTRO_ORDEM[introSeq % INTRO_ORDEM.length]; if (!forca) introSeq++; introLastTipo = tipo;
  introFx.length = 0;
  const base = { tipo, t0: ts, ang: rng(0, 6.28), tier: 1 + Math.floor(Math.random() * 4), foge: Math.random() < .25, shots: [], rocks: [], seed: Math.random() * 99 };
  introEv = tipo === 'pirata' ? { ...base, dur: 7000, lutaIni: 1900, lutaFim: 5200 } : tipo === 'monstro' ? { ...base, tier: 1 + Math.floor(Math.random() * 5), dur: 8200, lutaIni: 2200, lutaFim: 6200 } : tipo === 'ast' ? { ...base, dur: 7000 } : { ...base, dur: 6500 };
  introCaption(tipo);
}
function introFaisca(x, y, n, cor, v = 90) { for (let i = 0; i < n && introFx.length < 160; i++) { const a = rng(0, 6.28), s = rng(.3, 1) * v; introFx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng(.35, .8), t: 0, cor, r: rng(1, 2.6) }); } }
function introRocha(W, H, big) {
  const a = rng(2.55, 2.85), s = rng(380, 820) * (big ? .7 : 1), r = big ? rng(9, 17) : rng(3, 8), n = 7, forma = [];
  for (let i = 0; i < n; i++) forma.push(.72 + Math.random() * .4);
  return { x: rng(W * .15, W * 1.25), y: -30, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, rot: rng(0, 6.28), vr: rng(-3, 3), forma };
}
function introEvento(c, f, ts, dt, W, H, sx, sy, ang, run) {   // c: canvas de fundo (asteroides, tempestade); f: canvas por cima da tela (inimigos, tiros, faíscas)
  const ev = introEv; if (!ev) return { shake: 0 };
  const e = ts - ev.t0; let shake = 0;
  if (e > ev.dur) { introEv = null; introCaption(null); introNext = ts + rng(3200, 5200); return { shake: 0 }; }
  const dts = dt / 1000, env = Math.sin(Math.PI * clamp(e / ev.dur, 0, 1));
  if (ev.tipo === 'pirata' || ev.tipo === 'monstro') {
    const m = ev.tipo === 'monstro', D = Math.min(W, H) * (m ? .3 : .19) + (m ? 130 : 90);
    if (!ev.posto) {   // o inimigo escolhe o lado com tela livre: dentro da janela e longe do cartão de login
      ev.posto = 1; const cr = $('.lp-card')?.getBoundingClientRect(); let melhor = -1;
      for (let i = 0; i < 16; i++) {
        const an = i / 16 * 6.283 + rng(0, .3), x = sx + Math.cos(an) * D, y = sy + Math.sin(an) * D;
        const dentro = x > 70 && x < W - 70 && y > 100 && y < H - 60, dc = cr ? Math.hypot(Math.max(cr.left - x, 0, x - cr.right), Math.max(cr.top - y, 0, y - cr.bottom)) : 300, sc = (dentro ? 1000 : 0) + Math.min(dc, 260);
        if (sc > melhor) { melhor = sc; ev.ang = an; }
      }
    }
    const luta = e >= ev.lutaIni && e < ev.lutaFim;
    if (luta) run.t0 += dt;   // a nave para durante a luta
    const chega = easeIO(clamp(e / ev.lutaIni, 0, 1)), sai = ev.foge ? easeIO(clamp((e - ev.lutaFim) / 1100, 0, 1)) : 0, morre = !ev.foge && e >= ev.lutaFim ? clamp((e - ev.lutaFim) / 700, 0, 1) : 0;
    const dist = D + (1 - chega) * Math.max(W, H) * .65 + sai * Math.max(W, H) * .8, wob = Math.sin(ts / 420 + ev.seed) * 7, rx = sx + Math.cos(ev.ang) * D, ry = sy + Math.sin(ev.ang) * D, w = chega * (1 - sai);
    const ex = sx + Math.cos(ev.ang) * dist + Math.cos(ev.ang + 1.57) * wob + (clamp(rx, 60, W - 60) - rx) * w, ey = sy + Math.sin(ev.ang) * dist + Math.sin(ev.ang + 1.57) * wob + (clamp(ry, 90, H - 60) - ry) * w;
    const alvoAng = Math.atan2(sy - ey, sx - ex), sz = (m ? 74 + ev.tier * 15 : 62 + ev.tier * 10) * Math.min(1.25, Math.min(W, H) / 560 + .55);
    // disparos: nave (ciano) e inimigo (vermelho ou roxo), um a cada ~230 ms, em lados alternados
    if (luta) {
      ev.prox = ev.prox ?? ts; while (ts >= ev.prox) { const meu = ev.shots.length % 2 === 0; ev.shots.push({ t: ts, meu }); ev.prox += 230; }
    }
    ev.shots = ev.shots.filter(s => ts - s.t < 340);
    f.save(); f.globalCompositeOperation = 'lighter';
    for (const s of ev.shots) {
      const u = (ts - s.t) / 320, ax = s.meu ? sx : ex, ay = s.meu ? sy : ey, bx = s.meu ? ex : sx, by = s.meu ? ey : sy, px = ax + (bx - ax) * u, py = ay + (by - ay) * u, qx = ax + (bx - ax) * Math.max(0, u - .16), qy = ay + (by - ay) * Math.max(0, u - .16);
      const g = f.createLinearGradient(qx, qy, px, py), cor = s.meu ? '110,240,255' : m ? '200,110,255' : '255,90,80'; g.addColorStop(0, `rgba(${cor},0)`); g.addColorStop(1, `rgba(${cor},.95)`);
      f.strokeStyle = g; f.lineWidth = 3; f.lineCap = 'round'; f.beginPath(); f.moveTo(qx, qy); f.lineTo(px, py); f.stroke();
      if (u > .9 && !s.hit) { s.hit = 1; introFaisca(bx, by, 9, s.meu ? (m ? '#d9a0ff' : '#ffb070') : '#8ff3ff', 110); if (!s.meu) shake = 1; }
    }
    f.restore();
    if (luta) {   // escudo da nave pisca quando leva tiro
      const hit = ev.shots.find(s => !s.meu && ts - s.t > 250 && ts - s.t < 340); if (hit) { f.save(); f.strokeStyle = 'rgba(110,240,255,.55)'; f.lineWidth = 2; f.beginPath(); f.arc(sx, sy, 34, 0, 7); f.stroke(); f.restore(); }
    }
    // sprite do inimigo
    const im = inimSprite(m, ev.tier), st = INIM[(m ? 'monstro_' : 'pirata_') + ev.tier], tm = ts / 1000;
    if (morre < 1) {
      if (!ev.boom && morre > 0) { ev.boom = 1; introFaisca(ex, ey, 46, m ? '#c88bff' : '#ffb36b', 220); introFaisca(ex, ey, 18, '#ffffff', 120); }
      f.save(); f.translate(ex, ey); f.globalAlpha = (1 - morre) * Math.min(1, chega * 1.6 + .05); const fz = 1 - morre * .5; f.scale(fz, fz);
      { const gr = f.createRadialGradient(0, 0, sz * .08, 0, 0, sz * .7); gr.addColorStop(0, m ? 'rgba(190,110,255,.22)' : 'rgba(255,80,60,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); f.fillStyle = gr; f.beginPath(); f.arc(0, 0, sz * .7, 0, 7); f.fill(); }
      if (im) { if (m && st && st.L) { f.translate(0, Math.sin(tm * 1.1) * sz * .04); f.rotate(Math.sin(tm * .9) * .05); monstroAnim(st.L, sz, tm, ev.tier, ev.seed, f); } else { f.rotate(m ? 0 : alvoAng - Math.PI / 2); f.drawImage(im, -sz / 2, -sz / 2, sz, sz); } }
      else { f.fillStyle = m ? '#8a3bd1' : '#d24545'; f.beginPath(); f.arc(0, 0, sz * .3, 0, 7); f.fill(); }
      if (luta && ev.shots.length && ts - ev.shots[ev.shots.length - 1].t < 120 && ev.shots[ev.shots.length - 1].meu === false) { f.globalCompositeOperation = 'lighter'; f.fillStyle = m ? 'rgba(220,160,255,.5)' : 'rgba(255,120,90,.5)'; f.beginPath(); f.arc(0, 0, sz * .3, 0, 7); f.fill(); }
      f.restore();
      // nível de poder, igual ao do mapa
      f.save(); f.font = '700 11px Chakra Petch, sans-serif'; f.textAlign = 'center'; f.fillStyle = m ? '#d9a0ff' : '#ff8a8a'; f.globalAlpha = (1 - morre) * .9; f.fillText((m ? '☣ ' : '☠ ') + (ev.tier * 1.7 + 1).toFixed(1), ex, ey - sz * .62); f.restore();
    } else if (morre >= 1 && !ev.boom2) ev.boom2 = 1;
    if (ev.boom && morre < 1) { f.save(); f.strokeStyle = m ? `rgba(200,140,255,${.8 - morre})` : `rgba(255,190,110,${.8 - morre})`; f.lineWidth = 3; f.beginPath(); f.arc(ex, ey, 10 + morre * sz * 1.3, 0, 7); f.stroke(); f.restore(); }
  } else if (ev.tipo === 'ast') {
    ev.acum = (ev.acum || 0) + dts * 22 * env; while (ev.acum >= 1) { ev.acum--; ev.rocks.push(introRocha(W, H, Math.random() < .12)); }
    c.save();
    for (let i = ev.rocks.length - 1; i >= 0; i--) {
      const r = ev.rocks[i]; r.x += r.vx * dts; r.y += r.vy * dts; r.rot += r.vr * dts;
      if (r.y > H + 40 || r.x < -60) { ev.rocks.splice(i, 1); continue; }
      const L = Math.hypot(r.vx, r.vy), tx = r.x - r.vx / L * (r.r * 9), ty = r.y - r.vy / L * (r.r * 9), g = c.createLinearGradient(tx, ty, r.x, r.y);
      g.addColorStop(0, 'rgba(255,140,60,0)'); g.addColorStop(1, 'rgba(255,170,90,.7)'); c.globalCompositeOperation = 'lighter'; c.strokeStyle = g; c.lineWidth = r.r * .9; c.lineCap = 'round'; c.beginPath(); c.moveTo(tx, ty); c.lineTo(r.x, r.y); c.stroke();
      c.globalCompositeOperation = 'source-over'; c.save(); c.translate(r.x, r.y); c.rotate(r.rot); c.fillStyle = '#6c5a4c'; c.strokeStyle = '#b59478'; c.lineWidth = 1; c.beginPath();
      r.forma.forEach((k, j) => { const a = j / r.forma.length * 6.283; c[j ? 'lineTo' : 'moveTo'](Math.cos(a) * r.r * k, Math.sin(a) * r.r * k); }); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.arc(r.r * .25, -r.r * .15, r.r * .28, 0, 7); c.fill(); c.restore();
      if (Math.hypot(r.x - sx, r.y - sy) < 22 && !r.hit) { r.hit = 1; introFaisca(sx, sy, 12, '#ffb070', 120); shake = 1; }
    }
    c.restore();
  } else {   // tempestade solar: clarão no canto, filetes de plasma varrendo a tela e arcos elétricos em volta da nave
    const gx = ev.ang < 3.14 ? W * .05 : W * .95, gy = H * .02, R = Math.max(W, H) * (.75 + .25 * env);
    c.save(); const g = c.createRadialGradient(gx, gy, 0, gx, gy, R); g.addColorStop(0, `rgba(255,214,120,${.55 * env})`); g.addColorStop(.25, `rgba(255,140,50,${.28 * env})`); g.addColorStop(1, 'rgba(255,90,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter'; ev.acum = (ev.acum || 0) + dts * 26 * env;
    while (ev.acum >= 1) { ev.acum--; const a = Math.atan2(H * .6, (ev.ang < 3.14 ? 1 : -1) * W * .8) + rng(-.35, .35); ev.rocks.push({ x: gx, y: gy, a, s: rng(500, 1100), l: rng(40, 130) }); }
    for (let i = ev.rocks.length - 1; i >= 0; i--) { const p = ev.rocks[i]; p.x += Math.cos(p.a) * p.s * dts; p.y += Math.sin(p.a) * p.s * dts; if (p.x < -150 || p.x > W + 150 || p.y > H + 150) { ev.rocks.splice(i, 1); continue; }
      const gg = c.createLinearGradient(p.x - Math.cos(p.a) * p.l, p.y - Math.sin(p.a) * p.l, p.x, p.y); gg.addColorStop(0, 'rgba(255,150,60,0)'); gg.addColorStop(1, 'rgba(255,225,150,.75)'); c.strokeStyle = gg; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x - Math.cos(p.a) * p.l, p.y - Math.sin(p.a) * p.l); c.lineTo(p.x, p.y); c.stroke(); }
    if (env > .25) for (let k = 0; k < 2; k++) { c.strokeStyle = `rgba(150,235,255,${.35 + Math.random() * .4})`; c.lineWidth = 1.2; c.beginPath(); let px = sx + rng(-8, 8), py = sy + rng(-8, 8); c.moveTo(px, py); const a0 = rng(0, 6.28); for (let j = 0; j < 5; j++) { px += Math.cos(a0 + rng(-.9, .9)) * rng(5, 11); py += Math.sin(a0 + rng(-.9, .9)) * rng(5, 11); c.lineTo(px, py); } c.stroke(); }
    if (Math.random() < .035 * env) { c.fillStyle = 'rgba(255,240,200,.10)'; c.fillRect(0, 0, W, H); }
    c.restore(); shake = env > .35 ? .5 : 0;
  }
  // faíscas e explosões
  f.save(); f.globalCompositeOperation = 'lighter';
  for (let i = introFx.length - 1; i >= 0; i--) { const p = introFx[i]; p.t += dts; if (p.t > p.life) { introFx.splice(i, 1); continue; } p.x += p.vx * dts; p.y += p.vy * dts; p.vx *= .96; p.vy *= .96; f.globalAlpha = 1 - p.t / p.life; f.fillStyle = p.cor; f.beginPath(); f.arc(p.x, p.y, p.r, 0, 7); f.fill(); }
  f.restore();
  return { shake };
}
function introFrame(ts) {
  if (!introOn) return; requestAnimationFrame(introFrame);
  const W = introCv.clientWidth, H = introCv.clientHeight; if (!W) return; const dpr = Math.min(devicePixelRatio || 1, 2), dt = Math.min(64, introLast ? ts - introLast : 16); introLast = ts;
  if (introCv.width !== Math.round(W * dpr)) { introCv.width = Math.round(W * dpr); introCv.height = Math.round(H * dpr); }
  const c = introCx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const pos = introPl.map(o => introXY(o, ts, W, H));
  const ru = introRun; let a = pos[ru.a], b = pos[ru.b], u = Math.min(1, (ts - ru.t0) / ru.dur);
  if (ru.wait) { if (ts > ru.wait) { ru.wait = 0; ru.a = ru.b; do { ru.b = Math.floor(Math.random() * introPl.length); } while (ru.b === ru.a || Math.abs(pos[ru.b].x - pos[ru.a].x) < W * .15); ru.t0 = ts; ru.dur = 6500 + Math.random() * 3000; ru.trail.length = 0; } u = 1; }
  else if (u >= 1) ru.wait = ts + 1800;
  a = pos[ru.a]; b = pos[ru.b]; const e = u * u * (3 - 2 * u), nx = b.y - a.y, ny = a.x - b.x, L = Math.hypot(nx, ny) || 1, bow = Math.sin(Math.PI * e) * Math.min(90, L * .25) * (ru.a % 2 ? 1 : -1);
  const sx = a.x + (b.x - a.x) * e + nx / L * bow, sy = a.y + (b.y - a.y) * e + ny / L * bow;
  const e2 = Math.min(1, e + .01), bow2 = Math.sin(Math.PI * e2) * Math.min(90, L * .25) * (ru.a % 2 ? 1 : -1);
  const ang = Math.atan2((a.y + (b.y - a.y) * e2 + ny / L * bow2) - sy, (a.x + (b.x - a.x) * e2 + nx / L * bow2) - sx);
  introPl.forEach((o, i) => {
    const q = pos[i], im = planetImg(o.p); c.globalAlpha = .45 + .55 * o.d;
    if (im) { const w = 2 * q.r * (o.p.k || 2); c.drawImage(im, q.x - w / 2, q.y - w / 2, w, w); }
    else { c.fillStyle = o.p.c || '#456'; c.beginPath(); c.arc(q.x, q.y, q.r, 0, 7); c.fill(); }
    c.globalAlpha = 1;
  });
  if (!ru.wait && u < 1) { ru.trail.push({ x: sx, y: sy }); if (ru.trail.length > 46) ru.trail.shift(); } else if (ru.trail.length) ru.trail.shift();
  c.globalCompositeOperation = 'lighter';
  ru.trail.forEach((t, i) => { const k = i / ru.trail.length; c.fillStyle = `rgba(${k > .6 ? '255,190,90' : '255,120,60'},${k * .55})`; c.beginPath(); c.arc(t.x, t.y, 1.5 + k * 4, 0, 7); c.fill(); });
  c.globalCompositeOperation = 'source-over';
  const fade = ru.wait ? 0 : Math.min(1, Math.min(u, 1 - u) * 12 + .15);
  // sorteia o próximo evento (batalhas só com a nave em voo)
  if (!introEv && !REDUZ && ts > introNext && (introNext || (introNext = ts + 2500, false))) { const voando = !ru.wait && u > .12 && u < .55, luta = INTRO_ORDEM[introSeq % INTRO_ORDEM.length] === 'pirata' || INTRO_ORDEM[introSeq % INTRO_ORDEM.length] === 'monstro'; if (voando || !luta) introNovoEvento(ts, W, H, voando); else introNext = ts + 700; }
  const fx = introEvento(c, c, ts, dt, W, H, sx, sy, ang, ru), sk = fx.shake ? (Math.random() - .5) * 3 * fx.shake : 0;
  c.save(); c.globalAlpha = Math.max(0, fade); c.translate(sx + sk, sy + sk); c.rotate(ang + Math.PI / 2); c.scale(2.4, 2.4);
  paintShip(c, shipLv(), ts, 46 - (shipLv().id - 1) * .2); c.restore();
}
function introToggle(on) {
  if (on === introOn) return; introOn = on;
  if (!on) { introCaption(null); introEv = null; return; }
  introCv = introCv || $('#intro'); introCx = introCx || introCv.getContext('2d'); if (!introPl) introSetup();
  for (const t of [1, 2, 3, 4]) { inimSprite(false, t); inimSprite(true, t); }   // aquece os sprites dos inimigos
  introLast = 0; introNext = 0; introSeq = 0; requestAnimationFrame(introFrame);
}

/* ---------- Conta e nuvem ---------- */
const API = () => (CONFIG.PRECOS_URL || '').replace(/\/$/, '');
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
async function api(path, method = 'GET', body) {
  if (!API()) throw new Error('Servidor não configurado.');
  let r; try { r = await fetch(API() + path, { method, cache:'no-store', headers:{ 'Content-Type':'application/json', ...(TOK ? { Authorization:'Bearer ' + TOK } : {}) }, body: body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(10000), keepalive:method === 'PUT' }); }
  catch { throw new Error('Sem conexão com o servidor.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.erro || 'Erro ' + r.status); e.status = r.status; e.save = d.save; e.dados = d; throw e; }
  return d;
}
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const setCts = t => { CTS = t; store('astromercante_cts', t); };
const setSession = (token, nome) => { TOK = token; USER = nome; store('astromercante_tok', token); store('astromercante_user', nome); };
const clearSession = () => { TOK = USER = ''; CTS = 0; ['astromercante_view', 'astromercante_tok', 'astromercante_user', 'astromercante_cts', 'astromercante_google'].forEach(k => store(k, null)); };
// Só sobe para a nuvem o que mudou de verdade (compra, viagem, upgrade...) e sem os dados recalculáveis pelo relógio.
/* ---------- Conta e servidor ---------- */
const SERVER_KEYS = ['credits', 'stock', 'loc', 'gal', 'cap', 'capLv', 'engLv', 'wpLv', 'hull', 'maxHull', 'rank', 'trip', 'vis', 'daily', 'streak', 'lastDay', 'partida', 'nave', 'frota', 'tv', 'ct', 'cf'];
let firstState = true;
function aplicarEstado(r) {   // o servidor manda; este aparelho só mostra
  if (r.agora) SKEW = r.agora - Date.now();
  if (r.feed) {
    const c = {}, a = {}; FEED_KEYS.forEach(k => { if (Number.isFinite(r.feed.change?.[k])) c[k] = r.feed.change[k]; if (Number.isFinite(r.feed.ant?.[k])) a[k] = r.feed.ant[k]; });
    change = c; ant = a; feedAt = r.feed.feedAt || 0; live = Object.keys(c).length > 0; if (Array.isArray(r.feed.news)) NEWS = r.feed.news; setFeed();
  }
  if (r.v) V = r.v;
  if ('of' in r) OF = r.of || [];
  const e = r.estado_jogo || (r.estado && typeof r.estado === 'object' ? r.estado : null);
  if (e) {
    const gal0 = S.gal; SERVER_KEYS.forEach(k => { S[k] = e[k]; });
    S.inv = {}; RES.forEach(x => { S.inv[x.id] = e.inv?.[x.id] ? { qty:e.inv[x.id].qty, avg:e.inv[x.id].avg } : { qty:0, avg:0 }; });
    if (firstState || S.gal !== gal0 || !PL.length) { setGalaxy(S.gal); const g = GALAXIES[S.gal]; if (firstState) { cam.x = g.wx; cam.y = g.wy; cam.z = 1; } else { warpT = performance.now(); flyTo(g.wx, g.wy, 1, 1400); } }
    if (!plan(S.loc)) S.loc = PL[0].id;
    sel = sel && plan(sel) ? sel : null; selG = selG != null && GALAXIES[selG] ? selG : null;
    clearTimeout(tripT); if (S.trip) tripT = setTimeout(refrescar, Math.max(0, S.trip.end - NOW()) + 500);   // a chegada é resolvida pelo servidor
    firstState = false; READY = true; document.body.classList.remove('loading');
    const now = NOW(); RES.forEach(x => { S.price[x.id] = priceNow(x, cyc(now)); S.prev[x.id] = priceNow(x, cyc(now) - STEP); }); S.ev = evNow(now);
  }
  (r.msgs || []).forEach(m => m.n ? note(m.m, m.k) : say(m.m, m.k));
  duelAvisos();
  syncMsg = 'Conectado às ' + hora(); renderAccount(); save(); render();
}
async function act(nome, args = {}) {   // toda ação do jogador passa pelo servidor, que valida e executa
  if (busy || !TOK) return false; busy = true; document.body.classList.add('busy');
  try { aplicarEstado(await api(MODE === 'partida' ? '/partida/acao' : '/jogo/acao', 'POST', { acao:nome, ...args })); return true; }
  catch (e) {
    if (e.status === 401) { clearSession(); applyGate(); renderAccount(); openAuth('in', 'Sua sessão expirou. Entre novamente.'); }
    else { (e.dados?.msgs || []).forEach(m => m.n ? note(m.m, m.k) : say(m.m, m.k)); say(e.message, 'err'); refrescar(true); }
    if (MODE === 'partida' && (e.status === 410 || e.status === 409)) setTimeout(() => partidaPoll(true), 300);
    return false;
  } finally { busy = false; document.body.classList.remove('busy'); }
}
async function refrescar(force) {   // busca o estado da conta (outro aparelho jogou? uma viagem terminou?)
  if (MODE === 'partida') return partidaPoll(force);
  if (!TOK || !CLOUD() || busy || pulling || (document.hidden && !force)) return; pulling = true;
  try { const r = await api('/jogo?v=' + (force ? 0 : V)); if (r.igual) { if (r.agora) SKEW = r.agora - Date.now(); } else aplicarEstado(r); }
  catch (e) { if (e.status === 401) { clearSession(); applyGate(); renderAccount(); openAuth('in', 'Sua sessão expirou. Entre novamente.'); } else syncMsg = 'Sem conexão com o servidor.'; }
  pulling = false; renderAccount();
}
/** Ao voltar para a aba, o navegador (principalmente no celular) pode ter descartado o conteúdo dos canvas pré-desenhados (planetas, naves, inimigos):
 *  eles ficavam em branco e o mapa mostrava só os nomes. Descarta os caches; eles se refazem sozinhos em instantes. */
function refazCaches() { for (const c of [IMGS, SPR, INIM]) for (const k in c) delete c[k]; }
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refazCaches(); refrescar(); } });
addEventListener('pageshow', e => { if (e.persisted) refazCaches(); });
addEventListener('focus', () => { if (!document.hidden) refazCaches(); });
let lastInput = Date.now();   // sem toque há 5 min e nave parada: pausa a consulta periódica (ao voltar a interagir, atualiza na hora)
['pointerdown', 'keydown', 'wheel'].forEach(ev => addEventListener(ev, () => { const idle = Date.now() - lastInput > 300000; lastInput = Date.now(); if (idle) refrescar(true); }, { passive:true }));
addEventListener('focus', () => refrescar());
setInterval(() => { if (Date.now() - lastInput < 300000 || S.trip) refrescar(); }, 60000);
setInterval(() => { if (TOK && CLOUD() && document.body.classList.contains("loading")) refrescar(true); }, 6000);   // servidor fora do ar na abertura: tenta de novo sozinho
setInterval(() => { if (MODE === 'partida') partidaPoll(); }, 20000);   // placar e relógio da partida
function renderAccount() {
  const on = !!TOK, has = !!API();
  $('#acct').hidden = !has; $('#acct').textContent = on ? '👤 ' + USER : 'Entrar';
  $('#acct-nome').textContent = on ? 'Conta: ' + USER : 'Sem conta';
  $('#acct-sync').textContent = !has ? 'Contas indisponíveis: configure o Worker em config.js.' : on ? syncMsg || 'Conectado.' : 'Progresso salvo só neste aparelho.';
  $('#acct-btn').hidden = on || !has; $('#acct-extra').hidden = !on;
}
const MODES = { in:{ t:'Entrar', f:['nome','senha'], ok:'Entrar' }, up:{ t:'Criar conta', f:['nome','email','senha','senha2','idade'], ok:'Criar conta' },
  code:{ t:'Confirme seu e-mail', f:['code'], ok:'Confirmar' }, forgot:{ t:'Recuperar senha', f:['email'], ok:'Enviar código' }, reset:{ t:'Nova senha', f:['code','senha','senha2'], ok:'Redefinir senha' } };
let authMode = 'in', pendEmail = '', tsToken = '', tsId = null, gsiReady = false;
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
function openAuth(mode, info = '') {
  authMode = mode; const m = MODES[mode], tabs = mode === 'in' || mode === 'up';
  $('#au-t').textContent = m.t; $('#au-ok').textContent = m.ok;
  document.querySelectorAll('#au-form [data-f]').forEach(i => { i.hidden = !m.f.includes(i.dataset.f); });
  $('#au-nome').placeholder = mode === 'in' ? 'Nome de usuário ou e-mail' : 'Nome de usuário (3 a 20 letras, números ou _)';
  $('#au-senha').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
  $('#au-tabs').hidden = !tabs; $('#tab-in').classList.toggle('on', mode === 'in'); $('#tab-up').classList.toggle('on', mode === 'up');
  $('#au-forgot').hidden = mode !== 'in'; $('#au-resend').hidden = !(mode === 'code' || mode === 'reset');
  $('#au-google').hidden = !(tabs && CONFIG.GOOGLE_CLIENT_ID); $('#au-ts').hidden = !(CONFIG.TURNSTILE_SITEKEY && (mode === 'up' || mode === 'forgot'));
  $('#au-err').textContent = ''; $('#au-info').textContent = info; $('#auth').hidden = false;
  startWidgets(mode); (document.querySelector('#au-form [data-f]:not([hidden])') || $('#au-ok')).focus();
}
const gated = () => !!API() && !TOK;
const applyGate = () => { document.body.classList.toggle('gated', gated()); introToggle(gated()); };
const closeAuth = () => { if (gated()) return; $('#auth').hidden = true; };
async function startWidgets(mode) {   // anti-robô e botão do Google só são carregados quando configurados
  if (CONFIG.TURNSTILE_SITEKEY && (mode === 'up' || mode === 'forgot')) {
    try {
      if (!window.turnstile) await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
      if (tsId === null) tsId = window.turnstile.render('#au-ts', { sitekey: CONFIG.TURNSTILE_SITEKEY, theme: 'dark', callback: t => { tsToken = t; } });
    } catch {}
  }
  if (CONFIG.GOOGLE_CLIENT_ID && !gsiReady && (mode === 'in' || mode === 'up')) {
    try {
      await loadScript('https://accounts.google.com/gsi/client');
      google.accounts.id.initialize({ client_id: CONFIG.GOOGLE_CLIENT_ID, callback: googleLogin });
      google.accounts.id.renderButton($('#au-google'), { theme:'filled_black', size:'large', text:'continue_with', locale:'pt-BR', width:280 }); gsiReady = true;
    } catch {}
  }
}
async function googleLogin(r) {
  try { const d = await api('/auth/google', 'POST', { credential:r.credential }); store('astromercante_google', '1'); await afterAuth(d, !!d.novo); }
  catch (x) { $('#au-err').textContent = x.message; }
}
async function submitAuth(e) {
  e.preventDefault();
  const f = k => ($('#au-' + k).value || '').trim(), err = m => { $('#au-err').textContent = m; }, mode = authMode;
  const nome = f('nome'), email = f('email').toLowerCase(), code = f('code'), senha = $('#au-senha').value, nova = mode === 'up' || mode === 'reset';
  if (mode === 'up' && !/^\w{3,20}$/.test(nome)) return err('Nome: 3 a 20 letras, números ou _.');
  if (mode === 'in' && !nome) return err('Digite seu nome de usuário ou e-mail.');
  if ((mode === 'up' || mode === 'forgot') && !/^\S+@\S+\.\S{2,}$/.test(email)) return err('Digite um e-mail válido.');
  if ((mode === 'code' || mode === 'reset') && !/^\d{6}$/.test(code)) return err('O código tem 6 dígitos.');
  if ((nova || mode === 'in') && senha.length < 8) return err('A senha precisa de pelo menos 8 caracteres.');
  if (nova && senha !== $('#au-senha2').value) return err('As senhas não conferem.');
  if (mode === 'up' && !$('#au-idade').checked) return err('O Astromercante é para maiores de 13 anos: marque a caixa para continuar.');
  if (CONFIG.TURNSTILE_SITEKEY && (mode === 'up' || mode === 'forgot') && !tsToken) return err('Confirme que você não é um robô.');
  err(''); $('#au-ok').disabled = true;
  try {
    if (mode === 'in') await afterAuth(await api('/auth/entrar', 'POST', { nome, senha }), false);
    else if (mode === 'up') { const d = await api('/auth/registrar', 'POST', { nome, email, senha, maior13: true }); pendEmail = d.email; openAuth('code', `Enviamos um código de 6 dígitos para ${email}. Veja também a caixa de spam.`); }
    else if (mode === 'code') await afterAuth(await api('/auth/confirmar', 'POST', { email:pendEmail, codigo:code }), true);
    else if (mode === 'forgot') { await api('/auth/esqueci', 'POST', { email, turnstile:tsToken }); pendEmail = email; openAuth('reset', 'Se existir uma conta com esse e-mail, enviamos um código. Ele vale 15 minutos.'); }
    else if (mode === 'reset') { await api('/auth/redefinir', 'POST', { email:pendEmail, codigo:code, senha }); openAuth('in', 'Senha alterada! Entre com a nova senha.'); }
  } catch (x) {
    if (x.status === 403 && x.dados && x.dados.pendente) { pendEmail = x.dados.email; openAuth('code', 'Sua conta ainda não foi confirmada. Digite o código que enviamos ou peça outro.'); }
    else err(x.message);
  } finally { $('#au-ok').disabled = false; if (window.turnstile && tsId !== null) { window.turnstile.reset(tsId); tsToken = ''; } }
}
async function resendCode() {
  if (authMode === 'reset') return openAuth('forgot', 'Digite o e-mail para receber outro código.');
  try { await api('/auth/reenviar', 'POST', { email:pendEmail }); $('#au-info').textContent = 'Código reenviado.'; $('#au-err').textContent = ''; } catch (x) { $('#au-err').textContent = x.message; }
}
async function afterAuth(d, up) {
  setSession(d.token, d.nome); closeAuth(); applyGate(); renderAccount();
  await refrescar(true);
  say(up ? `Conta ${d.nome} criada. Seu progresso fica guardado na nuvem.` : `Bem-vindo de volta, ${d.nome}!`, 'win');
}
let logoutT = 0;
function logout() {   // dois toques (sem confirm(), que alguns navegadores do celular bloqueiam); sai na hora, sem esperar o servidor
  const b = $('#acct-out');
  if (!logoutT) { b.textContent = 'Toque de novo para sair'; b.classList.add('danger'); logoutT = setTimeout(() => { logoutT = 0; b.textContent = 'Sair'; b.classList.remove('danger'); }, 4000); return; }
  clearTimeout(logoutT); logoutT = 0; b.disabled = true; b.textContent = 'Saindo…';
  const t = TOK; clearSession();
  try { if (t && API()) fetch(API() + '/auth/sair', { method:'POST', keepalive:true, headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + t }, body:'{}' }).catch(() => {}); } catch {}
  store(KEY, null); setTimeout(() => { location.href = location.pathname; }, 150);
}
async function deleteAccount() {
  const g = localStorage.getItem('astromercante_google'), p = prompt(g ? 'Para excluir a conta e todo o progresso salvo na nuvem, digite EXCLUIR. Isso não pode ser desfeito.' : 'Para excluir a conta e todo o progresso salvo na nuvem, digite sua senha. Isso não pode ser desfeito.'); if (!p) return;
  const senha = g ? (p === 'EXCLUIR' ? 'EXCLUIR' : '') : p;
  try { await api('/conta', 'DELETE', { senha }); clearSession(); store(KEY, null); alert('Conta excluída.'); location.reload(); } catch (e) { say(e.message, 'err'); }
}
$('#acct').onclick = () => TOK ? document.querySelector('.nav [data-view=settings]').click() : openAuth('in');
$('#acct-btn').onclick = () => openAuth('in'); $('#acct-out').onclick = logout; $('#acct-del').onclick = deleteAccount; $('#acct-now').onclick = () => refrescar(true);
$('#tab-in').onclick = () => openAuth('in'); $('#tab-up').onclick = () => openAuth('up'); $('#au-forgot').onclick = () => openAuth('forgot'); $('#au-resend').onclick = resendCode;
$('#au-form').onsubmit = submitAuth;
$('#auth').addEventListener('scroll', () => document.body.classList.toggle('lp-rolou', $('#auth').scrollTop > 140), { passive:true });
$('#lp-down').onclick = () => $('#lp-info').scrollIntoView({ behavior:'smooth', block:'start' });
$('#auth').onclick = e => { if (e.target.id === 'auth') closeAuth(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuth(); });
renderAccount();
if (TOK && CLOUD()) refrescar(true);
else if (API()) openAuth('in');
applyGate();

if (!CLOUD()) for (const l in S.stock) for (const k in S.stock[l]) if (typeof S.stock[l][k] === 'number') S.stock[l][k] = { v:S.stock[l][k], t:Date.now() };   // formato antigo (modo local)
setGalaxy(GALAXIES[S.gal] ? S.gal : 0); if (!plan(S.loc)) S.loc = PL[0].id;
if (!CLOUD()) checkDay();
{ refazPrecos(); S.ev = evAt(NOW()); }
buildMarket(); buildMap(); render(); setFeed(); requestAnimationFrame(shipFrame);
if (S.trip && !CLOUD()) setTimeout(arrive, Math.max(0, S.trip.end - Date.now()));
try { const m = sessionStorage.getItem('astromercante_msg'); if (m) { sessionStorage.removeItem('astromercante_msg'); setTimeout(() => say(m, 'alert'), 400); } } catch {}
if (S.fx && !S.fxChecked) setTimeout(() => {   // aparelho lento? desliga o fundo animado sozinho (uma única vez)
  let f = 0; const t0 = performance.now();
  const l = () => { f++; if (performance.now() - t0 < 2500) requestAnimationFrame(l); else { S.fxChecked = true;
    if (f / 2.5 < 22) { S.fx = false; document.body.classList.add('still'); $('#set-fx').checked = false; note('Fundo animado desligado para poupar bateria. Reative em Configurações.', 'alert'); } save(); } };
  l();
}, 3000);
note('Terminal iniciado. Conectando aos feeds da Terra…');
fetchFeed().then(() => { note(live ? 'Feed real conectado: preços seguem cripto, ouro e câmbio.' : 'Feeds offline: simulação matemática ativa.', live ? 'ok' : 'alert'); refazPrecos(); tick(); });
let nextAt = cyc(NOW()) + STEP;
setInterval(async () => {
  const now = NOW(), left = Math.max(0, Math.ceil((nextAt - now) / 1000));
  $('#hud-cycle').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (now >= nextAt) {
    nextAt = cyc(now) + STEP;
    if (Math.floor((Date.now() - 20000) / FEED_EVERY) !== feedSlot) await fetchFeed();   // todos buscam no mesmo instante (:20 de cada 5 min)
    tick();
  }
}, 1000);

{ const mq = matchMedia('(min-width:900px),(orientation:landscape) and (min-width:640px)'), ship = $('#shipcard');
  const place = () => { if (mq.matches) $('#p-map').append(ship); else $('#p-market').insertBefore(ship, $('#p-market .powered')); };
  place(); mq.addEventListener('change', place); }
