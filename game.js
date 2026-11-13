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
  { id:'plasma',      nome:'Plasma Sombrio',  base:300,  vol:.007, src:'eth',  corr:'Correl. Energia (ETH)',      icon:'fa-bolt',           t:1 },
  { id:'antimateria', nome:'Antimatéria',     base:900,  vol:.008, src:'btc',  corr:'Correl. Tech / Cripto (BTC)', icon:'fa-atom',           t:2 },
  { id:'cristal',     nome:'Cristal Temporal', base:2400, vol:.009, src:'gold', corr:'Correl. Ouro (PAXG)',        icon:'fa-hourglass-half', t:3 });
RES.push(...MINERALS);
const $ = (s, r = document) => r.querySelector(s);
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
RES.forEach(r => { S.price[r.id] ??= r.base; S.prev[r.id] ??= S.price[r.id]; S.inv[r.id] ??= { qty:0, avg:0 }; S.hist[r.id] ??= [S.price[r.id]]; });
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(CLOUD() ? Object.fromEntries(PREFS.map(k => [k, S[k]])) : S)); } catch {} };

/* ---------- Feed de dados ---------- */
const STEP = 30000, FEED_KEY = 'astromercante_feed', cyc = t => Math.floor(t / STEP) * STEP;   // preço muda em ciclos fixos do relógio (:00 e :30), iguais para todos
let change = {}, ant = {}, feedAt = 0, live = false, lastFeed = 0;
try { const c = JSON.parse(localStorage.getItem(FEED_KEY) || 'null'); if (c && c.change) { change = c.change; ant = c.ant || {}; feedAt = c.feedAt || 0; live = Object.keys(change).length > 0; } } catch {}   // último feed conhecido: o preço não "pula" ao recarregar
const get = async url => { const r = await fetch(url, { cache:'no-store', signal: AbortSignal.timeout(8000) }); if (!r.ok) throw 0; return r.json(); };

