// Motor de regras do ASTROMERCANTE: roda SÓ no servidor. O aparelho do jogador apenas pede ações; aqui elas são validadas e executadas
// com o relógio e os preços do servidor. As regras espelham as do jogo (game.js, modo sem servidor): mantenha as duas em sincronia.
import { GALAXIES, MINERALS } from './dados.js';
import { NAVES, NAVE_MAX, capDe, engDe, wpDe, upCusto } from './naves.js';

export const STEP = 30000, FEED_EVERY = 300000, EVWIN = 180000, HOP = 560, FUSO = 3 * 3600e3;   // dia do jogo: horário de Brasília (UTC-3)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const cyc = (t) => Math.floor(t / STEP) * STEP;

export const RES = [
  { id: 'neutronio', nome: 'Cristais de Neutrônio', base: 120, vol: .006, src: 'btc' },
  { id: 'titanio', nome: 'Minério de Titânio', base: 45, vol: .003, src: 'gold' },
  { id: 'helio3', nome: 'Gás Hélio-3', base: 80, vol: .005, src: 'eth' },
  { id: 'especiarias', nome: 'Especiarias de Júpiter', base: 25, vol: .004, src: 'fx' },
  { id: 'plasma', nome: 'Plasma Sombrio', base: 300, vol: .007, src: 'xmr', t: 1 },
  { id: 'antimateria', nome: 'Antimatéria', base: 900, vol: .008, src: 'sol', t: 2 },
  { id: 'cristal', nome: 'Cristal Temporal', base: 2400, vol: .009, src: 'xaut', t: 3 },
  ...MINERALS.map((m) => ({ id: m.id, nome: m.nome, base: m.base, vol: m.vol, src: m.src, t: m.t })),
];
const RES_ID = Object.fromEntries(RES.map((r) => [r.id, r]));
const SHORT = { neutronio: 'Neutrônio', titanio: 'Titânio', helio3: 'Hélio-3', especiarias: 'Especiarias', plasma: 'Plasma', antimateria: 'Antimatéria', cristal: 'C. Temporal' };
MINERALS.forEach((m) => { SHORT[m.id] = m.nome; });
/* contadores de conquistas (S.st): vivem no estado gravado pelo servidor */
const mais = (S, k, n = 1) => { const t = (S.st ??= {}); t[k] = (t[k] || 0) + n; };
const maxi = (S, k, v) => { const t = (S.st ??= {}); if (v > (t[k] || 0)) t[k] = v; };
export const RANKS = [[0, 'Recruta'], [12000, 'Contrabandista'], [30000, 'Mercador estelar'], [100000, 'Barão orbital'], [300000, 'Comodoro'], [1000000, 'Almirante galáctico'], [3000000, 'Lenda das estrelas'], [10000000, 'Imperador dos dados'], [30000000, 'Soberano do vazio'], [100000000, 'Arquiteto do universo']];
const EVENTS = [
  { t: 'Tempestade solar eleva o Hélio-3', r: 'helio3', m: 1.3 },
  { t: 'Colapso de mina: Titânio escasso', r: 'titanio', m: 1.35 },
  { t: 'Piratas inundam o mercado de Especiarias', r: 'especiarias', m: .7 },
  { t: 'Febre hacker: Neutrônio dispara', r: 'neutronio', m: 1.4 },
  { t: 'Excesso de oferta derruba o Neutrônio', r: 'neutronio', m: .72 },
  { t: 'Greve em Nyx: Neutrônio nas alturas', r: 'neutronio', m: 1.5, p: 'nyx' },
  { t: 'Boom de demanda em Ícaro: Especiarias valem ouro', r: 'especiarias', m: 1.45, p: 'icaro' },
];
const MIS = [
  { k: 'trades', t: 'Faça negociações', n: () => 6, r: 300 },
  { k: 'trips', t: 'Viaje entre planetas', n: () => 2, r: 400 },
  { k: 'profit', t: 'Lucre vendendo (Cr)', n: (S) => 300 * (1 + S.rank), r: 600 },
];

export class Regra extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

/* ---------- preços: função pura do relógio + feed (idêntica à do jogo) ---------- */
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (n) => { let t = (n + 0x6D2B79F5) | 0; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const vnoise = (id, x) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f), h = hash(id), a = rnd(h + i), b = rnd(h + i + 1); return (a + (b - a) * s) * 2 - 1; };
const feedCh = (feed, src, t) => {
  const c = feed.change?.[src]; if (!Number.isFinite(c)) return null; const a = feed.ant?.[src];
  return Number.isFinite(a) && feed.feedAt ? a + (c - a) * clamp((t - feed.feedAt) / FEED_EVERY, 0, 1) : c;
};
// notícias do jogo: empurrão limitado (±20% no total), entra em 5 min, fica estável e sai suave no último quarto da duração
const newsMult = (id, t, feed) => {   // por produto vale a notícia mais recente (a anterior sai suavemente em 5 min): nunca soma efeitos; no máx. ±20%
  const at = [];
  for (const n of feed.news || []) if (n.s && t >= n.t0 && t < n.t1 && n.r?.includes(id)) at.push(n);
  if (!at.length) return 0;
  at.sort((a, b) => b.t0 - a.t0);
  const env = (n) => Math.min(1, (t - n.t0) / 300000, (n.t1 - t) / ((n.t1 - n.t0) * .25)), ent = Math.min(1, (t - at[0].t0) / 300000);
  return clamp(at[0].s * env(at[0]) + (at[1] ? (1 - ent) * at[1].s * env(at[1]) : 0), -.2, .2);
};
function precoBase(r, t, feed) {
  const s = t / 1000, n = vnoise(r.id + 'a', s / 900) * .55 + vnoise(r.id + 'b', s / 240) * .3 + vnoise(r.id + 'c', s / 60) * .15;
  const ch = feedCh(feed, r.src, t), tg = Number.isFinite(ch) ? clamp(ch * 3, -30, 30) / 100 : 0;
  return Math.max(1, r.base * (1 + tg) * (1 + newsMult(r.id, t, feed)) * (1 + n * Math.min(.35, r.vol * 18)));
}
export function evAt(now) {
  const k = Math.floor(now / EVWIN);
  for (const j of [k, k - 1]) if (rnd(hash('ev' + j)) < .18) {
    const e = EVENTS[Math.floor(rnd(hash('evi' + j)) * EVENTS.length)], end = (j + 2) * EVWIN;
    if (now < end) return { ...e, k: j, left: Math.ceil((end - now) / 60000) };
  }
  return null;
}