async function fetchFeed() {
  lastFeed = Date.now(); feedSlot = Math.floor((Date.now() - 20000) / FEED_EVERY);
  if (CONFIG.PRECOS_URL) {          // caminho principal: Worker com cache (veja worker/README.md)
    try {
      const d = await get(CONFIG.PRECOS_URL.replace(/\/$/, '') + '/precos'), c = {}, a = {};
      ['btc', 'gold', 'eth', 'fx'].forEach(k => { if (Number.isFinite(d[k])) c[k] = d[k]; if (Number.isFinite(d.ant?.[k])) a[k] = d.ant[k]; });
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
function priceNow(r, t) {
  const s = t / 1000, n = vnoise(r.id + 'a', s / 900) * .55 + vnoise(r.id + 'b', s / 240) * .3 + vnoise(r.id + 'c', s / 60) * .15;
  const ch = feedCh(r.src, t), tg = Number.isFinite(ch) ? clamp(ch * 3, -30, 30) / 100 : 0;
  return Math.max(1, r.base * (1 + tg) * (1 + n * Math.min(.35, r.vol * 18)));
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
function tick() {
  const now = NOW(), ev = evNow(now);
  if (ev && !(S.ev && S.ev.k === ev.k)) { note('⚡ ' + ev.t + '!', 'alert'); sfx('alert'); }
  S.ev = ev;
  RES.forEach(r => {
    const p = S.price[r.id]; S.prev[r.id] = p; S.price[r.id] = priceNow(r, cyc(now));
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
  const r = RES.find(x => x.id === id), n = qty(), s0 = stk(id), p = pxAt(id, side === 'buy' ? s0 - n / 2 : s0 + n / 2) * (side === 'buy' ? 1 : .95), h = S.inv[id], total = n * p;
  if (S.trip) return say('Nave em trânsito.', 'err');
  if (side === 'buy') {
    if (n > s0 - 1) return say(`Este planeta só tem ${Math.floor(s0 - 1)} un. em oferta. Procure outro mercado.`, 'err');
    if (total > S.credits) return say(`Créditos insuficientes: faltam ${fmt(total - S.credits)}.`, 'err');
    if (used() + n > S.cap) return say(`Porão cheio (${used()}/${S.cap}). Venda ou faça upgrade.`, 'err');
    h.avg = (h.avg * h.qty + total) / (h.qty + n); h.qty += n; S.credits -= total; setStk(id, s0 - n);
    say(`Comprou ${n} × ${r.nome} por ${fmt(total)}.`, 'ok');
  } else {
    if (n > h.qty) return say(`Você tem apenas ${h.qty} × ${r.nome}.`, 'err');
    S.daily.p.profit += Math.max(0, n * (p - h.avg)); h.qty -= n; S.credits += total; setStk(id, s0 + n); if (!h.qty) h.avg = 0;
    say(`Vendeu ${n} × ${r.nome} por ${fmt(total)}.`, 'ok');
  }
  S.daily.p.trades++; save(); render();
}

/* ---------- Interface ---------- */
const cargo = () => RES.reduce((s, r) => s + S.inv[r.id].qty * px(r.id), 0);

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
        <div class="res__name">${r.nome}</div>
        <div class="res__price mono" data-f="price"></div>
        <div class="res__meta"><span class="mono" data-f="chg"></span> | ${r.corr} | Oferta: <span data-f="sup"></span></div>
        <div class="res__pos" data-f="pos" hidden></div>
      </div>
      <div class="res__side"><svg class="spark" viewBox="0 0 60 20"><polyline fill="none" stroke-width="1.5"/></svg><i class="${r.icon}"></i>
        <div class="trade"><button class="buy" data-act="buy">Comprar</button><button class="sell" data-act="sell">Vender</button></div>
      </div>
    </article>`).join('');
}

function render() {
  $('#hud-credits').textContent = fmt(S.credits);
  $('#hud-networth').textContent = fmt(S.credits + cargo());
  RES.forEach(r => {
    const el = $(`[data-id="${r.id}"]`), g = S.price[r.id], p = px(r.id), pct = (g / S.prev[r.id] - 1) * 100;
    el.hidden = r.t > S.rank; const su = $('[data-f=sup]', el); su.textContent = Math.round(stk(r.id)) + '%'; su.className = stk(r.id) < 50 ? 'down' : '';
    $('[data-f=price]', el).textContent = fmt(p) + ' Cr';
    const c = $('[data-f=chg]', el);
    c.textContent = `${pct >= 0 ? '▲ +' : '▼ '}${fmt(pct)}%`; c.className = 'mono ' + (pct >= 0 ? 'up' : 'down');
    const hh = S.inv[r.id], ps = $('[data-f=pos]', el); ps.hidden = !hh.qty;
    if (hh.qty) { const pnl = hh.qty * (p - hh.avg); ps.innerHTML = `Você tem <b>${hh.qty}</b> · pago em média ${fmt(hh.avg)} · <span class="mono ${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}${fmt(pnl)} Cr</span>`; }
    el.querySelectorAll('.trade button').forEach(b => b.disabled = !!S.trip);
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
const trip = to => { const d = dist(plan(S.loc), plan(to)); return { d, cost:Math.round(d * .8 * (1 + .3 * (S.engLv - 1) + .25 * (S.capLv - 1)) * (1 + (100 - S.hull) / 150)), secs:Math.max(3, Math.round(d / (18 + S.engLv * 7) * (S.hull < 40 ? 1.3 : 1))) }; };
const recov = (o, now = NOW()) => 100 - (100 - o.v) * Math.pow(.94, (now - o.t) / 30000);   // a oferta volta a 100% com o tempo: função do relógio, igual em qualquer aparelho
const stk = id => { const o = S.stock[S.loc]?.[id]; return o ? recov(o) : 100; };
const setStk = (id, v) => { (S.stock[S.loc] ??= {})[id] = { v:Math.max(1, v), t:Date.now() }; };
function pxAt(id, st) { return S.price[id] * (plan(S.loc).m[id] || 1) * (1 + .12 * GI()) * clamp((100 / Math.max(st, 5)) ** .4, .6, 2.5) * (S.ev && S.ev.r === id && (!S.ev.p || S.ev.p === S.loc) ? S.ev.m : 1); }
function px(id) { return pxAt(id, stk(id)); }

function goTo(to) {
  if (S.trip) return say('Nave em trânsito.', 'err');
  if (to === S.loc) return;
  if (CLOUD()) return act('viajar', { to }).then(ok => { if (ok) { sel = selG = null; const g = GALAXIES[S.gal]; flyTo(g.wx, g.wy, 1, 700); renderInfo(); } });
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
const overCost = () => Math.round(2500 * (S.capLv + S.engLv - 1));
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
  const n = NAVES[S.nave - 1], f = S.frota[S.nave], val = { cap:L => capDe(n, L), eng:L => engDe(n, L).toFixed(1), wp:L => wpDe(n, L).toFixed(1) }, dica = { cap:'capacidade', eng:'classe do motor (viagens mais rápidas)', wp:'poder de fogo contra piratas' };
  const outra = pvShip && pvShip !== S.nave;   // olhando a prévia de outra nave: os upgrades abaixo continuam sendo da nave equipada
  return `<div class="${outra ? 'dim' : ''}"><h3 class="nave-t">${n.nome} <small>nave ${S.nave} de ${NAVES.length}</small></h3><p class="empty">Porão ${used()}/${S.cap} · motor ${S.engLv.toFixed(1)} · armas ${S.wpLv.toFixed(1)}</p>` + ['cap', 'eng', 'wp'].map(k => {
    const L = f[PVK[k]], max = L >= 5;
    return `<div class="up"><div><b>${ROTULO[k]} nv.${L}/5</b><small>${dica[k]}: ${val[k](L)}${max ? '' : ' → ' + val[k](L + 1)}</small></div><button class="buy" data-up="${k}" ${max ? 'disabled' : ''}>${max ? 'MÁX' : fmt(upCusto(n, k, L)) + ' Cr'}</button></div>`;
  }).join('') + '</div>';
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
  const lista = NAVES.filter(n => hangarTab === 'minhas' ? S.frota[n.id] : !S.frota[n.id]);
  const tile = n => {
    const f = S.frota[n.id], st = estado[n.id - 1], c = f ? f.c : 1, m = f ? f.m : 1, a = f ? f.a : 1;
    const img = `<div class="ntile-img" data-prev="${n.id}"><img loading="lazy" alt="" src="${nsrc(n.id, 'motor', m)}"><img loading="lazy" alt="" src="${nsrc(n.id, 'casco')}"><img loading="lazy" alt="" src="${nsrc(n.id, 'porao', c)}"><img loading="lazy" alt="" src="${nsrc(n.id, 'armas', a)}"></div>`;
    const info = f ? `Nv. ${f.c}/${f.m}/${f.a} · porão ${capDe(n, f.c)}` : `porão ${n.cap0} · motor ${n.eng0.toFixed(1)} · armas ${n.wp0.toFixed(1)}`;
    const btn = st === 'E' ? '<span class="tag">Equipada</span>' : st === 'O' ? `<button type="button" class="buy" data-equip="${n.id}" ${emPartida ? 'disabled' : ''}>Equipar</button>`
      : st === 'L' ? `<span class="tag lock">🔒 ${RANKS[n.rank][1]}</span>` : `<button type="button" class="buy" data-compra="${n.id}" ${st === 'P' || emPartida ? 'disabled' : ''}>${fmt(n.preco).replace(',00', '')} Cr</button>`;
    return `<div class="ntile ${st === 'E' ? 'eq' : ''} ${st === 'L' ? 'lk' : ''}">${img}<b>${n.nome}</b><small>Nave ${n.id} · ${info}</small>${btn}</div>`;
  };
  el.innerHTML = `<h3 class="nave-t">Hangar</h3><div class="chips tabs"><button type="button" data-ht="minhas" class="${hangarTab === 'minhas' ? 'on' : ''}">Minhas (${Object.keys(S.frota).length})</button><button type="button" data-ht="loja" class="${hangarTab === 'loja' ? 'on' : ''}">Loja (${NAVES.length - Object.keys(S.frota).length})</button></div>`
    + (emPartida ? '<p class="empty">Troca e compra de naves ficam desligadas durante uma partida.</p>' : '')
    + `<div class="ngrid">${lista.map(tile).join('') || '<p class="empty">Nada por aqui.</p>'}</div>`;
}
function renderWorld() {
  renderInfo(); renderShipCard();
  $('#trip').textContent = S.trip ? `Em trânsito para ${plan(S.trip.to)?.nome || ''}…` : '';
  $('#p-market h2').textContent = 'Terminal de mercado · ' + (S.trip ? 'em trânsito' : (plan(S.loc)?.nome || ''));
  $('#fleet').innerHTML = `<div class="hull ${S.hull < 30 ? 'low' : ''}"><span>Casco ${S.hull}% / máx. ${S.maxHull}%</span><i style="width:${S.hull}%"></i></div>
    <div class="up"><div><b>Reparar casco</b><small>Cada reparo desgasta 1% da integridade máxima</small></div><button class="buy" data-up="fix" ${S.hull >= S.maxHull ? 'disabled' : ''}>${fmt(fixCost())} Cr</button></div>
    <div class="up"><div><b>Revisão completa</b><small>Restaura a integridade máxima a 100%</small></div><button class="buy" data-up="over" ${S.maxHull >= 100 ? 'disabled' : ''}>${fmt(overCost())} Cr</button></div>
    ${CLOUD() ? upRowsNave() : `<p class="empty">Porão: ${used()}/${S.cap} · Motor nv.${S.engLv}</p>
    <div class="up"><div><b>Porão nv.${S.capLv}</b><small>+40 de capacidade</small></div><button class="buy" data-up="cap">${fmt(1000 * S.capLv)} Cr</button></div>
    <div class="up"><div><b>Motor nv.${S.engLv}</b><small>Viagens mais rápidas · alcance de ${S.engLv} salto(s) galáctico(s)</small></div><button class="buy" data-up="eng" ${S.engLv >= 5 ? 'disabled' : ''}>${S.engLv >= 5 ? 'MÁX' : fmt(1200 * S.engLv) + ' Cr'}</button></div>
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
  c.save(); c.translate(50, H * .46 + Math.sin(ts / 700) * 1.2); paintShip(c, o, ts, (big ? 88 : 76) - (o.id - 1) * (big ? .36 : .3)); c.restore();   // naves pequenas são desenhadas maiores na caixa, para aparecerem

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
    let u = clamp((NOW() - st) / (S.trip.end - st), 0, 1); u = u * u * (3 - 2 * u);
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
  // rótulo com placa
  const m = p.m, best = Object.keys(m).sort((x, y) => m[x] - m[y])[0], ty = s.y + r * 1.5 + 12;
  cx.font = `600 ${(dense ? 7 : 8.5) * Math.max(s.sc, .9)}px Chakra Petch, sans-serif`; cx.textAlign = 'center';
  const w = cx.measureText(p.nome).width + 10; cx.fillStyle = 'rgba(4,10,20,.7)'; cx.fillRect(s.x - w / 2, ty - 9, w, 12);
  cx.fillStyle = '#e6f1fb'; cx.fillText(p.nome, s.x, ty);
  cx.fillStyle = here ? '#39ff88' : '#8fa3b8'; cx.font = '7px Chakra Petch, sans-serif';
  if (!dense || here || on || lock) cx.fillText(lock ? '🔒 ' + RANKS[p.t][1] : here ? '● você está aqui' : `${best && m[best] < 1 ? '▼' + SHORT[best] + ' ' : ''}⛽${trip(p.id).cost}`, s.x, ty + 10); cx.globalAlpha = 1;
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
const NPCS = Array.from({ length:8 }, (_, i) => ({ id:1 + Math.floor(Math.random() * 50), m:1 + Math.floor(Math.random() * 3), a:null, b:null, t0:0, dur:0, wait:Math.random() * 6000 }));
function trafego(ts) {
  if (!PL.length || cam.z < .5 || !S.fx) return;
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
    cx.globalAlpha = .55 * fade; cx.strokeStyle = 'rgba(127,233,255,.35)'; cx.lineWidth = Math.max(.6, sc * .8); cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - Math.cos(ang) * 14 * sc, y - Math.sin(ang) * 14 * sc); cx.stroke();
    const im = sprite(n.id, n.m, false); if (im) { cx.save(); cx.translate(x, y); cx.rotate(ang + Math.PI / 2); const k = sc * .42 * .4 * 1.5; cx.scale(k, k); cx.drawImage(im, -50, -50); cx.restore(); }
  });
  cx.restore();
}
/* ---------- piratas e monstros: o servidor decide as lutas (S.trip.enc); aqui só se desenha. Mesma fórmula de patrulha do servidor. ---------- */
const HH = n => { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 0x45d9f3b); n ^= n >>> 4; n = Math.imul(n, 0x45d9f3b); n ^= n >>> 15; return n >>> 0; };
function iniG(g, k) {
  const h = HH(g * 977 + k * 131 + 7), h2 = HH(h + 1), m = g >= 2 && k % 3 === 2, lv = Math.min(9, 1 + Math.floor((g + (k % 3)) * .8) + (m ? 1 : 0));
  return { g, k, T:30000 + (h >> 4) % 25000, ph:((h2 >> 6) % 1000) / 1000, m, lv, R:m ? 38 : 26 };
}
function iniAt(e, t) {
  const pl = GALAXIES[e.g].planetas, tt = t / e.T + e.ph, n = Math.floor(tt), u = tt - n, q = i => pl[HH(e.g * 977 + e.k * 131 + i * 7919 + 13) % pl.length], x = Math.min(1, u / .8);
  return { a:q(n - 1), b:q(n), f:x * x * (3 - 2 * x) };
}
const iniOn = () => CLOUD() && !(S.partida && !S.partida.piratas);
function iniTela(e, t) {
  const w = iniAt(e, t), a = plan(w.a.id), b = plan(w.b.id); if (!a || !b || !a._s || !b._s) return null;
  const dw = Math.hypot(a.x - b.x, a.y - b.y), ds = Math.hypot(a._s.x - b._s.x, a._s.y - b._s.y), ref = plan(S.loc)?._s;
  let k = dw > 1 ? ds / dw : (ref ? ref.sc * 1.5 : 1.5); if (!(k > 0)) k = 1.5;
  return { x:a._s.x + (b._s.x - a._s.x) * w.f, y:a._s.y + (b._s.y - a._s.y) * w.f, sc:a._s.sc + (b._s.sc - a._s.sc) * w.f, k };
}
const INIM = {};   // sprites dos inimigos (SVG em assets/inimigos), rasterizados uma vez em 128px
const tierDe = lv => lv <= 2 ? 1 : lv === 3 ? 2 : lv <= 5 ? 3 : lv <= 7 ? 4 : 5;
const CAM = ['sombra', 'membros', 'corpo', 'detalhes', 'brilho'];
function inimSprite(m, tier) {
  const key = (m ? 'monstro_' : 'pirata_') + tier, o = INIM[key];
  if (o) return o.c || null;
  const e = INIM[key] = { c:null, L:null }, url = `assets/inimigos/${key}.svg`;
  const rast = u => new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 128; c.getContext('2d').drawImage(im, 0, 0, 128, 128); ok(c); }; im.onerror = () => ok(null); im.src = u; });
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
function monstroAnim(L, sz, tm, t, k) {
  const lay = (c, f) => { if (!c) return; cx.save(); f && f(); cx.drawImage(c, -sz / 2, -sz / 2, sz, sz); cx.restore(); };
  const w = Math.sin(tm * 2.1 + k), w2 = Math.sin(tm * 1.3 + k * 2), resp = 1 + Math.sin(tm * 1.7) * .035;
  lay(L.sombra);
  lay(L.membros, () => { if (t === 4) cx.scale(1 + w * .12, 1 - w * .04); else if (t === 5) cx.rotate(Math.sin(tm * .6) * .12); else { cx.rotate(w * .06); cx.scale(1 + w2 * .04, 1 - w2 * .04); } });
  cx.save(); cx.translate(0, Math.sin(tm * 1.6 + k) * sz * .025); cx.scale(resp, resp);
  lay(L.corpo); lay(L.detalhes);
  cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = .55 + .45 * Math.sin(tm * 3 + k); lay(L.brilho); cx.restore();
}
function desenhaInimigo(p, e, ts, alvo, forca) {   // p: posição na tela; alvo: ângulo para onde olha (só os piratas giram)
  const k = p.sc * (cam.z < .5 ? .7 : 1), tm = ts / 1000 + e.k * 1.7, tier = tierDe(e.lv), im = inimSprite(e.m, tier), sz = (e.m ? 26 + tier * 5 : 22 + tier * 3) * k;
  cx.save(); cx.translate(p.x, p.y);
  cx.fillStyle = e.m ? 'rgba(178,75,255,.11)' : 'rgba(255,50,50,.12)'; cx.beginPath(); cx.arc(0, 0, sz * .62, 0, 7); cx.fill();   // halo de aviso, sem shadowBlur
  if (im) {
    const st = INIM[(e.m ? 'monstro_' : 'pirata_') + tier];
    if (e.m && st && st.L) { cx.translate(Math.sin(tm * .8 + e.k) * sz * .03, Math.sin(tm * 1.1) * sz * .04); cx.rotate(Math.sin(tm * .9) * .05); monstroAnim(st.L, sz, tm, tier, e.k); }   // flutua e se mexe por camadas
    else { cx.rotate(e.m ? 0 : alvo + Math.PI / 2); cx.drawImage(im, -sz / 2, -sz / 2, sz, sz); }
  }
  cx.restore();
  if (cam.z >= .5 || forca) { cx.save(); cx.font = '700 7px Chakra Petch, sans-serif'; cx.textAlign = 'center'; const tx = (e.m ? '☣ ' : '☠ ') + 'nv.' + e.lv, ty = p.y - (e.m ? 17 + tierDe(e.lv) * 2.5 : 14 + tierDe(e.lv) * 1.5) * p.sc; cx.lineWidth = 2; cx.strokeStyle = 'rgba(0,0,0,.7)'; cx.strokeText(tx, p.x, ty); cx.fillStyle = e.m ? '#e6b3ff' : '#ff8a8a'; cx.fillText(tx, p.x, ty); cx.restore(); }
}
function inimigos(ts) {
  if (!iniOn() || !PL.length) return;
  const now = NOW(), enc = S.trip?.enc || [], n = 3 + Math.min(S.gal, 4);
  for (let k = 0; k < n; k++) {
    const e = iniG(S.gal, k), f = enc.find(x => x.k === k), pos = iniTela(e, now); if (!pos) continue;
    if (f && S.trip) { if (now >= f.tc + 3200) continue; if (now >= f.td) { desenhaLuta(e, f, now, ts); continue; } }
    // anel de alcance (discreto) e o inimigo patrulhando
    const rr = e.R * pos.k; cx.save(); cx.globalAlpha = .24 + .08 * Math.sin(ts / 500 + k); cx.strokeStyle = e.m ? '#b24bff' : '#ff4040'; cx.lineWidth = 1; cx.beginPath(); cx.arc(pos.x, pos.y, rr, 0, 7); cx.stroke(); cx.restore();
    const nx = iniTela(e, now + 400), ang = nx ? Math.atan2(nx.y - pos.y, nx.x - pos.x) : 0;
    cx.save(); cx.globalAlpha = .9; desenhaInimigo(pos, e, ts, ang); cx.restore();
  }
}
function desenhaLuta(e, f, now, ts) {
  const sp = shipPos(ts); let p;
  if (now < f.tc) { const a = iniTela(e, f.td), q = clamp((now - f.td) / (f.tc - f.td), 0, 1), s2 = q * q; p = { x:a.x + (sp.x - a.x) * s2, y:a.y + (sp.y - a.y) * s2, sc:a.sc }; }
  else { const o = ts / 160; p = { x:sp.x + Math.cos(o) * 12 * sp.sc, y:sp.y - 10 * sp.sc + Math.sin(o) * 5 * sp.sc, sc:sp.sc }; }
  const ang = Math.atan2(sp.y - p.y, sp.x - p.x);
  if (now < f.tc) {   // perseguição: alerta piscando sobre a sua nave
    cx.save(); cx.fillStyle = `rgba(255,70,70,${.6 + .4 * Math.sin(ts / 90)})`; cx.font = '700 12px Chakra Petch, sans-serif'; cx.textAlign = 'center'; cx.fillText('⚠ ' + f.nm + ' na cola!', sp.x, sp.y - 24 * sp.sc); cx.restore();
  } else if (now < f.tc + 2400) {   // combate: tiros trocados e clarões
    cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round';
    if (Math.floor(ts / 110) % 2) { cx.strokeStyle = e.m ? 'rgba(200,100,255,.9)' : 'rgba(255,70,50,.9)'; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(sp.x, sp.y); cx.stroke(); }
    if (Math.floor(ts / 110 + 1) % 2 && f.w) { cx.strokeStyle = 'rgba(80,240,255,.95)'; cx.lineWidth = 1.8; cx.beginPath(); cx.moveTo(sp.x, sp.y); cx.lineTo(p.x, p.y); cx.stroke(); }
    const fl = .25 + .25 * Math.sin(ts / 40); cx.fillStyle = f.w ? `rgba(120,255,255,${fl})` : `rgba(255,60,40,${fl})`; cx.beginPath(); cx.arc(sp.x, sp.y, 10 * sp.sc, 0, 7); cx.fill(); cx.restore();
  } else if (f.w) {   // vitória: o inimigo explode
    const q = clamp((now - f.tc - 2400) / 800, 0, 1); cx.save(); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = `rgba(255,${180 - q * 120 | 0},60,${1 - q})`; cx.beginPath(); cx.arc(p.x, p.y, (4 + q * 20) * p.sc, 0, 7); cx.fill(); cx.restore();
  }
  if (now < f.tc + 2400 || !f.w) { cx.save(); cx.globalAlpha = now < f.tc + 2400 ? 1 : clamp(1 - (now - f.tc - 2400) / 800, 0, 1); desenhaInimigo(p, e, ts, ang, true); cx.restore(); }
  if (now >= f.tc + 1200 && now < f.tc + 3200) {   // resultado flutuando sobre a nave
    cx.save(); cx.font = '700 11px Chakra Petch, sans-serif'; cx.textAlign = 'center'; cx.fillStyle = f.w ? '#5dff9b' : '#ff6b6b'; cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.75)';
    cx.strokeText(f.w ? `VITÓRIA! +${f.loot} Cr` : `DERROTA! casco -${f.dmg}%`, sp.x, sp.y - 26 * sp.sc - (now - f.tc - 1200) / 90); cx.fillText(f.w ? `VITÓRIA! +${f.loot} Cr` : `DERROTA! casco -${f.dmg}%`, sp.x, sp.y - 26 * sp.sc - (now - f.tc - 1200) / 90); cx.restore();
  }
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
  PL.slice().sort((a, b) => a._s.y - b._s.y).forEach(p => drawPlanet(p, ts));
  if (t) { const d = plan(t.to)._s, k = (ts / 25) % 30; cx.strokeStyle = `rgba(62,230,255,${1 - k / 30})`; cx.lineWidth = 1.2; cx.beginPath(); cx.ellipse(d.x, d.y + 14 * d.sc, k * d.sc, k * d.sc * .35, 0, 0, 7); cx.stroke(); }
  inimigos(ts);
  drawShip(ts);
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
      : `<button class="buy" data-jump="${i}" ${S.trip ? 'disabled' : ''}>Saltar<small>⛽ ${fmt(jumpCost(i))} Cr · ${hops(i)} salto(s)</small></button>`);
}
function renderInfo() {
  $('#mapsheet').hidden = sel == null && selG == null; if (sel == null && selG == null) return;
  setTimeout(placeSheet, 0);
  if (selG != null) { $('#mapinfo').innerHTML = galInfo(selG); return; }
  const p = plan(sel), here = !S.trip && p.id === S.loc, m = p.m, t = trip(p.id);
  const chips = Object.keys(m).map(k => `<li class="${m[k] < 1 ? 'up' : 'down'}">${SHORT[k]} ${m[k] < 1 ? '▼' : '▲'} ${Math.abs(Math.round((m[k] - 1) * 100))}%</li>`).join('') || '<li>Hub: preços neutros</li>';
  $('#mapinfo').innerHTML = `<h3>${p.img ? `<img class="pimg" src="assets/planets/${p.img}" alt="">` : ''}${p.nome}</h3><ul class="chips">${chips}</ul>`
    + (S.ev && S.ev.p === p.id ? `<p class="evtl">⚡ ${S.ev.t}</p>` : '')
    + (p.t > S.rank ? `<small>🔒 Exige a patente <b>${RANKS[p.t][1]}</b>.</small>` : here ? '<small>Você está aqui. Toque em outro planeta ou galáxia.</small>'
            : `<button class="buy" data-go="${p.id}" ${S.trip ? 'disabled' : ''}>Viajar<small>⛽ ${fmt(t.cost)} Cr · ${t.secs}s</small></button>`);
}