/* ---------- estado ---------- */
export const novo = (now) => ({ v: 3, lt: 0, credits: 10000, inv: {}, stock: {}, loc: 'orionis', gal: 0, nave: 1, frota: { 1: { c: 1, m: 1, a: 1, h: 100, mh: 100 } }, cap: 40, capLv: 1, engLv: 1, wpLv: 1, hull: 100, maxHull: 100, rank: 0, trip: null, vis: { 0: 1 }, daily: null, streak: 0, lastDay: '', t0: now, ult: 0, tv: 0 });

/** Aproveita um progresso antigo (salvo pelo aparelho) sem confiar nele: tudo é revalidado e limitado. */
export function normalizar(o, now) {
  const S = novo(now), num = (v, a, b, d) => (Number.isFinite(+v) ? clamp(+v, a, b) : d), int = (v, a, b, d) => Math.floor(num(v, a, b, d));
  o = o && typeof o === 'object' ? o : {};
  S.gal = GALAXIES[o.gal] ? int(o.gal, 0, GALAXIES.length - 1, 0) : 0;
  S.loc = GALAXIES[S.gal].planetas.some((p) => p.id === o.loc) ? o.loc : GALAXIES[S.gal].planetas[0].id;
  S.capLv = int(o.capLv, 1, 40, 1); S.cap = 40 * S.capLv; S.engLv = int(o.engLv, 1, 5, 1); S.wpLv = int(o.wpLv, 1, 40, 1);
  S.maxHull = int(o.maxHull, 40, 100, 100); S.hull = int(o.hull, 0, S.maxHull, S.maxHull);
  S.credits = num(o.credits, 0, 1e8, 10000);
  let livre = S.cap;
  for (const id in o.inv || {}) if (RES_ID[id]) { const q = Math.min(livre, int(o.inv[id]?.qty, 0, 1e6, 0)); if (q > 0) { S.inv[id] = { qty: q, avg: num(o.inv[id].avg, 0, 1e9, 0) }; livre -= q; } }
  S.vis = { 0: 1 }; for (const i in o.vis || {}) if (GALAXIES[i] && i <= S.gal) S.vis[i] = 1; S.vis[S.gal] = 1;
  S.streak = int(o.streak, 0, 10000, 0); S.lastDay = typeof o.lastDay === 'string' ? o.lastDay.slice(0, 10) : '';
  if (o.daily && typeof o.daily.day === 'string') S.daily = { day: o.daily.day.slice(0, 10), p: { trades: int(o.daily.p?.trades, 0, 1e6, 0), trips: int(o.daily.p?.trips, 0, 1e6, 0), profit: num(o.daily.p?.profit, 0, 1e9, 0) }, done: { ...(o.daily.done?.trades ? { trades: 1 } : {}), ...(o.daily.done?.trips ? { trips: 1 } : {}), ...(o.daily.done?.profit ? { profit: 1 } : {}) } };
  delete S.frota; migrar(S);   // níveis antigos viram a Nave 1
  return S;
}

/* ---------- naves: cada conta tem uma frota; a nave equipada define porão, motor e armamento ---------- */
/** Recalcula os valores efetivos (usados por todas as regras) a partir da nave equipada e dos níveis dela. */
export function recalc(S) {
  const n = NAVES[S.nave - 1], f = S.frota[S.nave];
  S.cap = capDe(n, f.c); S.capLv = S.cap / 40; S.engLv = engDe(n, f.m); S.wpLv = wpDe(n, f.a);
}
/** Conta antiga (porão/motor/armas sem limite, sem naves): vira a Nave 1; níveis acima de 5 são devolvidos em créditos. */
export function migrar(S) {
  if (S.frota && NAVES[S.nave - 1]) { S.v = 3; recalc(S); return false; }
  const lc = Math.floor(S.capLv) || 1, le = Math.floor(S.engLv) || 1, lw = Math.floor(S.wpLv) || 1;
  const soma = (de, ate, f) => { let t = 0; for (let l = de; l < ate; l++) t += f * l; return t; };   // custo antigo de cada nível acima do 5º
  S.credits += soma(5, lc, 1000) + soma(5, le, 1200) + soma(5, lw, 1500);
  S.nave = 1; S.frota = { 1: { c: Math.min(5, lc), m: Math.min(5, le), a: Math.min(5, lw), h: S.hull, mh: S.maxHull } }; S.v = 3; recalc(S);
  return true;
}

/* ---------- utilidades de regra ---------- */
const planetas = (S) => GALAXIES[S.gal].planetas;
const planeta = (S, id) => planetas(S).find((p) => p.id === id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const used = (S) => Object.values(S.inv).reduce((s, h) => s + h.qty, 0);
const dia = (now) => new Date(now - FUSO).toISOString().slice(0, 10);
const say = (msgs, m, k = 'ok') => msgs.push({ m, k });
const note = (msgs, m, k = '') => msgs.push({ m, k, n: 1 });
const fmt = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function stk(S, id, now) { const o = S.stock[S.loc]?.[id]; return o ? 100 - (100 - o.v) * Math.pow(.94, (now - o.t) / 30000) : 100; }
/** Liquidez do mercado: cada unidade negociada mexe LIQ do estoque (preço e estoque usam a mesma conta, então comprar e vender no mesmo lugar nunca dá lucro). */
export const LIQ = .4, TAXA_VENDA = .97, COMBUSTIVEL = .8;
/** Profundidade do mercado: em galáxias avançadas os planetas movimentam muito mais unidades (os porões lá são maiores), sem mudar a lógica de preço. */
export const GALK = .4;   // profundidade de mercado por galáxia (calibrado por simulação: bot esperto chega a 100M em ~25 h)
export const liq = (S) => LIQ / (1 + GALK * S.gal);
const setStk = (S, id, v, now) => { (S.stock[S.loc] ??= {})[id] = { v: Math.max(1, v), t: now }; };
/** Escassez: um planeta fica "em falta" do produto só enquanto você tem um contrato ativo para ele (dentro do prazo): não dá para comprá-lo lá. */
export function escasso(S, planId, now) {
  if (S.partida) return null;
  const x = (S.ct || []).find((k) => k.dest === planId && k.gal === S.gal && now <= k.ate);
  return x ? x.r : null;
}
export function preco(S, id, st, c) {
  const r = RES_ID[id], ev = S.partida && !S.partida.eventos ? null : evAt(c.now);
  return precoBase(r, cyc(c.now), S.partida && !S.partida.eventos ? { ...c.feed, news: [] } : c.feed) * (planeta(S, S.loc).m[id] || 1) * (1 + .12 * S.gal) * clamp((100 / Math.max(st, 5)) ** .4, .6, 2.5) * (ev && ev.r === id && (!ev.p || ev.p === S.loc) ? ev.m : 1);
}
const carga = (S, c) => Object.keys(S.inv).reduce((s, id) => s + S.inv[id].qty * preco(S, id, stk(S, id, c.now), c), 0);
export const patrimonio = (S, c) => S.credits + carga(S, c);
/** Parte do valor da frota que conta como patrimônio na carreira (patente e ranking): comprar nave e melhorias não zera mais o progresso.
 *  Conta 40% do preço das naves e 10% do custo das melhorias (o resto é "gasto"). Na partida não conta (todos começam do mesmo saldo). */
export const FROTA = { nave: .4, up: .1 };
export function valorFrota(S) {
  let v = 0;
  for (const k of Object.keys(S.frota || {})) {
    const n = NAVES[k - 1], f = S.frota[k]; if (!n || !f) continue;
    v += FROTA.nave * n.preco;
    for (const [tipo, campo] of [['cap', 'c'], ['eng', 'm'], ['wp', 'a']]) for (let L = 1; L < (f[campo] || 1); L++) v += FROTA.up * upCusto(n, tipo, L);
  }
  return v;
}
export const patrimonioTotal = (S, c) => patrimonio(S, c) + (S.partida ? 0 : valorFrota(S));
const fixCost = (S) => Math.round((S.maxHull - S.hull) * 12 * (1 + .25 * (S.capLv + S.engLv - 2)));
const porPct = (S) => 12 * (1 + .25 * (S.capLv + S.engLv - 2));   // custo de reparo de 1% de casco: cresce com o tamanho da nave
const overCost = (S) => Math.round((100 - S.maxHull) * porPct(S) * 10);   // revisão: cada ponto de integridade máxima perdido vale 10 reparos de 1%
/** Desgaste normal de uma viagem: proporcional à distância, ~1% a cada 100 unidades, sem depender da galáxia (o risco de cada galáxia vêm dos inimigos). Arredondamento sorteado mantém a média exata com casco inteiro. */
function desgasteViagem(S, d, teto) { const x = (.8 + Math.random()) * d / 100 * (1 + (S.engLv - 1) * .04) * (S.hull < 40 ? 1.3 : 1), b = Math.floor(x); return Math.min(teto || 99, b + (Math.random() < x - b ? 1 : 0)); }
const hops = (S, i) => Math.max(1, Math.round(Math.hypot(GALAXIES[i].wx - GALAXIES[S.gal].wx, GALAXIES[i].wy - GALAXIES[S.gal].wy) / HOP));
const jumpCost = (S, i) => Math.round(150 * (1 + i) * hops(S, i) * (1 + .3 * (S.engLv - 1) + .25 * (S.capLv - 1)) * (1 + (100 - S.hull) / 150));
const tripInfo = (S, to) => { const d = dist(planeta(S, S.loc), planeta(S, to)); return { d, cost: Math.round(d * .8 * COMBUSTIVEL * (1 + .3 * (S.engLv - 1) + .25 * (S.capLv - 1)) * (1 + (100 - S.hull) / 150)), secs: Math.max(3, Math.round(d / (18 + S.engLv * 7) * (S.hull < 40 ? 1.3 : 1))) }; };

/* ---------- inimigos do mapa (piratas e monstros): patrulham por relógio, iguais para todos; o aparelho só desenha o que o servidor decide ---------- */
const HH = (n) => { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 0x45d9f3b); n ^= n >>> 4; n = Math.imul(n, 0x45d9f3b); n ^= n >>> 15; return n >>> 0; };
export const PAUSA = 4800;   // tempo que a nave fica parada lutando (a chegada atrasa esse tempo)
export const nIni = (g) => 2 + Math.min(g, 2);
/** Poder "típico" de um jogador na galáxia g (nave da patente certa, upgrades médios): os inimigos são calibrados a partir dele. */
export const PT = (g) => (2 + .5 * g) * (1 + .02 * g);
export function ini(g, k) {
  const h = HH(g * 977 + k * 131 + 7), h2 = HH(h + 1), m = g >= 2 && k % 3 === 2, tier = clamp(1 + Math.floor((g + (k % 3)) * .4), 1, 5);
  const lv = Math.max(1, Math.round(10 * (m ? PT(g) * 1.15 : PT(g) * [.5, .8, .95][k % 3])) / 10);   // poder de fogo do inimigo: pirata fraco / médio / forte; monstro ≈ 115% do poder típico
  return { g, k, T: 30000 + (h >> 4) % 25000, ph: ((h2 >> 6) % 1000) / 1000, m, lv, tier, R: m ? 38 : 26, nm: m ? (tier >= 3 ? 'Leviatã estelar' : 'Monstro do vazio') : (tier >= 3 ? 'Frota pirata' : 'Piratas') };
}
/** Rota em etapas: a cada etapa o inimigo sorteia (de forma fixa por relógio) o próximo planeta, então o caminho nunca se repete de forma previsível. */
export function iniAt(e, t) {
  const pl = GALAXIES[e.g].planetas, tt = t / e.T + e.ph, n = Math.floor(tt), u = tt - n, q = (i) => pl[HH(e.g * 977 + e.k * 131 + i * 7919 + 13) % pl.length], x = Math.min(1, u / .8);
  return { a: q(n - 1), b: q(n), f: x * x * (3 - 2 * x) };
}
function encontros(S, t0, t1) {
  if (S.partida && !S.partida.piratas) return [];
  const A = planeta(S, S.trip.from), B = planeta(S, S.trip.to), out = [];
  for (let k = 0; k < nIni(S.gal); k++) {
    const e = ini(S.gal, k);
    for (let t = t0; t <= t1 - 800; t += 400) {
      const u = (t - t0) / (t1 - t0), q = u * u * (3 - 2 * u), sx = A.x + (B.x - A.x) * q, sy = A.y + (B.y - A.y) * q, w = iniAt(e, t);
      const d = Math.hypot(w.a.x + (w.b.x - w.a.x) * w.f - sx, w.a.y + (w.b.y - w.a.y) * w.f - sy);
      if (d <= e.R) { const tc = Math.round(t + clamp(d / 45 * 1000, 1200, 5000)); if (tc <= t1 - 500) out.push(lutar(S, e, t, tc)); break; }
    }
  }
  out.sort((x, y) => x.td - y.td);
  return out.slice(0, 1);   // uma luta por viagem: a nave para para lutar (PAUSA ms) e depois segue
}
/** Poder de combate: arma da nave, enfraquecida por casco danificado, com bônus pequeno de patente. O inimigo vale o nível (monstro +20%). */
export const poderJog = (S) => S.wpLv * (.6 + .4 * S.hull / 100) * (1 + .02 * S.rank);
export const poderIni = (e) => e.lv;
/** Saque-base por galáxia: cresce ~38% a cada galáxia, então voltar a galáxias fáceis não compensa. */
export const SAQUE = (g) => 130 * Math.pow(1.38, g);
/** A luta é decidida pela razão de poder (com ±8% de "sorte do momento") e fica gravada: o que se vê no mapa é o que acontece.
 *  w: 1 vitória, 2 empate (escapa com avarias), 0 derrota. */