/* ---------- Vício: som, missões, ranking, gráfico ---------- */
let AC;
function sfx(k) {
  if (!S.sound) return;
  try {
    AC = AC || new AudioContext();
    const seq = { ok:[[660,.07],[880,.09]], err:[[160,.15]], win:[[523,.1],[659,.1],[784,.1],[1047,.25]], alert:[[440,.1],[330,.1],[440,.1]] }[k] || [];
    let t = AC.currentTime;
    seq.forEach(([f, d]) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = k === 'err' ? 'sawtooth' : 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d); t += d; });
    if (seq.length) navigator.vibrate?.(k === 'err' ? [60, 40, 60] : k === 'win' ? [40, 30, 80] : 20);
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
  setTimeout(() => say(`Bônus diário: ${fmt(b)} Cr (sequência de ${S.streak} dia/s). Volte amanhã para mais!`, 'win'), 800);
}
/* Rivais simulados. Para ranking global real, envie {nome, patrimônio} a uma API (Cloudflare Worker + KV, Supabase) em renderMeta(). */
const RIVALS = [['Kira Vex',9000,380],['Dr. Orbit',14000,300],['Zenobia',6000,420],['Capitão Nulo',22000,220],['Lyra-7',11000,330],['Barão Rubro',40000,180]];
let RANK = null, rankAt = 0, lastPos = 0;
async function carregarRanking(force) {   // ranking global real (cloud): patrimônio guardado pelo servidor
  if (MODE === 'partida' || !TOK || !CLOUD() || document.hidden || $('#p-notes').offsetParent === null) return;   // só busca com o painel à vista
  if (!force && Date.now() - rankAt < 60000) return; rankAt = Date.now();
  try { RANK = await api('/ranking'); } catch { return; }
  if (RANK.eu) { if (lastPos && RANK.eu.pos < lastPos) say(`Você subiu para #${RANK.eu.pos} no ranking global!`, 'win'); lastPos = RANK.eu.pos; }
  renderBoard();
}
function renderBoard() {
  if (MODE === 'partida') { renderPlacar(); return; }
  if (!RANK) { $('#board').innerHTML = '<li class="empty">Carregando ranking…</li>'; return; }
  const me = RANK.eu, rows = RANK.top.map((r, i) => `<li class="${me && r.n === me.n ? 'me' : ''}"><span><i class="pos">${i + 1}</i> ${r.n}</span><b class="mono">${fmt(r.w)}</b></li>`);
  if (me && me.pos > RANK.top.length) rows.push(`<li class="gap"><span>…</span></li>`, `<li class="me"><span><i class="pos">${me.pos}</i> ${me.n}</span><b class="mono">${fmt(me.w)}</b></li>`);
  $('#board').innerHTML = rows.join('') + `<li class="tot"><span>${RANK.total} piloto${RANK.total === 1 ? '' : 's'} na galáxia</span></li>`;
}
function board() {
  const h = (Date.now() - S.t0) / 36e5, rows = RIVALS.map(([n, s, r]) => ({ n, w:s + r * h }));
  rows.push({ n:'Você', w:S.credits + cargo(), me:1 }); return rows.sort((a, b) => b.w - a.w);
}
function renderMeta() {
  const d = S.daily;
  if (!CLOUD()) MIS.forEach(m => { if (!d.done[m.k] && d.p[m.k] >= m.n()) { d.done[m.k] = 1; S.credits += m.r; save(); $('#hud-credits').textContent = fmt(S.credits); say(`Missão cumprida: ${m.t}! +${fmt(m.r)} Cr`, 'win'); } });
  $('#mis').innerHTML = MIS.map(m => { const n = Math.round(m.n()), v = Math.min(Math.round(d.p[m.k]), n);
    return `<li class="${d.done[m.k] ? 'done' : ''}"><span>${m.t} <b class="mono">${v}/${n}</b></span><small>+${m.r} Cr</small><i style="width:${v / n * 100}%"></i></li>`; }).join('');
  $('#streak').textContent = `· sequência ${S.streak}d`;
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
  const t = e.target.closest('[data-ht]'); if (t) { hangarTab = t.dataset.ht; hangarSig = ''; return renderHangar(); }
  const c = e.target.closest('[data-compra]'); if (c) return void act('comprarNave', { i:+c.dataset.compra });
  const q = e.target.closest('[data-equip]'); if (q) return void act('equipar', { i:+q.dataset.equip }).then(ok => { if (ok) pvShip = 0; });
  const p = e.target.closest('[data-prev]'); if (p) { const i = +p.dataset.prev; pvShip = pvShip === i ? 0 : i; pvPin = null; renderWorld(); }
});
$('#market').addEventListener('click', e => { const s = e.target.closest('.spark'); if (s) showChart(s.closest('[data-id]').dataset.id); });
$('#chart').onclick = e => { if (e.target.id === 'chart' || e.target.id === 'chart-x') $('#chart').hidden = true; };
document.body.classList.toggle('still', !S.fx);
$('#set-fx').checked = S.fx; $('#set-fx').onchange = e => { S.fx = e.target.checked; document.body.classList.toggle('still', !S.fx); save(); };
$('#set-sound').checked = S.sound; $('#set-sound').onchange = e => { S.sound = e.target.checked; save(); };
$('#mapinfo').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) goTo(b.dataset.go); const j = e.target.closest('[data-jump]'); if (j) jump(...j.dataset.jump.split(',').map(Number)); });
$('#shipcard').onclick = () => document.querySelector('.nav [data-view=fleet]').click();
$('#fleet').addEventListener('pointerover', e => { const b = e.target.closest('[data-up]'), k = b && b.dataset.up; pvHover = PVN[k] ? k : null; });
$('#fleet').addEventListener('pointerleave', () => { pvHover = null; });
$('#fleet').addEventListener('click', e => { const b = e.target.closest('[data-up]'); if (b) upgrade(b.dataset.up); });
$('#market').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (b) trade(b.closest('[data-id]').dataset.id, b.dataset.act);
});
document.querySelectorAll('[data-qty]').forEach(b => b.onclick = () => $('#qty').value = b.dataset.qty);
document.querySelectorAll('.nav [data-view]').forEach(b => b.onclick = () => {
  document.body.dataset.view = b.dataset.view; if (b.dataset.view === 'market') carregarRanking();
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('on', x === b));
});
$('#reset').onclick = () => { if (confirm('Apagar todo o progresso?')) { localStorage.removeItem(KEY); location.reload(); } };