function lutar(S, e, td, tc) {
  const D = S.gal, P = poderJog(S), E = poderIni(e), r = P / E, q = E / P, rr = r * (.92 + Math.random() * .16), v = (a, b) => a + Math.random() * (b - a);
  const o = { k: e.k, td, tc, lv: e.lv, nm: e.nm, m: e.m ? 1 : 0, r: Math.round(r * 100) / 100, w: rr >= 1 ? 1 : rr >= .75 ? 2 : 0 };
  if (o.w === 1) {
    // vencer inimigo muito fraco paga pouco (clamp em .25): sem farmar monstro pequeno
    o.loot = Math.round(SAQUE(D) * clamp(q, .25, 1.4) * (e.m ? 1.8 : 1) * v(.88, 1.12));
    o.dmg = Math.max(1, Math.round(3 * Math.min(q, 2) * (1 + D * .05) * v(.8, 1.2)));
  } else if (o.w === 2) o.dmg = Math.round(6 * (1 + D * .05) * v(.85, 1.15));
  else { o.dmg = Math.min(22, Math.round((8 + 5 * Math.min(q, 2)) * (1 + D * .06) * v(.85, 1.15))); o.f = clamp(.08 + .08 * q, .1, .45); }
  return o;
}
/** Roteiro do tutorial (só contas novas, só a carreira): a 1ª viagem é tranquila (sem inimigos) e a 2ª cruza com um pirata fraco, que o jogador vence, para ver como a luta funciona.
 *  Contas antigas não têm o campo tv e jogam normalmente. */
function viagemTutorial(S) {
  if (S.partida || S.tv === undefined || S.tv > 1) return null;
  if (S.tv === 0) return [];
  const e = ini(S.gal, 0), { start: a, end: b } = S.trip, dur = b - a, td = a + Math.max(500, Math.round(dur * .3)), tc = Math.min(td + 2200, b - 400);
  if (tc - td < 800) return [];
  const P = poderJog(S);
  return [{ k: 0, td, tc, lv: e.lv, nm: e.nm, m: 0, r: Math.round(P / e.lv * 100) / 100, w: 1, loot: Math.round(SAQUE(S.gal) * .5), dmg: 2 }];
}
/** Partidas podem desligar o desgaste do casco (cfg.casco === false): sem dano, sem reparo. As lutas continuam valendo (saque e carga perdida). */
/** Desgaste sofrido na partida em pontos de casco por viagem (conta o dano e não o reparo pago, então não dá para fugir dele): mede o perigo da sala e alimenta o bônus do 1º colocado.
 *  É independente do saldo, da taxa e da duração: o bônus não muda conforme o valor apostado. */
function contaDano(S, h0) { if (!S.partida) return; S.partida.viag = (S.partida.viag || 0) + 1; if (S.hull < h0) S.partida.dano = (S.partida.dano || 0) + (h0 - S.hull); }
/** Intensidade (0 a 1) do desgaste da sala: pontos de casco perdidos por viagem, comparados ao esperado na galáxia mais alta da sala. */
export const intensidade = (jogs, cfg) => { const v = jogs.reduce((a, j) => a + (j?.viag || 0), 0); if (!v) return 0; const ref = 9 + 1.6 * Math.max(...cfg.galaxias); return clamp(jogs.reduce((a, j) => a + (j?.dano || 0), 0) / v / ref, 0, 1); };
export const semCasco = (S) => !!(S.partida && S.partida.casco === false);
function chegada(S, d, msgs, enc) {
  const sc = semCasco(S);
  let dmg = sc ? 0 : desgasteViagem(S, d);
  for (const e of enc || []) {
    if (!sc) dmg += e.dmg;
    if (e.w === 1) { S.credits += e.loot; S.lt = (S.lt || 0) + e.loot; mais(S, e.m ? 'mo' : 'pi'); if (/Leviat/.test(e.nm)) mais(S, 'lv'); else if (/Frota pirata/.test(e.nm)) mais(S, 'fp'); say(msgs, `${e.nm} (poder ${e.lv.toFixed(1)}) derrotados pelo seu poder de fogo ${S.wpLv.toFixed(1)}! Recompensa +${fmt(e.loot)} Cr.`, 'win'); }
    else if (e.w === 2) say(msgs, `${e.nm} (poder ${e.lv.toFixed(1)}) recuaram: luta empatada, sem saque. Escapamos${sc ? ' sem danos' : ' com avarias'}.`, 'ok');
    else {
      mais(S, 'df');
      let m = `${e.nm} (poder ${e.lv.toFixed(1)}) venceram: seu poder de fogo é ${S.wpLv.toFixed(1)}. `;
      const own = Object.keys(S.inv).filter((x) => S.inv[x].qty > 0);
      if (own.length) { const x = own[Math.random() * own.length | 0], q = Math.max(1, Math.ceil(S.inv[x].qty * e.f)); S.inv[x].qty -= q; if (S.inv[x].qty <= 0) { S.inv[x].qty = 0; S.inv[x].avg = 0; } m += `Perdeu ${q} × ${RES_ID[x].nome}. `; }
      say(msgs, m.trim(), 'err');
    }
  }
  if (sc) return;   // partida sem desgaste de casco: nada a descontar nem a reparar
  const h0 = S.hull;
  S.hull = enc?.length ? Math.max(Math.min(S.hull, 5), S.hull - dmg) : Math.max(0, S.hull - dmg);
  contaDano(S, h0);
  const rep = fixCost(S);
  if (enc?.length || dmg >= 8) say(msgs, `Casco -${dmg}% (agora ${S.hull}%).${rep ? ` Reparo: ${fmt(rep)} Cr.` : ''}`, S.hull < 50 ? 'err' : 'ok'); else note(msgs, `Casco -${dmg}% (agora ${S.hull}%).`);
  if (S.hull < 30) note(msgs, '⚠ Casco crítico: repare a nave na aba Frotas.', 'alert');
}

function desgaste(S, d, msgs) {   // saltos entre galáxias: só desgaste do casco (piratas e monstros só existem onde você os vê, no mapa)
  if (semCasco(S)) return;
  const dmg = desgasteViagem(S, d, 12), h0 = S.hull;
  S.hull = Math.max(0, S.hull - dmg);
  contaDano(S, h0);
  const rep = fixCost(S);
  if (dmg >= 8) say(msgs, `Casco -${dmg}% (agora ${S.hull}%).${rep ? ` Reparo: ${fmt(rep)} Cr.` : ''}`, 'err'); else note(msgs, `Casco -${dmg}% (agora ${S.hull}%).`);
  if (S.hull < 30) note(msgs, '⚠ Casco crítico: repare a nave na aba Frotas.', 'alert');
}

/* ---------- efeitos do tempo (chegada, dia novo): aplicados pelo servidor, nunca pelo aparelho ---------- */
export const precisaResolver = (S, now) => !!(S.trip && now >= S.trip.end) || (S.ct || []).some((x) => now > x.ate) || (!S.partida && (!S.daily || S.daily.day !== dia(now)));
export function resolver(S, c, msgs) {
  let mudou = false;
  const d = dia(c.now);
  if (!S.partida && (!S.daily || S.daily.day !== d)) {
    const y = dia(c.now - 864e5);
    S.streak = S.lastDay === y ? S.streak + 1 : 1; maxi(S, 'bk', S.streak); S.lastDay = d; S.daily = { day: d, p: { trades: 0, trips: 0, profit: 0 }, done: {} };
    const b = 100 * Math.min(S.streak, 7); S.credits += b; say(msgs, `Bônus diário: ${fmt(b)} Cr (sequência de ${S.streak} dia/s). Volte amanhã para mais!`, 'win'); mudou = true;
  }
  if (S.ct?.some((x) => c.now > x.ate)) { for (const x of S.ct.filter((x) => c.now > x.ate)) say(msgs, `Contrato expirado: ${x.q} × ${RES_ID[x.r].nome} para ${GALAXIES[x.gal].planetas.find((p) => p.id === x.dest)?.nome || x.dest}. Caução perdida (${fmt(x.cau)} Cr).`, 'err'); S.ct = S.ct.filter((x) => c.now <= x.ate); mudou = true; }
  if (S.trip && c.now >= S.trip.end) {
    const dd = dist(planeta(S, S.trip.from), planeta(S, S.trip.to)); S.loc = S.trip.to; const enc = S.trip.enc; S.trip = null; S.daily.p.trips++; mais(S, 'vi'); chegada(S, dd, msgs, enc);
    const m = planeta(S, S.loc).m, deals = Object.keys(m).filter((k) => m[k] < 1).map((k) => SHORT[k]);
    say(msgs, `Chegada em ${planeta(S, S.loc).nome}.` + (deals.length ? ` Compre barato: ${deals.join(', ')}.` : ''), 'ok'); mudou = true;
  }
  return mudou;
}
export function fechar(S, c, msgs) {   // missões e patente, sempre calculadas depois de uma ação
  MIS.forEach((m) => { if (!S.daily.done[m.k] && S.daily.p[m.k] >= m.n(S)) { S.daily.done[m.k] = 1; S.credits += m.r; mais(S, 'mi'); say(msgs, `Missão cumprida: ${m.t}! +${fmt(m.r)} Cr`, 'win'); } });
  if (S.partida) return;   // na partida a patente é a da carreira e não muda
  const w = patrimonioTotal(S, c); let k = 0; RANKS.forEach((r, i) => { if (w >= r[0]) k = i; });
  if (k > S.rank) {
    S.rank = k;
    const nu = GALAXIES.flatMap((g) => g.planetas).filter((p) => p.t === k).map((p) => p.nome).slice(0, 4).concat(RES.filter((r) => r.t === k).map((r) => r.nome));
    say(msgs, `Nova patente: ${RANKS[k][1]}! Desbloqueado: ${nu.join(', ') || '—'}.`, 'win');
  }
}