/* ---------- Loop principal ---------- */
/* ---------- Cena de fundo da tela de login: planetas, parallax e uma nave viajando ---------- */
let introOn = false, introCv = null, introCx = null, introPl = null, introRun = null;
function introSetup() {
  const all = GALAXIES.flatMap(g => g.planetas), pick = [0, 3, 6, 9, 12, 15, 19, 23, 27, 31, 36, 41, 47, 52].map(i => all[i % all.length]);
  const R = (a, b, i) => a + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * (b - a);
  introPl = pick.map((p, i) => ({ p, x:R(.05, .95, i + 1), y:R(.12, .88, i + 7), d:.35 + R(0, .65, i + 3), ph:R(0, 6.28, i + 5) }));
  introPl.sort((a, b) => a.d - b.d);
  introRun = { a:0, b:1, t0:performance.now(), dur:7000, wait:0, trail:[] };
}
const introXY = (o, ts, W, H) => { const sp = .004 * o.d; let x = ((o.x - ts / 1000 * sp) % 1.15 + 1.15) % 1.15 - .075; return { x:x * W, y:o.y * H + Math.sin(ts / 2200 + o.ph) * 8 * o.d, r:(16 + 48 * o.d) * Math.min(W, H) / 800 }; };
function introFrame(ts) {
  if (!introOn) return; requestAnimationFrame(introFrame);
  const W = introCv.clientWidth, H = introCv.clientHeight; if (!W) return; const dpr = Math.min(devicePixelRatio || 1, 2);
  if (introCv.width !== Math.round(W * dpr)) { introCv.width = Math.round(W * dpr); introCv.height = Math.round(H * dpr); }
  const c = introCx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const pos = introPl.map(o => introXY(o, ts, W, H));
  // rota atual da nave
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
  if (!ru.wait && u < 1) { ru.trail.push({ x:sx, y:sy }); if (ru.trail.length > 46) ru.trail.shift(); } else if (ru.trail.length) ru.trail.shift();
  c.globalCompositeOperation = 'lighter';
  ru.trail.forEach((t, i) => { const k = i / ru.trail.length; c.fillStyle = `rgba(${k > .6 ? '255,190,90' : '255,120,60'},${k * .55})`; c.beginPath(); c.arc(t.x, t.y, 1.5 + k * 4, 0, 7); c.fill(); });
  c.globalCompositeOperation = 'source-over';
  const fade = ru.wait ? 0 : Math.min(1, Math.min(u, 1 - u) * 12 + .15);
  c.save(); c.globalAlpha = Math.max(0, fade); c.translate(sx, sy); c.rotate(ang + Math.PI / 2); c.scale(2.4, 2.4);
  paintShip(c, shipLv(), ts, 46 - (shipLv().id - 1) * .2); c.restore();
}
function introToggle(on) {
  if (on === introOn) return; introOn = on;
  if (!on) return;
  introCv = introCv || $('#intro'); introCx = introCx || introCv.getContext('2d'); if (!introPl) introSetup();
  requestAnimationFrame(introFrame);
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
const clearSession = () => { TOK = USER = ''; CTS = 0; ['astromercante_tok', 'astromercante_user', 'astromercante_cts', 'astromercante_google'].forEach(k => store(k, null)); };
// Só sobe para a nuvem o que mudou de verdade (compra, viagem, upgrade...) e sem os dados recalculáveis pelo relógio.
/* ---------- Conta e servidor ---------- */
const SERVER_KEYS = ['credits', 'stock', 'loc', 'gal', 'cap', 'capLv', 'engLv', 'wpLv', 'hull', 'maxHull', 'rank', 'trip', 'vis', 'daily', 'streak', 'lastDay', 'partida', 'nave', 'frota'];
let firstState = true;
function aplicarEstado(r) {   // o servidor manda; este aparelho só mostra
  if (r.agora) SKEW = r.agora - Date.now();
  if (r.feed) {
    const c = {}, a = {}; ['btc', 'gold', 'eth', 'fx'].forEach(k => { if (Number.isFinite(r.feed.change?.[k])) c[k] = r.feed.change[k]; if (Number.isFinite(r.feed.ant?.[k])) a[k] = r.feed.ant[k]; });
    change = c; ant = a; feedAt = r.feed.feedAt || 0; live = Object.keys(c).length > 0; setFeed();
  }
  if (r.v) V = r.v;
  const e = r.estado_jogo || (r.estado && typeof r.estado === 'object' ? r.estado : null);
  if (e) {
    const gal0 = S.gal; SERVER_KEYS.forEach(k => { S[k] = e[k]; });
    S.inv = {}; RES.forEach(x => { S.inv[x.id] = e.inv?.[x.id] ? { qty:e.inv[x.id].qty, avg:e.inv[x.id].avg } : { qty:0, avg:0 }; });
    if (firstState || S.gal !== gal0 || !PL.length) { setGalaxy(S.gal); const g = GALAXIES[S.gal]; if (firstState) { cam.x = g.wx; cam.y = g.wy; cam.z = 1; } else { warpT = performance.now(); flyTo(g.wx, g.wy, 1, 1400); } }
    if (!plan(S.loc)) S.loc = PL[0].id;
    sel = sel && plan(sel) ? sel : null; selG = selG != null && GALAXIES[selG] ? selG : null;
    clearTimeout(tripT); if (S.trip) tripT = setTimeout(refrescar, Math.max(0, S.trip.end - NOW()) + 500);   // a chegada é resolvida pelo servidor
    firstState = false; READY = true; document.body.classList.remove('loading');
    const now = NOW(); RES.forEach(x => { S.price[x.id] = priceNow(x, cyc(now)); }); S.ev = evNow(now);
  }
  (r.msgs || []).forEach(m => m.n ? note(m.m, m.k) : say(m.m, m.k));
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
let lastInput = Date.now();   // sem toque há 5 min e nave parada: pausa a consulta periódica (ao voltar a interagir, atualiza na hora)
['pointerdown', 'keydown', 'wheel'].forEach(ev => addEventListener(ev, () => { const idle = Date.now() - lastInput > 300000; lastInput = Date.now(); if (idle) refrescar(true); }, { passive:true }));
addEventListener('focus', () => refrescar());
setInterval(() => { if (Date.now() - lastInput < 300000 || S.trip) refrescar(); }, 60000);
setInterval(() => { if (MODE === 'partida') partidaPoll(); }, 20000);   // placar e relógio da partida
function renderAccount() {
  const on = !!TOK, has = !!API();
  $('#acct').hidden = !has; $('#acct').textContent = on ? '👤 ' + USER : 'Entrar';
  $('#acct-nome').textContent = on ? 'Conta: ' + USER : 'Sem conta';
  $('#acct-sync').textContent = !has ? 'Contas indisponíveis: configure o Worker em config.js.' : on ? syncMsg || 'Conectado.' : 'Progresso salvo só neste aparelho.';
  $('#acct-btn').hidden = on || !has; $('#acct-extra').hidden = !on;
}
const MODES = { in:{ t:'Entrar', f:['nome','senha'], ok:'Entrar' }, up:{ t:'Criar conta', f:['nome','email','senha','senha2'], ok:'Criar conta' },
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
  if (CONFIG.TURNSTILE_SITEKEY && (mode === 'up' || mode === 'forgot') && !tsToken) return err('Confirme que você não é um robô.');
  err(''); $('#au-ok').disabled = true;
  try {
    if (mode === 'in') await afterAuth(await api('/auth/entrar', 'POST', { nome, senha }), false);
    else if (mode === 'up') { const d = await api('/auth/registrar', 'POST', { nome, email, senha }); pendEmail = d.email; openAuth('code', `Enviamos um código de 6 dígitos para ${email}. Veja também a caixa de spam.`); }
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
async function logout() {
  if (!confirm('Sair da conta? Seu progresso está guardado na nuvem e volta quando você entrar de novo.')) return;
  try { await api('/auth/sair', 'POST'); } catch {}
  clearSession(); store(KEY, null); location.reload();
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
$('#auth').onclick = e => { if (e.target.id === 'auth') closeAuth(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuth(); });
renderAccount();
if (TOK && CLOUD()) refrescar(true);
else if (API()) openAuth('in');
applyGate();

if (!CLOUD()) for (const l in S.stock) for (const k in S.stock[l]) if (typeof S.stock[l][k] === 'number') S.stock[l][k] = { v:S.stock[l][k], t:Date.now() };   // formato antigo (modo local)
setGalaxy(GALAXIES[S.gal] ? S.gal : 0); if (!plan(S.loc)) S.loc = PL[0].id;
if (!CLOUD()) checkDay();
{ const now = NOW(), c0 = cyc(now); RES.forEach(r => { S.hist[r.id] = Array.from({ length:30 }, (_, i) => priceNow(r, c0 - (29 - i) * STEP)); S.price[r.id] = S.hist[r.id][29]; S.prev[r.id] = S.hist[r.id][28]; }); S.ev = evAt(now); }
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
fetchFeed().then(() => { note(live ? 'Feed real conectado: preços seguem cripto, ouro e câmbio.' : 'Feeds offline: simulação matemática ativa.', live ? 'ok' : 'alert'); tick(); });
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