/* ---------- ações ---------- */
/* ---------- contratos de entrega: o planeta oferece 3 pedidos por janela de 20 min (determinísticos, sem estado); o jogador aceita até 3 e entrega no destino antes do prazo ---------- */
export const CT_JANELA = 20 * 60000, CT_MAX = 3;
export function ofertas(S, c) {
  if (S.partida || S.trip) return [];
  const b = Math.floor(c.now / CT_JANELA), outros = planetas(S).filter((p) => p.id !== S.loc && p.t <= S.rank), prods = RES.filter((r) => (r.t || 0) <= S.rank);
  if (!outros.length || !prods.length) return [];
    const out = [];
  for (let k = 0; k < 2; k++) {
    const h = hash(`${S.gal}:${S.loc}:${b}:${k}`), f1 = (h >>> 14) % 1000 / 1000, f2 = (h >>> 3) % 1000 / 1000;
    let dest, r;
    r = prods[h % prods.length]; dest = outros[(h >>> 7) % outros.length];
    const id = `${S.loc}:${b}:${k}`, q = clamp(Math.round(S.cap * (.25 + .5 * f1)), 1, S.cap), t = tripInfo(S, dest.id), mult = 1.05 + .13 * f2;
    out.push({ id, r: r.id, q, dest: dest.id, gal: S.gal, falta: 1, comb: t.cost, cau: Math.round(CAUCAO * q * unitDest(S, dest.id, r.id, c)), mult: Math.round(mult * 100) / 100, dur: Math.max(100 - 8 * S.gal, 50, Math.round(t.secs * Math.max(1.15, 1.6 - .05 * S.gal))) });
  }
  return out;
}
/** Preço-base do produto no destino, sem a alta temporária da escassez (a escassez já premia quem vende no mercado). */
function unitDest(S, dest, rid, c) {
  const loc = S.loc; S.loc = dest; try { return preco(S, rid, 100, c); } finally { S.loc = loc; }
}
export const CAUCAO = .1;   // caução paga ao aceitar (10% do valor); devolvida na entrega, perdida se o prazo vencer
/** Valor de entrega de n unidades: preço do destino na hora × bônus, mais 60% da parte do combustível. */
const valorContrato = (S, x, n, c) => Math.round(n * unitDest(S, x.dest, x.r, c) * x.mult + .6 * x.comb * n / x.q0);
const acoes = {
  negociar(S, c, msgs, a) {
    const r = RES_ID[a.id], lado = a.lado, n = Math.floor(Number(a.n));
    if (!r) throw new Regra('Recurso desconhecido.');
    if (lado !== 'buy' && lado !== 'sell') throw new Regra('Ordem inválida.');
    if (!(n >= 1 && n <= 100000)) throw new Regra('Quantidade inválida.');
    if ((r.t || 0) > S.rank) throw new Regra('Recurso bloqueado: suba de patente.');
    if (S.trip) throw new Regra('Nave em trânsito.');
    const s0 = stk(S, a.id, c.now), esperado = Number(a.esperado), vitrine = preco(S, a.id, s0, c);
    if (esperado > 0 && Math.abs(vitrine / esperado - 1) > .08) throw new Regra('O preço mudou. Confira o mercado e tente de novo.');
    const p = preco(S, a.id, lado === 'buy' ? s0 - n * liq(S) / 2 : s0 + n * liq(S) / 2, c) * (lado === 'buy' ? 1 : TAXA_VENDA), total = n * p, h = (S.inv[a.id] ??= { qty: 0, avg: 0 });
    if (lado === 'buy') {
      if (escasso(S, S.loc, c.now) === a.id) throw new Regra(`${r.nome} está em falta neste planeta: não há estoque para comprar. Traga de outro lugar — enquanto o contrato durar.`);
      if (n > (s0 - 1) / liq(S)) throw new Regra(`Este planeta só tem ${Math.floor((s0 - 1) / liq(S))} un. em oferta. Procure outro mercado.`);
      if (total > S.credits) throw new Regra(`Créditos insuficientes: faltam ${fmt(total - S.credits)}.`);
      if (used(S) + n > S.cap) throw new Regra(`Porão cheio (${used(S)}/${S.cap}). Venda ou faça upgrade.`);
      mais(S, 'tr'); h.avg = (h.avg * h.qty + total) / (h.qty + n); h.qty += n; S.credits -= total; setStk(S, a.id, s0 - n * liq(S), c.now);
      say(msgs, `Comprou ${n} × ${r.nome} por ${fmt(total)}.`);
    } else {
      if (n > h.qty) throw new Regra(`Você tem apenas ${h.qty} × ${r.nome}.`);
      S.daily.p.profit += Math.max(0, n * (p - h.avg)); S.lt = (S.lt || 0) + n * (p - h.avg); mais(S, 'tr'); maxi(S, 'mq', n); if (h.avg > 0 && p > h.avg) { maxi(S, 'lx', n * (p - h.avg)); maxi(S, 'mg', (p / h.avg - 1) * 100); } h.qty -= n; S.credits += total; setStk(S, a.id, s0 + n * liq(S), c.now); if (!h.qty) h.avg = 0;
      say(msgs, `Vendeu ${n} × ${r.nome} por ${fmt(total)}.`);
    }
    S.daily.p.trades++;
  },
  contratoAceitar(S, c, msgs, a) {
    if (S.partida) throw new Regra('Contratos existem só na carreira.');
    if (S.trip) throw new Regra('Nave em trânsito.');
    const o = ofertas(S, c).find((x) => x.id === a.id);
    if (!o) throw new Regra('Esta oferta não está mais disponível.');
    S.ct ??= []; S.cf ??= [];
    if (S.ct.length >= CT_MAX) throw new Regra(`Você já tem ${CT_MAX} contratos ativos.`);
    if (S.ct.some((x) => x.id === o.id) || S.cf.includes(o.id)) throw new Regra('Você já aceitou esta oferta.');
    if (o.cau > S.credits) throw new Regra(`A caução do contrato é ${fmt(o.cau)} Cr (devolvida na entrega). Créditos insuficientes.`);
    S.credits -= o.cau;
    const { dur, ...x } = o; S.ct.push({ ...x, q0: o.q, cau0: o.cau, lc: 0, de: S.loc, ate: c.now + dur * 1000 });
    say(msgs, `Contrato ATIVO: ${o.q} × ${RES_ID[o.r].nome} para ${planeta(S, o.dest).nome} em ${Math.round(dur / 60)} min. Caução de ${fmt(o.cau)} Cr (volta na entrega). Veja em Mercado › Contratos.`, 'ok');
  },
  contratoEntregar(S, c, msgs, a) {
    if (S.trip) throw new Regra('Nave em trânsito.');
    const i = (S.ct || []).findIndex((x) => x.id === a.id); if (i < 0) throw new Regra('Contrato não encontrado.');
    const x = S.ct[i];
    if (c.now > x.ate) throw new Regra('O prazo deste contrato acabou.');
    if (S.gal !== x.gal || S.loc !== x.dest) throw new Regra(`Entregue em ${GALAXIES[x.gal].planetas.find((p) => p.id === x.dest)?.nome}.`);
    const h = S.inv[x.r], n = Math.min(x.q, h?.qty || 0); if (n < 1) throw new Regra(`Você não tem ${RES_ID[x.r].nome} no porão.`);
    const pay = valorContrato(S, x, n, c), ultimo = n >= x.q, dev = ultimo ? x.cau : Math.round(x.cau0 * n / x.q0), lucro = Math.max(0, pay - n * h.avg);
    h.qty -= n; if (!h.qty) h.avg = 0; x.q -= n; x.cau -= dev; x.lc += lucro;
    S.credits += pay + dev; S.lt = (S.lt || 0) + lucro; S.daily.p.profit += lucro; mais(S, 'ctn');
    if (ultimo) {
      S.ct.splice(i, 1); (S.cf ??= []).push(x.id); if (S.cf.length > 40) S.cf.shift();
      mais(S, 'ct'); maxi(S, 'cg', x.lc); if (x.ate - c.now < 60000) mais(S, 'cz'); if (x.falta) mais(S, 'cs');
      say(msgs, `Contrato cumprido! +${fmt(pay)} Cr e caução de ${fmt(dev)} Cr devolvida.`, 'win');
    } else say(msgs, `Entregou ${n} × ${RES_ID[x.r].nome}: +${fmt(pay)} Cr. Faltam ${x.q}.`, 'win');
  },
  viajar(S, c, msgs, a) {
    const to = planeta(S, a.to);
    if (S.trip) throw new Regra('Nave em trânsito.');
    if (!to) throw new Regra('Destino desconhecido.');
    if (to.id === S.loc) throw new Regra('Você já está aqui.');
    if (to.t > S.rank) throw new Regra('Setor bloqueado: suba de patente.');
    if (S.hull < 15) throw new Regra('Casco crítico: repare a nave na aba Frotas.');
    const t = tripInfo(S, to.id);
    if (t.cost > S.credits) throw new Regra(`Combustível custa ${fmt(t.cost)} Cr. Créditos insuficientes.`);
    S.credits -= t.cost; S.trip = { from: S.loc, to: to.id, start: c.now, end: c.now + t.secs * 1000 }; const enc = viagemTutorial(S) ?? encontros(S, S.trip.start, S.trip.end); if (S.tv !== undefined && !S.partida) S.tv++; if (enc.length) { S.trip.enc = enc; S.trip.end += PAUSA; }
    say(msgs, `Rumo a ${to.nome}: ${t.secs}s, combustível ${fmt(t.cost)} Cr.`, '');
  },
  saltar(S, c, msgs, a) {
    const i = Math.floor(Number(a.i)), g = GALAXIES[i];
    if (S.trip) throw new Regra('Nave em trânsito.');
    if (!g || i === S.gal) throw new Regra('Galáxia inválida.');
    if (S.partida && !S.partida.galaxias.includes(i)) throw new Regra('Esta galáxia não faz parte da partida.');
    if (S.rank < g.t) throw new Regra(`A galáxia ${g.nome} exige a patente ${RANKS[g.t][1]}.`);
    if (S.engLv < g.eng) throw new Regra(`A galáxia ${g.nome} exige motor nv.${g.eng}.`);
    if (S.hull < 25) throw new Regra('Casco crítico: repare antes de saltar.');
    const custo = jumpCost(S, i), hop = hops(S, i);
    if (custo > S.credits) throw new Regra(`O salto custa ${fmt(custo)} Cr. Créditos insuficientes.`);
    S.credits -= custo; S.gal = i; S.loc = g.planetas[0].id; S.daily.p.trips++;
    const primeira = !S.vis[i]; S.vis[i] = 1; say(msgs, `Salto concluído: Galáxia ${g.nome}${primeira ? ' (nova!)' : ''}.`);
    if (primeira && !S.partida) { const b = 200 * i; S.credits += b; say(msgs, `Bônus de exploração: +${fmt(b)} Cr!`, 'win'); }
    desgaste(S, 120 * hop + i * 40, msgs);
  },
  melhorar(S, c, msgs, a) {
    const k = a.k;
    if (k === 'fix' || k === 'over') {
      if (semCasco(S)) throw new Regra('Esta partida não tem desgaste de casco: não há o que reparar.');
      if (k === 'fix' && S.hull >= S.maxHull) throw new Regra('O casco já está no máximo.');
      if (k === 'over' && S.maxHull >= 100) throw new Regra('A nave já está como nova.');
      const custo = k === 'fix' ? fixCost(S) : overCost(S);
      if (custo > S.credits) throw new Regra(`Faltam ${fmt(custo - S.credits)} créditos.`);
      S.credits -= custo; if (k === 'fix') { S.maxHull = Math.max(40, S.maxHull - 1); S.hull = S.maxHull; } else { S.maxHull = 100; S.hull = 100; }
      say(msgs, k === 'fix' ? 'Casco reparado.' : 'Revisão completa: nave como nova.'); return;
    }
    if (k !== 'cap' && k !== 'eng' && k !== 'wp') throw new Regra('Melhoria desconhecida.');
    const f = S.frota[S.nave], campo = { cap: 'c', eng: 'm', wp: 'a' }[k], L = f[campo];
    if (L >= NAVE_MAX) throw new Regra('Este item já está no nível máximo.');
    const custo = upCusto(NAVES[S.nave - 1], k, L);
    if (custo > S.credits) throw new Regra(`Faltam ${fmt(custo - S.credits)} créditos.`);
    S.credits -= custo; f[campo] = L + 1; recalc(S);
    say(msgs, 'Upgrade instalado!');
  },
  comprarNave(S, c, msgs, a) {
    const i = Math.floor(Number(a.i)), n = NAVES[i - 1];
    if (S.partida) throw new Regra('Não dá para trocar de nave durante uma partida.');
    if (!n) throw new Regra('Nave desconhecida.');
    if (S.frota[i]) throw new Regra('Você já tem esta nave.');
    if (S.rank < n.rank) throw new Regra(`A nave ${n.nome} exige a patente ${RANKS[n.rank][1]}.`);
    if (n.preco > S.credits) throw new Regra(`A nave custa ${fmt(n.preco)} Cr. Faltam ${fmt(n.preco - S.credits)}.`);
    S.credits -= n.preco; S.frota[i] = { c: 1, m: 1, a: 1, h: 100, mh: 100 };
    say(msgs, `Nave ${n.nome} adquirida! Equipe-a na aba Frotas.`, 'win');
  },
  equipar(S, c, msgs, a) {
    const i = Math.floor(Number(a.i)), n = NAVES[i - 1];
    if (S.partida) throw new Regra('Não dá para trocar de nave durante uma partida.');
    if (S.trip) throw new Regra('Nave em trânsito.');
    if (!n || !S.frota[i]) throw new Regra('Você não tem esta nave.');
    if (i === S.nave) throw new Regra('Esta nave já está equipada.');
    const f = S.frota[i], cap = capDe(n, f.c);
    if (used(S) > cap) throw new Regra(`Sua carga (${used(S)}) não cabe na ${n.nome} (porão ${cap}). Venda parte dela antes.`);
    Object.assign(S.frota[S.nave], { h: S.hull, mh: S.maxHull });   // cada nave guarda o próprio casco
    S.nave = i; S.hull = f.h; S.maxHull = f.mh; recalc(S);
    say(msgs, `Nave ${n.nome} equipada.`);
  },
};
export function executar(S, c, msgs, nome, args) {
  const f = acoes[nome]; if (!f) throw new Regra('Ação desconhecida.', 404);
  if (S.partida && c.now >= S.partida.fim) throw new Regra('A partida acabou.', 410);
  if (c.now - (S.ult || 0) < 80) throw new Regra('Devagar, comandante.', 429);   // limite de ritmo por conta
  f(S, c, msgs, args || {}); S.ult = c.now;
}


/* ================= PARTIDAS (torneio e convite entre amigos) ================= */
export const DURACOES = [10, 15, 20, 30, 45, 60], TAXAS = [500, 1000, 2500, 5000, 10000], DIFICULDADES = ['facil', 'normal', 'dificil'];
export const desbloqueada = (carr, i) => !!GALAXIES[i] && carr.rank >= GALAXIES[i].t && carr.engLv >= GALAXIES[i].eng;
const inteiro = (v, a, b, msg) => { const n = Math.floor(Number(v)); if (!(n >= a && n <= b)) throw new Regra(msg); return n; };

/** Valida as opções escolhidas pelo criador. Só galáxias que ELE desbloqueou podem entrar na partida. */
export function validarCfg(cfg, carr, modo) {
  cfg = cfg && typeof cfg === 'object' ? cfg : {};
  if (modo !== 'torneio' && modo !== 'amigos') throw new Regra('Modo de partida inválido.');
  const duracao = Number(cfg.duracao); if (!DURACOES.includes(duracao)) throw new Regra('Duração inválida.');
  const saldo = inteiro(cfg.saldo, 2000, 10000, 'O saldo inicial vai de 2.000 a 10.000.');
  const gals = [...new Set((Array.isArray(cfg.galaxias) ? cfg.galaxias : []).map(Number))].sort((a, b) => a - b);
  if (!gals.length || gals.length > GALAXIES.length) throw new Regra('Escolha ao menos uma galáxia.');
  for (const g of gals) { if (!Number.isInteger(g) || !GALAXIES[g]) throw new Regra('Galáxia inválida.'); if (!desbloqueada(carr, g)) throw new Regra(`Você ainda não desbloqueou a galáxia ${GALAXIES[g].nome}.`); }
  const jogadores = inteiro(cfg.jogadores, 2, 8, 'A partida comporta de 2 a 8 jogadores.');
  const dific = DIFICULDADES.includes(cfg.dific) ? cfg.dific : 'normal';
  let taxa = 0;
  if (modo === 'torneio') { taxa = Math.floor(Number(cfg.taxa)); if (!TAXAS.includes(taxa)) throw new Regra('Taxa de entrada inválida.'); }
  return { duracao, saldo, galaxias: gals, jogadores, bots: !!cfg.bots, dific, taxa, eventos: cfg.eventos !== false, piratas: modo === 'torneio' ? true : cfg.piratas !== false, casco: cfg.casco !== false };   // torneio: piratas e monstros sempre ligados
}

/** Estado inicial de um jogador na partida: nave da carreira (porão, motor, armamento e patente), saldo igual para todos. */
export function novoPartida(carr, cfg, codigo, now, fim) {
  const S = novo(now), g0 = cfg.galaxias[0]; delete S.tv;   // o roteiro do tutorial vale só para a carreira
  S.credits = cfg.saldo; S.rank = carr.rank; S.nave = carr.nave; S.frota = { [carr.nave]: { ...carr.frota[carr.nave], h: 100, mh: 100 } }; recalc(S);
  S.gal = g0; S.loc = GALAXIES[g0].planetas[0].id; S.vis = { [g0]: 1 };
  S.daily = { day: 'partida', p: { trades: 0, trips: 0, profit: 0 }, done: { trades: 1, trips: 1, profit: 1 } };
  S.partida = { codigo, inicio: now, fim, galaxias: cfg.galaxias, eventos: cfg.eventos, piratas: cfg.piratas, casco: cfg.casco !== false };
  return S;
}
/** Patrimônio do jogador no instante do fim (créditos + carga avaliada com os preços daquele instante). */
export const valorFinal = (S, feed) => patrimonio(S, { now: S.partida.fim, feed });

/* ---------- bots: curva de patrimônio determinística (não precisam de estado nem de ações) ---------- */
export const NOMES_BOT = ['Vega Prime', 'Capitão Zen', 'Nova-7', 'Dr. Quasar', 'Lyra-Bot', 'Orion-X', 'Kappa Rex', 'Sirius Jr.'];
export const botNome = (codigo, i) => NOMES_BOT[(hash(codigo) + i) % NOMES_BOT.length] + (i >= NOMES_BOT.length ? ' ' + i : '');
const GBOT = { facil: 0.35, normal: 0.7, dificil: 1.1 };   // fração do ritmo de referência de um jogador esperto (calibrado por simulação)
export const ritmoReferencia = (cfg) => cfg.saldo * 0.02 * cfg.duracao;   // ganho de um bot 'difícil' médio ≈ 2% do saldo por minuto (valor ajustável: ainda não calibrado com jogadores reais)
export function botPatrimonio(cfg, codigo, i, t, inicio, fim) {
  const tau = clamp((t - inicio) / (fim - inicio), 0, 1), h = hash(codigo + ':bot' + i), hab = .8 + (h % 1000) / 2500;   // habilidade 0,8 a 1,2
  const fr = clamp(.55 + .09 * (cfg.rb || 0), .55, 1.2);   // bots acompanham a patente média dos humanos da sala (novatos enfrentam bots mais fracos)
  const ganho = ritmoReferencia(cfg) * GBOT[cfg.dific] * fr * hab * Math.pow(tau, .9);
  const ruido = (vnoise(codigo + 'b' + i, tau * 9) * .05 + vnoise(codigo + 'c' + i, tau * 31) * .02) * cfg.saldo * Math.min(1, tau * 4);
  return Math.max(cfg.saldo * .5, cfg.saldo + ganho + ruido);
}

/** Premiação do torneio. humanos: [{usuario, geral}] ordenados por colocação; total: participantes (humanos + bots); x (0 a 1): desgaste médio da sala.
 *  Bolo = soma das taxas dos humanos: 2 humanos → vencedor leva tudo; 3 ou mais → 60/30/10.
 *  Sozinho contra bots: recupera a taxa se terminar na metade de cima; se for 1º, ganha bônus conforme a dificuldade (bots contam só na colocação).
 *  Com reparo de casco (padrão), 3 ou mais pilotos: quanto maior o desgaste da sala, mais o 1º leva, tirado do 2º e do 3º (até 70/22/8) — o total pago nunca passa do bolo.
 *  Sem casco: 10% do bolo (ou do prêmio, se estiver sozinho) é retido como taxa de sala, então desligar o reparo nunca compensa mais do que mantê-lo. */
export function premiacao(humanos, total, cfg, x = 0) {
  const taxa = cfg.taxa, premios = new Map();
  if (!taxa || !humanos.length) return premios;
  const f = cfg.casco === false ? .9 : 1, bolo = humanos.length * taxa * f, k = cfg.casco === false ? 0 : clamp(x, 0, 1);
  if (humanos.length === 1) {
    const h = humanos[0];
    if (h.geral <= Math.ceil(total / 2)) premios.set(h.usuario, Math.round((taxa + (h.geral === 1 ? Math.round(taxa * ({ facil: 0, normal: .25, dificil: .5 }[cfg.dific] || 0)) : 0)) * f));
  } else if (humanos.length === 2) premios.set(humanos[0].usuario, Math.round(bolo));
  else [.6 + .1 * k, .3 - .08 * k, .1 - .02 * k].forEach((p, i) => { if (humanos[i]) premios.set(humanos[i].usuario, Math.round(bolo * p)); });
  return premios;
}
