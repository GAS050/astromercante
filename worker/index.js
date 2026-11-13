// Worker do ASTROMERCANTE: busca os preços reais a cada 5 min (Cron) e guarda no KV.
// Os jogadores só leem o cache, então o número de chamadas às APIs não depende de quantos jogam.
const CG = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,pax-gold,ethereum&vs_currencies=usd&include_24hr_change=true';
const FX = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';
import { Regra, novo, normalizar, migrar, resolver, precisaResolver, fechar, executar, patrimonio, patrimonioTotal, RANKS, validarCfg, novoPartida, valorFinal, botPatrimonio, botNome, premiacao, desbloqueada, intensidade } from './motor.js';
import { GALAXIES } from './dados.js';
const STALE_MS = 30 * 60 * 1000;

const json = (r) => (r.ok ? r.json() : Promise.reject(r.status));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? +n.toFixed(4) : null; };

async function refresh(env) {
  const prev = JSON.parse((await env.PRECOS.get('latest')) || '{}');
  const next = { ...prev };
  const [cg, fx] = await Promise.allSettled([
    fetch(CG, { headers: env.COINGECKO_KEY ? { 'x-cg-demo-api-key': env.COINGECKO_KEY } : {} }).then(json),
    fetch(FX).then(json),
  ]);
  if (cg.status === 'fulfilled') {
    const d = cg.value;
    [['btc', d.bitcoin], ['gold', d['pax-gold']], ['eth', d.ethereum]].forEach(([k, v]) => { const n = num(v?.usd_24h_change); if (n !== null) next[k] = n; });
  }
  if (fx.status === 'fulfilled') { const n = num(fx.value?.USDBRL?.pctChange); if (n !== null) next.fx = n; }
  // só grava se algo novo chegou; se as APIs falharem, o último valor bom continua valendo
  if (cg.status === 'fulfilled' || fx.status === 'fulfilled') { next.ant = {}; ['btc', 'gold', 'eth', 'fx'].forEach((k) => { if (prev[k] != null) next.ant[k] = prev[k]; }); next.updated = Date.now(); await env.PRECOS.put('latest', JSON.stringify(next)); }
  return next;
}

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const aleatorio = (n = 32) => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[+/=]/g, '');
const sha = async (s) => b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function derivar(senha, salt, it) {   // PBKDF2-SHA256; o runtime dos Workers aceita no máximo 100.000 iterações
  const k = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, k, 256));
}
const iguais = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
// 50.000 iterações cabem melhor nos 10 ms de CPU do plano gratuito; o valor fica gravado em cada hash,
// então dá para subir (PBKDF2_ITER=100000 no plano pago) sem invalidar contas existentes.
const hashSenha = async (senha, env) => { const it = Math.min(100000, Number(env.PBKDF2_ITER) || 50000), salt = crypto.getRandomValues(new Uint8Array(16)); return `${b64(salt)}$${await derivar(senha, salt, it)}$${it}`; };
const confere = async (senha, guardado) => { const [s, h, it] = guardado.split('$'); return iguais(await derivar(senha, Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), Number(it) || 100000), h); };

const DIA = 86400000, MAX_SAVE = 300000;
class Erro extends Error { constructor(status, msg, extra = {}) { super(msg); this.status = status; this.extra = extra; } }

async function criarSessao(env, usuario) {
  const token = aleatorio(32);
  await env.DB.prepare('DELETE FROM sessoes WHERE expira < ?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO sessoes (hash, usuario, expira) VALUES (?, ?, ?)').bind(await sha(token), usuario, Date.now() + 30 * DIA).run();
  return token;
}
async function autenticar(req, env) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const s = t && await env.DB.prepare('SELECT s.usuario AS id, u.nome FROM sessoes s JOIN usuarios u ON u.id = s.usuario WHERE s.hash = ? AND s.expira > ?').bind(await sha(t), Date.now()).first();
  if (!s) throw new Erro(401, 'Sessão expirada. Entre novamente.');
  return { ...s, hash: await sha(t) };
}
const lerSave = (env, id) => env.DB.prepare('SELECT estado, patrimonio, atualizado FROM saves WHERE usuario = ?').bind(id).first();
/* ---------- jogo: o servidor é dono do estado. O aparelho só pede ações; nada do que ele envia vira saldo, item ou posição. ---------- */
let feedCache = { t: 0, d: null };
async function feedAtual(env) {
  if (Date.now() - feedCache.t < 30000 && feedCache.d) return feedCache.d;
  const d = JSON.parse((await env.PRECOS.get('latest')) || 'null') || {};
  feedCache = { t: Date.now(), d: { change: { btc: d.btc, gold: d.gold, eth: d.eth, fx: d.fx }, ant: d.ant || {}, feedAt: Number(d.updated) || 0 } };
  return feedCache.d;
}
async function gravarJogo(env, id, S, c, base) {   // compare-and-swap: só grava se ninguém mudou a conta nesse meio-tempo
  const estado = JSON.stringify(S), t = Math.max(Date.now(), (Number(base) || 0) + 1), pat = patrimonioTotal(S, c);
  const r = base
    ? await env.DB.prepare('UPDATE saves SET estado = ?, patrimonio = ?, atualizado = ? WHERE usuario = ? AND atualizado = ?').bind(estado, pat, t, id, Number(base)).run()
    : await env.DB.prepare('INSERT INTO saves (usuario, estado, patrimonio, atualizado) VALUES (?, ?, ?, ?) ON CONFLICT(usuario) DO NOTHING').bind(id, estado, pat, t).run();
  return (r.meta?.changes ?? 0) > 0 ? t : 0;
}
const publico = ({ ult, ...S }) => S;
/* ---------- ranking global: patrimônio gravado pelo servidor em cada ação (o aparelho não consegue alterá-lo) ---------- */
let rankCache = { t: 0, top: [], total: 0 };
const apelido = (nome, google, ap) => ap || (google ? 'Piloto' + (String(nome).match(/\d{3,5}$/)?.[0] || '') : nome);   // contas Google antigas tinham parte do e-mail no nome: não expõe
/* ---------- rankings por período (semana e mês, horário de Brasília) e amigos ---------- */
const TZ_OFF = 3 * 3600e3;   // Brasil (sem horário de verão)
function periodos(agora = Date.now()) {
  const l = new Date(agora - TZ_OFF), y = l.getUTCFullYear(), mo = l.getUTCMonth(), d = l.getUTCDate(), dow = (l.getUTCDay() + 6) % 7;
  const dia = Date.UTC(y, mo, d) + TZ_OFF, si = dia - dow * 864e5, mi = Date.UTC(y, mo, 1) + TZ_OFF;
  return { semana: { id: 'S' + new Date(si - TZ_OFF).toISOString().slice(0, 10), ini: si, fim: si + 7 * 864e5 }, mes: { id: 'M' + y + '-' + String(mo + 1).padStart(2, '0'), ini: mi, fim: Date.UTC(y, mo + 1, 1) + TZ_OFF } };
}
const baseVista = new Map();
/** Guarda o patrimônio do jogador no começo de cada período: é o valor gravado antes da 1ª ação do período (o ganho é patrimônio atual menos esse valor). */
async function garantirBase(env, id) {
  const P = periodos(), chave = P.semana.id + P.mes.id; if (baseVista.get(id) === chave) return;
  for (const p of [P.semana, P.mes]) await env.DB.prepare('INSERT OR IGNORE INTO rank_base (periodo, usuario, base) SELECT ?, usuario, patrimonio FROM saves WHERE usuario = ?').bind(p.id, id).run();
  if (baseVista.size > 5000) baseVista.clear(); baseVista.set(id, chave);
}
const GANHO = 'CASE WHEN b.base IS NOT NULL THEN s.patrimonio - b.base WHEN u.criado >= ? THEN s.patrimonio - 10000 ELSE 0 END';   // 1º ? = início do período
const rkPer = { semana: { t: 0 }, mes: { t: 0 } };
async function rankingPeriodo(env, id, tipo) {
  const per = periodos()[tipo], ini = per.ini;
  const FROM = 'FROM saves s JOIN usuarios u ON u.id = s.usuario LEFT JOIN perfis p ON p.usuario = u.id LEFT JOIN rank_base b ON b.usuario = u.id AND b.periodo = ?';
  const c = rkPer[tipo];
  if (c.per !== per.id || Date.now() - c.t > 30000) {
    const r = await env.DB.prepare(`SELECT u.nome AS nome, u.google AS google, p.apelido AS ap, p.avatar AS av, ${GANHO} AS w ${FROM} WHERE ${GANHO} > 0 ORDER BY w DESC, u.id ASC LIMIT 10`).bind(ini, per.id, ini).all();
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n ${FROM} WHERE ${GANHO} > 0`).bind(per.id, ini).first();
    rkPer[tipo] = { t: Date.now(), per: per.id, top: r.results.map((x) => ({ n: apelido(x.nome, x.google, x.ap), a: x.av || 'a1', w: Math.round(x.w * 100) / 100 })), total: n.n };
  }
  const eu = await env.DB.prepare(`SELECT u.nome AS nome, u.google AS google, p.apelido AS ap, p.avatar AS av, ${GANHO} AS w ${FROM} WHERE s.usuario = ?`).bind(ini, per.id, id).first();
  let pos = null; if (eu && eu.w > 0) pos = (await env.DB.prepare(`SELECT COUNT(*) AS n ${FROM} WHERE ${GANHO} > ?`).bind(per.id, ini, eu.w).first()).n + 1;
  const k = rkPer[tipo];
  return { tipo, top: k.top, total: k.total, fim: per.fim, eu: eu ? { pos, w: Math.round(eu.w * 100) / 100, n: apelido(eu.nome, eu.google, eu.ap), a: eu.av || 'a1' } : null };
}
const amigosDe = async (env, id) => ((await env.DB.prepare("SELECT a, b FROM amigos WHERE estado = 'aceito' AND (a = ? OR b = ?)").bind(id, id).all()).results || []).map((r) => (r.a === id ? r.b : r.a));
async function rankingAmigos(env, id, q) {
  const ids = [id, ...(await amigosDe(env, id))], per = q === 'semana' || q === 'mes' ? periodos()[q] : null, ph = ids.map(() => '?').join(',');
  const val = per ? GANHO : 's.patrimonio';
  const r = await env.DB.prepare(`SELECT u.id AS id, u.nome AS nome, u.google AS google, p.apelido AS ap, p.avatar AS av, ${val} AS w FROM usuarios u LEFT JOIN saves s ON s.usuario = u.id LEFT JOIN perfis p ON p.usuario = u.id LEFT JOIN rank_base b ON b.usuario = u.id AND b.periodo = ? WHERE u.id IN (${ph})`).bind(...(per ? [per.ini, per.id] : [null]), ...ids).all();
  const lista = (r.results || []).map((x) => ({ n: apelido(x.nome, x.google, x.ap), a: x.av || 'a1', w: Math.round((x.w || 0) * 100) / 100, eu: x.id === id ? 1 : 0 })).sort((x, y) => y.w - x.w);
  return { tipo: 'amigos', q: per ? q : 'total', lista, fim: per ? per.fim : 0, amigos: ids.length - 1 };
}
const quemInfo = async (env, ids) => {
  if (!ids.length) return {};
  const r = await env.DB.prepare(`SELECT u.id AS id, u.nome AS nome, u.google AS google, p.apelido AS ap, p.avatar AS av, p.moldura AS mo, s.patrimonio AS w FROM usuarios u LEFT JOIN perfis p ON p.usuario = u.id LEFT JOIN saves s ON s.usuario = u.id WHERE u.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  return Object.fromEntries((r.results || []).map((x) => [x.id, { id: x.id, n: apelido(x.nome, x.google, x.ap), a: x.av || 'a1', m: x.mo || '', w: Math.round((x.w || 0) * 100) / 100 }]));
};
async function amigosVer(env, id) {
  const rows = (await env.DB.prepare('SELECT a, b, estado, quem FROM amigos WHERE a = ? OR b = ?').bind(id, id).all()).results || [], outro = (r) => (r.a === id ? r.b : r.a), info = await quemInfo(env, rows.map(outro));
  const pega = (f) => rows.filter(f).map((r) => info[outro(r)]).filter(Boolean);
  return { meuId: id, amigos: pega((r) => r.estado === 'aceito').sort((x, y) => y.w - x.w), recebidos: pega((r) => r.estado === 'pendente' && r.quem !== id), enviados: pega((r) => r.estado === 'pendente' && r.quem === id) };
}
async function amigosPedir(env, id, corpo) {
  let alvo = 0; const raw = String(corpo.apelido || '').trim();
  if (corpo.id !== undefined && corpo.id !== '') alvo = Number(String(corpo.id).replace(/\D/g, ''));
  else if (raw.startsWith('#')) alvo = Number(raw.slice(1).replace(/\D/g, ''));
  else if (raw) { alvo = (await env.DB.prepare('SELECT usuario FROM perfis WHERE apelido = ? AND faixa IS NOT NULL').bind(raw).first())?.usuario || 0; if (!alvo && /^\d+$/.test(raw)) alvo = Number(raw); }
  const ok = alvo && (await env.DB.prepare('SELECT 1 AS x FROM perfis WHERE usuario = ? AND apelido IS NOT NULL AND faixa IS NOT NULL').bind(alvo).first());
  if (!ok) throw new Erro(404, 'Piloto não encontrado.');
  if (alvo === id) throw new Erro(400, 'Você não pode adicionar a si mesmo.');
  const [a, b] = id < alvo ? [id, alvo] : [alvo, id], ex = await env.DB.prepare('SELECT estado, quem FROM amigos WHERE a = ? AND b = ?').bind(a, b).first(), agora = Date.now();
  if (ex) {
    if (ex.estado === 'aceito') throw new Erro(409, 'Vocês já são amigos.');
    if (ex.quem === id) throw new Erro(409, 'O pedido já foi enviado. Aguarde a resposta.');
    await env.DB.prepare("UPDATE amigos SET estado = 'aceito' WHERE a = ? AND b = ?").bind(a, b).run();   // ele já tinha pedido: viram amigos
    return await amigosVer(env, id);
  }
  const dia = await env.DB.prepare('SELECT COUNT(*) AS n FROM amigos WHERE quem = ? AND criado > ?').bind(id, agora - 864e5).first(), pend = await env.DB.prepare("SELECT COUNT(*) AS n FROM amigos WHERE quem = ? AND estado = 'pendente'").bind(id).first(), tot = (await amigosDe(env, id)).length;
  if (dia.n >= 20) throw new Erro(429, 'Muitos pedidos hoje. Tente de novo amanhã.');
  if (pend.n >= 30) throw new Erro(429, 'Você já tem muitos pedidos pendentes.');
  if (tot >= 100) throw new Erro(400, 'Limite de 100 amigos atingido.');
  await env.DB.prepare("INSERT INTO amigos (a, b, estado, quem, criado) VALUES (?, ?, 'pendente', ?, ?)").bind(a, b, id, agora).run();
  return await amigosVer(env, id);
}
async function amigosResponder(env, id, corpo) {
  const o = Number(corpo.id), [a, b] = id < o ? [id, o] : [o, id], r = await env.DB.prepare("SELECT quem FROM amigos WHERE a = ? AND b = ? AND estado = 'pendente'").bind(a, b).first();
  if (!r || r.quem === id) throw new Erro(404, 'Pedido não encontrado.');
  if (corpo.aceitar) {
    if ((await amigosDe(env, id)).length >= 100) throw new Erro(400, 'Limite de 100 amigos atingido.');
    await env.DB.prepare("UPDATE amigos SET estado = 'aceito' WHERE a = ? AND b = ?").bind(a, b).run();
  } else await env.DB.prepare('DELETE FROM amigos WHERE a = ? AND b = ?').bind(a, b).run();
  return await amigosVer(env, id);
}
async function amigosRemover(env, id, corpo) {
  const o = Number(corpo.id), [a, b] = id < o ? [id, o] : [o, id]; await env.DB.prepare('DELETE FROM amigos WHERE a = ? AND b = ?').bind(a, b).run(); return await amigosVer(env, id);
}
async function ranking(env, id) {
  if (Date.now() - rankCache.t > 30000) {
    const r = await env.DB.prepare('SELECT u.nome AS nome, u.google AS google, p.apelido AS ap, p.avatar AS av, s.patrimonio AS w FROM saves s JOIN usuarios u ON u.id = s.usuario LEFT JOIN perfis p ON p.usuario = u.id ORDER BY s.patrimonio DESC, s.usuario ASC LIMIT 10').all();
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first();
    rankCache = { t: Date.now(), top: r.results.map((x) => ({ n: apelido(x.nome, x.google, x.ap), a: x.av || 'a1', w: Math.round(x.w * 100) / 100 })), total: c.n };
  }
  const eu = await env.DB.prepare('SELECT s.patrimonio AS w, u.nome AS nome, u.google AS google, p.apelido AS ap, p.avatar AS av, (SELECT COUNT(*) FROM saves x WHERE x.patrimonio > s.patrimonio) + 1 AS pos FROM saves s JOIN usuarios u ON u.id = s.usuario LEFT JOIN perfis p ON p.usuario = u.id WHERE s.usuario = ?').bind(id).first();
  let top = rankCache.top;   // a lista é guardada por 30 s, mas a linha do próprio jogador é sempre a atual
  if (eu) { const n = apelido(eu.nome, eu.google, eu.ap), w = Math.round(eu.w * 100) / 100; if (top.some((x) => x.n === n)) top = top.map((x) => (x.n === n ? { ...x, w } : x)).sort((x, y) => y.w - x.w); }
  return { top, total: rankCache.total, eu: eu ? { pos: eu.pos, w: Math.round(eu.w * 100) / 100, n: apelido(eu.nome, eu.google, eu.ap), a: eu.av || 'a1' } : null };
}
async function carregarJogo(env, id, now) {
  const row = await lerSave(env, id); let S = row ? JSON.parse(row.estado) : null;
  if (!S) S = novo(now);
  else if (S.v === 2) migrar(S);                 // conta anterior às naves: vira a Nave 1
  else if (S.v !== 3) S = normalizar(S, now);   // progresso antigo (do aparelho) é aproveitado, mas revalidado
  return { row, S };
}
async function jogo(env, id, nome, args) {
  await garantirBase(env, id);
  for (let i = 0; i < 5; i++) {
    const now = Date.now(), c = { now, feed: await feedAtual(env) }, { row, S } = await carregarJogo(env, id, now), msgs = [];
    let base = row ? row.atualizado : 0, mudou = !row || (row && JSON.parse(row.estado).v !== 3);
    if (resolver(S, c, msgs)) mudou = true;   // chegada e dia novo valem ANTES da ação e são gravados na hora (o sorteio não pode ser descartado)
    if (mudou) { fechar(S, c, msgs); base = await gravarJogo(env, id, S, c, base); if (!base) continue; if (!nome) return resposta(S, c, msgs, base); }
    else if (!nome) return null;
    try { executar(S, c, msgs, nome, args); fechar(S, c, msgs); }
    catch (e) { if (e instanceof Regra) throw new Erro(e.status, e.message, { msgs }); throw e; }
    const v = await gravarJogo(env, id, S, c, base); if (!v) continue;
    return resposta(S, c, msgs, v);
  }
  throw new Erro(503, 'Servidor ocupado. Tente de novo.');
}
const resposta = (S, c, msgs, v) => ({ estado: publico(S), v, agora: c.now, feed: c.feed, msgs });
async function jogoLer(env, id, url) {
  const now = Date.now(), row = await lerSave(env, id), v = Number(url.searchParams.get('v'));
  if (row && JSON.parse(row.estado).v === 3) {
    const S = JSON.parse(row.estado);
    if (!precisaResolver(S, now)) {
      if (v && v === row.atualizado) return { igual: true, agora: now };
      return { estado: publico(S), v: row.atualizado, agora: now, feed: await feedAtual(env), msgs: [] };
    }
  }
  return (await jogo(env, id, null)) || { igual: true, agora: now };
}
async function limite(env, chaves) {
  const q = await env.DB.prepare(`SELECT COUNT(*) AS n FROM falhas WHERE chave IN (${chaves.map(() => '?').join(',')}) AND quando > ?`).bind(...chaves, Date.now() - 15 * 60000).first();
  if (q.n >= 8) throw new Erro(429, 'Muitas tentativas. Aguarde 15 minutos.');
}

const DESCARTAVEIS = new Set('mailinator.com guerrillamail.com guerrillamailblock.com sharklasers.com grr.la 10minutemail.com tempmail.com temp-mail.org tempail.com yopmail.com trashmail.com getnada.com dispostable.com maildrop.cc fakeinbox.com throwawaymail.com mintemail.com mohmal.com emailondeck.com burnermail.io mailnesia.com spamgourmet.com moakt.com tmpmail.org discard.email mytemp.email inboxkitten.com tempinbox.com mailcatch.com trbvm.com'.split(' '));
// e-mail em forma única: minúsculas; no Gmail, ignora pontos e +apelido (evita várias contas do mesmo endereço)
function normEmail(bruto, tolerante = false, google = false) {
  const e = String(bruto || '').trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120) { if (tolerante) return e; throw new Erro(400, 'Digite um e-mail válido.'); }
  let [l, d] = e.split('@'); if (d === 'googlemail.com') d = 'gmail.com';
  if (d === 'gmail.com') l = l.split('+')[0].replace(/\./g, '');
  if (!google && DESCARTAVEIS.has(d)) throw new Erro(400, 'Use um e-mail permanente (e-mails temporários não são aceitos).');
  return l + '@' + d;
}
async function enviar(env, para, assunto, texto, responderPara) {
  if (env.MAILER) return env.MAILER(para, assunto, texto, responderPara);                 // gancho para testes
  if (!env.BREVO_KEY || !env.EMAIL_REMETENTE) throw new Erro(503, 'Envio de e-mail não configurado.');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': env.BREVO_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: 'ASTROMERCANTE', email: env.EMAIL_REMETENTE }, to: [{ email: para }], ...(responderPara ? { replyTo: { email: responderPara } } : {}), subject: assunto, textContent: texto }) });
  if (!r.ok) throw new Erro(502, 'Não foi possível enviar o e-mail agora. Tente de novo em instantes.');
}
const gerarCodigo = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
async function enviarCodigo(env, email, tipo) {
  const ult = await env.DB.prepare('SELECT enviado FROM codigos WHERE email = ? AND tipo = ?').bind(email, tipo).first();
  if (ult && Date.now() - ult.enviado < 60000) throw new Erro(429, 'Aguarde 1 minuto para pedir outro código.');
  const cod = gerarCodigo();
  await env.DB.prepare('INSERT INTO codigos (email, tipo, hash, expira, tentativas, enviado) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT(email, tipo) DO UPDATE SET hash = excluded.hash, expira = excluded.expira, tentativas = 0, enviado = excluded.enviado')
    .bind(email, tipo, await sha(`${email}:${tipo}:${cod}`), Date.now() + 15 * 60000, Date.now()).run();
  await enviar(env, email, tipo === 'confirmar' ? 'Seu código de confirmação do ASTROMERCANTE' : 'Redefinir sua senha do ASTROMERCANTE',
    `Seu código é ${cod}. Ele vale por 15 minutos.\n\nSe você não pediu isso, ignore esta mensagem.`);
}
async function conferirCodigo(env, email, tipo, cod) {
  const c = await env.DB.prepare('SELECT hash, expira, tentativas FROM codigos WHERE email = ? AND tipo = ?').bind(email, tipo).first();
  if (!c || c.expira < Date.now() || c.tentativas >= 5) throw new Erro(400, 'Código expirado. Peça um novo.');
  if (!iguais(c.hash, await sha(`${email}:${tipo}:${String(cod || '').trim()}`))) {
    await env.DB.prepare('UPDATE codigos SET tentativas = tentativas + 1 WHERE email = ? AND tipo = ?').bind(email, tipo).run(); throw new Erro(400, 'Código incorreto.');
  }
  await env.DB.prepare('DELETE FROM codigos WHERE email = ? AND tipo = ?').bind(email, tipo).run();
}
async function humano(env, req, token) {   // Cloudflare Turnstile (anti-robô); só exige se o segredo estiver configurado
  if (!env.TURNSTILE_SECRET) return;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token || ''), remoteip: req.headers.get('CF-Connecting-IP') || '' }) });
  if (!(await r.json().catch(() => ({}))).success) throw new Erro(400, 'Confirme que você não é um robô.');
}
async function apagarUsuario(env, id) {
  const u = await env.DB.prepare('SELECT email FROM usuarios WHERE id = ?').bind(id).first();
  await perfisInit(env);
  for (const t of ['saves', 'sessoes', 'partida_jog', 'perfis', 'loja_itens', 'chamados', 'rank_base']) await env.DB.prepare(`DELETE FROM ${t} WHERE usuario = ?`).bind(id).run();
  if (u && u.email) await env.DB.prepare('DELETE FROM codigos WHERE email = ?').bind(u.email).run();
  await env.DB.prepare('DELETE FROM amigos WHERE a = ? OR b = ?').bind(id, id).run();
  await env.DB.prepare('DELETE FROM usuarios WHERE id = ?').bind(id).run();
}
async function limparPendentes(env) {   // cadastros nunca confirmados somem em 24 h
  const velhos = await env.DB.prepare('SELECT id FROM usuarios WHERE verificado = 0 AND criado < ?').bind(Date.now() - DIA).all();
  for (const v of velhos.results || []) await apagarUsuario(env, v.id);
  await env.DB.prepare('DELETE FROM falhas WHERE quando < ?').bind(Date.now() - DIA).run();
}


/* ================= PARTIDAS: torneio (com taxa e prêmio) e convite entre amigos ================= */
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ESPERA_MAX = 2 * 3600e3;
const codigoNovo = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALFA[b % ALFA.length]).join('');
/** Soma/subtrai créditos da CARREIRA com a mesma trava otimista das ações (taxa de entrada, reembolso, prêmio). */
async function ajustarCreditos(env, id, delta, falta = 'Créditos insuficientes na carreira para pagar a taxa de entrada.') {
  await garantirBase(env, id);
  for (let i = 0; i < 6; i++) {
    const now = Date.now(), c = { now, feed: await feedAtual(env) }, { row, S } = await carregarJogo(env, id, now), msgs = [];
    resolver(S, c, msgs); fechar(S, c, msgs);
    if (S.credits + delta < 0) throw new Erro(402, falta);
    S.credits += delta; fechar(S, c, msgs);
    if (await gravarJogo(env, id, S, c, row ? row.atualizado : 0)) return;
  }
  throw new Erro(503, 'Servidor ocupado. Tente de novo.');
}
const pj = (env, cod, id) => env.DB.prepare('SELECT * FROM partida_jog WHERE codigo = ? AND usuario = ?').bind(cod, id).first();
async function ativa(env, id) {   // partida em espera/andamento do jogador, ou a última terminada (para mostrar o resultado)
  return await env.DB.prepare("SELECT p.* FROM partida_jog j JOIN partidas p ON p.codigo = j.codigo WHERE j.usuario = ? AND p.estado IN ('espera','andamento') ORDER BY j.entrou DESC LIMIT 1").bind(id).first();
}
async function nomes(env, cod) {
  const r = await env.DB.prepare('SELECT j.usuario AS id, j.patrimonio AS w, j.premio AS premio, u.nome AS nome, u.google AS google, p.apelido AS ap, p.avatar AS av FROM partida_jog j JOIN usuarios u ON u.id = j.usuario LEFT JOIN perfis p ON p.usuario = u.id WHERE j.codigo = ? ORDER BY j.entrou').bind(cod).all();
  return r.results || [];
}
async function reembolsarTodos(env, p, estadoFinal) {
  const ok = await env.DB.prepare('UPDATE partidas SET estado = ? WHERE codigo = ? AND estado = ?').bind(estadoFinal, p.codigo, 'espera').run();
  if (!(ok.meta?.changes > 0)) return;
  const js = (await env.DB.prepare('SELECT usuario, taxa FROM partida_jog WHERE codigo = ?').bind(p.codigo).all()).results || [];
  for (const j of js) { if (j.taxa > 0 && (await env.DB.prepare('UPDATE partida_jog SET taxa = 0 WHERE codigo = ? AND usuario = ? AND taxa = ?').bind(p.codigo, j.usuario, j.taxa).run()).meta?.changes) await ajustarCreditos(env, j.usuario, j.taxa).catch(() => {}); }
}
async function finalizar(env, p) {
  if (p.estado !== 'andamento' || Date.now() < p.fim) return;
  const cfg = JSON.parse(p.cfg), feed = await feedAtual(env), js = (await env.DB.prepare('SELECT j.usuario AS id, j.estado AS estado, j.patrimonio AS w0, u.nome AS nome, u.google AS google, p.apelido AS ap FROM partida_jog j JOIN usuarios u ON u.id = j.usuario LEFT JOIN perfis p ON p.usuario = u.id WHERE j.codigo = ?').bind(p.codigo).all()).results || [];
  const tabela = js.map((j) => ({ id: j.id, n: apelido(j.nome, j.google, j.ap), bot: 0, w: j.estado ? valorFinal(JSON.parse(j.estado), feed) : cfg.saldo }));
  for (let i = 0; i < p.bots; i++) tabela.push({ id: 0, n: botNome(p.codigo, i), bot: 1, w: botPatrimonio(cfg, p.codigo, i, p.fim, p.inicio, p.fim) });
  tabela.sort((a, b) => b.w - a.w || a.bot - b.bot || a.id - b.id);
  tabela.forEach((t, i) => { t.pos = i + 1; t.w = Math.round(t.w * 100) / 100; });
  const x = intensidade(js.filter((j) => j.estado).map((j) => JSON.parse(j.estado).partida), cfg);   // perigo da sala (0 a 1): casco perdido por viagem, igual para qualquer saldo ou taxa
  const premios = premiacao(tabela.filter((t) => !t.bot).map((t) => ({ usuario: t.id, geral: t.pos })), tabela.length, cfg, x);
  tabela.forEach((t) => { if (!t.bot) t.premio = premios.get(t.id) || 0; });
  const ok = await env.DB.prepare("UPDATE partidas SET estado = 'fim', resultado = ? WHERE codigo = ? AND estado = 'andamento'").bind(JSON.stringify(tabela), p.codigo).run();
  if (!(ok.meta?.changes > 0)) return;   // outro pedido já encerrou
  for (const t of tabela) if (!t.bot) await env.DB.prepare('UPDATE partida_jog SET patrimonio = ?, premio = ? WHERE codigo = ? AND usuario = ?').bind(t.w, t.premio || 0, p.codigo, t.id).run();
  await pagarPremios(env, p.codigo);
}
async function pagarPremios(env, cod) {   // cada prêmio é "reivindicado" uma única vez antes de creditar
  const js = (await env.DB.prepare('SELECT usuario, premio FROM partida_jog WHERE codigo = ? AND premio > 0 AND pago = 0').bind(cod).all()).results || [];
  for (const j of js) if ((await env.DB.prepare('UPDATE partida_jog SET pago = 1 WHERE codigo = ? AND usuario = ? AND pago = 0').bind(cod, j.usuario).run()).meta?.changes) await ajustarCreditos(env, j.usuario, j.premio).catch(() => {});
}
async function partidasManutencao(env) {   // roda no Cron: fecha partidas vencidas e cancela salas esquecidas
  const now = Date.now();
  for (const p of (await env.DB.prepare("SELECT * FROM partidas WHERE estado = 'andamento' AND fim < ?").bind(now).all()).results || []) await finalizar(env, p);
  for (const p of (await env.DB.prepare("SELECT * FROM partidas WHERE estado = 'espera' AND criada < ?").bind(now - ESPERA_MAX).all()).results || []) await reembolsarTodos(env, p, 'cancelada');
  for (const p of (await env.DB.prepare("SELECT codigo FROM partidas WHERE estado = 'fim' AND fim > ?").bind(now - 3600e3).all()).results || []) await pagarPremios(env, p.codigo);
  await env.DB.prepare("DELETE FROM partida_jog WHERE codigo IN (SELECT codigo FROM partidas WHERE (estado IN ('fim','cancelada') AND COALESCE(fim, criada) < ?))").bind(now - 7 * DIA).run();
  await env.DB.prepare("DELETE FROM partidas WHERE estado IN ('fim','cancelada') AND COALESCE(fim, criada) < ?").bind(now - 7 * DIA).run();
}
/** Conclui a chegada de uma viagem (e o bônus de fim de trajeto) do jogador na partida, para a tela nunca ficar presa "em trânsito". */
async function partidaResolver(env, p, id) {
  for (let i = 0; i < 4; i++) {
    const now = Date.now(), row = await pj(env, p.codigo, id);
    if (!row?.estado || now >= p.fim) return [];
    const S = JSON.parse(row.estado);
    if (!precisaResolver(S, now)) return [];
    const c = { now, feed: await feedAtual(env) }, msgs = [];
    resolver(S, c, msgs); fechar(S, c, msgs);
    const r = await env.DB.prepare('UPDATE partida_jog SET estado = ?, patrimonio = ?, atualizado = ? WHERE codigo = ? AND usuario = ? AND atualizado = ?').bind(JSON.stringify(S), patrimonio(S, c), Math.max(now, row.atualizado + 1), p.codigo, id, row.atualizado).run();
    if (r.meta?.changes > 0) return msgs;
  }
  return [];
}
async function vista(env, p, id, v) {
  const now = Date.now(), cfg = JSON.parse(p.cfg), js = await nomes(env, p.codigo), eu = js.find((j) => j.id === id);
  const base = { codigo: p.codigo, modo: p.modo, estado: p.estado, cfg, host: p.criador === id, criada: p.criada, inicio: p.inicio, fim: p.fim, agora: now, bots: p.bots, vagas: cfg.jogadores };
  if (p.estado === 'espera') return { ...base, jogadores: js.map((j) => ({ n: apelido(j.nome, j.google, j.ap), a: j.av || 'a1', host: j.id === p.criador, eu: j.id === id })) };
  if (p.estado === 'fim' || p.estado === 'cancelada') return { ...base, resultado: p.resultado ? JSON.parse(p.resultado).map((t) => ({ ...t, eu: !t.bot && t.id === id, id: undefined })) : null };
  const tab = js.map((j) => ({ n: apelido(j.nome, j.google, j.ap), a: j.av || 'a1', w: j.w, bot: 0, eu: j.id === id }));
  for (let i = 0; i < p.bots; i++) tab.push({ n: botNome(p.codigo, i), w: botPatrimonio(cfg, p.codigo, i, now, p.inicio, p.fim), bot: 1 });
  tab.sort((a, b) => b.w - a.w); tab.forEach((t) => { t.w = Math.round(t.w * 100) / 100; });
  const out = { ...base, placar: tab };
  if (eu) {
    const msgs = await partidaResolver(env, p, id); if (msgs.length) out.msgs = msgs;
    const row = await pj(env, p.codigo, id);
    if (row?.estado) { const S = JSON.parse(row.estado); out.v = row.atualizado; if (!(v && v === row.atualizado)) { out.estado_jogo = publico(S); out.feed = await feedAtual(env); } }
  }
  return out;
}
async function partidaVer(env, id, url) {
  let p = await ativa(env, id);
  if (!p) p = await env.DB.prepare("SELECT p.* FROM partida_jog j JOIN partidas p ON p.codigo = j.codigo WHERE j.usuario = ? AND p.estado IN ('fim','cancelada') AND COALESCE(p.fim, p.criada) > ? ORDER BY j.entrou DESC LIMIT 1").bind(id, Date.now() - 864e5).first();
  if (!p) return { nenhuma: true, agora: Date.now() };
  if (p.estado === 'espera' && Date.now() - p.criada > ESPERA_MAX) { await reembolsarTodos(env, p, 'cancelada'); p.estado = 'cancelada'; }
  if (p.estado === 'andamento' && Date.now() >= p.fim) { await finalizar(env, p); p = await env.DB.prepare('SELECT * FROM partidas WHERE codigo = ?').bind(p.codigo).first(); }
  if (p.estado === 'fim') await pagarPremios(env, p.codigo);
  return await vista(env, p, id, Number(url.searchParams.get('v')));
}
async function entrarNaSala(env, p, id, cfg) {
  if (await ativa(env, id)) throw new Erro(409, 'Você já está em uma partida. Termine ou saia dela antes.');
  const carr = (await carregarJogo(env, id, Date.now())).S;
  for (const g of cfg.galaxias) if (!desbloqueada(carr, g)) throw new Erro(403, `Você ainda não desbloqueou a galáxia ${GALAXIES[g].nome}, que faz parte desta partida.`);
  const taxa = p.modo === 'torneio' ? cfg.taxa : 0, now = Date.now();
  if (taxa && carr.credits < taxa) throw new Erro(402, `A taxa de entrada é ${taxa} Cr e você tem ${Math.floor(carr.credits)} Cr na carreira.`);
  await env.DB.prepare('INSERT INTO partida_jog (codigo, usuario, taxa, entrou) VALUES (?, ?, 0, ?)').bind(p.codigo, id, now).run();
  const desfazer = () => env.DB.prepare('DELETE FROM partida_jog WHERE codigo = ? AND usuario = ? AND estado IS NULL').bind(p.codigo, id).run();
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM partida_jog WHERE codigo = ?').bind(p.codigo).first()).n;
  if (n > cfg.jogadores) { await desfazer(); throw new Erro(409, 'A sala está cheia.'); }
  if (taxa) { try { await ajustarCreditos(env, id, -taxa); } catch (e) { await desfazer(); throw e; } await env.DB.prepare('UPDATE partida_jog SET taxa = ? WHERE codigo = ? AND usuario = ?').bind(taxa, p.codigo, id).run(); }
  const atual = await env.DB.prepare('SELECT estado FROM partidas WHERE codigo = ?').bind(p.codigo).first();
  if (!atual || atual.estado !== 'espera') { await desfazer(); if (taxa) await ajustarCreditos(env, id, taxa); throw new Erro(409, 'Esta partida já começou ou foi cancelada.'); }
}
async function partidaCriar(env, id, corpo) {
  if (await ativa(env, id)) throw new Erro(409, 'Você já está em uma partida.');
  const carr = (await carregarJogo(env, id, Date.now())).S;
  let cfg; try { cfg = validarCfg(corpo.cfg, carr, corpo.modo); } catch (e) { if (e instanceof Regra) throw new Erro(e.status, e.message); throw e; }
  const codigo = codigoNovo();
  await env.DB.prepare("INSERT INTO partidas (codigo, modo, criador, cfg, estado, criada) VALUES (?, ?, ?, ?, 'espera', ?)").bind(codigo, corpo.modo, id, JSON.stringify(cfg), Date.now()).run();
  try { await entrarNaSala(env, { codigo, modo: corpo.modo }, id, cfg); }
  catch (e) { await env.DB.prepare('DELETE FROM partidas WHERE codigo = ?').bind(codigo).run(); throw e; }
  return await vista(env, await env.DB.prepare('SELECT * FROM partidas WHERE codigo = ?').bind(codigo).first(), id);
}
async function partidaEntrar(env, id, corpo) {
  const cod = String(corpo.codigo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  await limite(env, ['sala:' + id]);
  const p = cod.length === 6 ? await env.DB.prepare('SELECT * FROM partidas WHERE codigo = ?').bind(cod).first() : null;
  if (!p) { await env.DB.prepare('INSERT INTO falhas (chave, quando) VALUES (?, ?)').bind('sala:' + id, Date.now()).run(); throw new Erro(404, 'Código de sala inexistente.'); }
  if (p.estado !== 'espera') throw new Erro(409, 'Esta partida já começou ou foi encerrada.');
  await entrarNaSala(env, p, id, JSON.parse(p.cfg));
  return await vista(env, p, id);
}
async function partidaSair(env, id) {
  const p = await ativa(env, id);
  if (!p) throw new Erro(404, 'Você não está em nenhuma sala.');
  if (p.estado !== 'espera') throw new Erro(409, 'A partida já começou. Ela termina quando o tempo acabar.');
  if (p.criador === id) { await reembolsarTodos(env, p, 'cancelada'); return { nenhuma: true, agora: Date.now() }; }
  const j = await pj(env, p.codigo, id);
  if (j && (await env.DB.prepare('DELETE FROM partida_jog WHERE codigo = ? AND usuario = ? AND estado IS NULL').bind(p.codigo, id).run()).meta?.changes && j.taxa > 0) await ajustarCreditos(env, id, j.taxa);
  return { nenhuma: true, agora: Date.now() };
}
async function partidaIniciar(env, id) {
  const p = await ativa(env, id);
  if (!p || p.criador !== id) throw new Erro(403, 'Só quem criou a sala pode iniciar a partida.');
  if (p.estado !== 'espera') throw new Erro(409, 'A partida já começou.');
  const cfg = JSON.parse(p.cfg), humanos = (await env.DB.prepare('SELECT COUNT(*) AS n FROM partida_jog WHERE codigo = ?').bind(p.codigo).first()).n;
  const bots = cfg.bots ? Math.max(0, cfg.jogadores - humanos) : 0;
  if (humanos + bots < 2) throw new Erro(409, 'Faltam jogadores: convide alguém com o código da sala ou ative os bots.');
  const inicio = Date.now(), fim = inicio + cfg.duracao * 60000;
  const ok = await env.DB.prepare("UPDATE partidas SET estado = 'andamento', inicio = ?, fim = ?, bots = ? WHERE codigo = ? AND estado = 'espera'").bind(inicio, fim, bots, p.codigo).run();
  if (!(ok.meta?.changes > 0)) throw new Erro(409, 'A partida já começou.');
  for (const j of (await env.DB.prepare('SELECT usuario FROM partida_jog WHERE codigo = ?').bind(p.codigo).all()).results || []) {
    const carr = (await carregarJogo(env, j.usuario, inicio)).S, S = novoPartida(carr, cfg, p.codigo, inicio, fim);
    await env.DB.prepare('UPDATE partida_jog SET estado = ?, patrimonio = ?, atualizado = ? WHERE codigo = ? AND usuario = ?').bind(JSON.stringify(S), cfg.saldo, inicio, p.codigo, j.usuario).run();
  }
  return await vista(env, { ...p, estado: 'andamento', inicio, fim, bots }, id);
}
async function partidaAcao(env, id, nome, args) {
  const p = await ativa(env, id);
  if (!p || p.estado !== 'andamento') throw new Erro(409, 'Você não está em uma partida em andamento.');
  for (let i = 0; i < 5; i++) {
    const now = Date.now(), c = { now, feed: await feedAtual(env) }, row = await pj(env, p.codigo, id), msgs = [];
    if (!row?.estado) throw new Erro(409, 'A partida ainda não foi iniciada para você.');
    if (now >= p.fim) { await finalizar(env, p); throw new Erro(410, 'A partida acabou.'); }
    const S = JSON.parse(row.estado); let base = row.atualizado;
    const salvar = async () => { fechar(S, c, msgs); const t = Math.max(now, base + 1); const r = await env.DB.prepare('UPDATE partida_jog SET estado = ?, patrimonio = ?, atualizado = ? WHERE codigo = ? AND usuario = ? AND atualizado = ?').bind(JSON.stringify(S), patrimonio(S, c), t, p.codigo, id, base).run(); if (!(r.meta?.changes > 0)) return 0; base = t; return t; };
    if (resolver(S, c, msgs) && !(await salvar())) continue;
    try { executar(S, c, msgs, nome, args); } catch (e) { if (e instanceof Regra) throw new Erro(e.status, e.message, { msgs }); throw e; }
    const v = await salvar(); if (!v) continue;
    return { estado_jogo: publico(S), v, agora: now, feed: c.feed, msgs };
  }
  throw new Erro(503, 'Servidor ocupado. Tente de novo.');
}

/* ---------- perfil do piloto: apelido público, avatar e faixa etária (tabela criada sozinha na primeira chamada: não exige migração manual) ---------- */
let perfisOk = false;
async function perfisInit(env) {
  if (perfisOk) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS perfis (usuario INTEGER PRIMARY KEY, apelido TEXT COLLATE NOCASE, avatar TEXT NOT NULL DEFAULT 'a1', faixa TEXT, apelido_em INTEGER NOT NULL DEFAULT 0, criado INTEGER NOT NULL DEFAULT 0)").run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_perfis_apelido ON perfis(apelido)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS loja_itens (usuario INTEGER NOT NULL, item TEXT NOT NULL, quando INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (usuario, item))').run();
  try { await env.DB.prepare("ALTER TABLE perfis ADD COLUMN moldura TEXT NOT NULL DEFAULT ''").run(); } catch { /* a coluna já existe */ }
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS chamados (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario INTEGER NOT NULL, email TEXT, categoria TEXT, mensagem TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'aberto', criado INTEGER NOT NULL)").run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS amigos (a INTEGER NOT NULL, b INTEGER NOT NULL, estado TEXT NOT NULL, quem INTEGER NOT NULL, criado INTEGER NOT NULL, PRIMARY KEY (a, b))').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rank_base (periodo TEXT NOT NULL, usuario INTEGER NOT NULL, base REAL NOT NULL, PRIMARY KEY (periodo, usuario))').run();
  perfisOk = true;
}
const AVATARES_GRATIS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];   // o 'cap' (Capitão) é de conquista: entra com a loja
const PROIBIDAS = ['puta', 'porra', 'merda', 'caralho', 'buceta', 'viado', 'arrombad', 'fdp', 'estupr', 'pedofil', 'nazi', 'hitler', 'nigger', 'nigga', 'fuck', 'shit', 'bitch', 'cunt', 'admin', 'moderador', 'suporte', 'astromercante', 'staff'];
const limpaNome = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[013457$@!]/g, (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', $: 's', '@': 'a', '!': 'i' }[c])).replace(/[^a-z]/g, '');
const SETE_DIAS = 7 * 864e5;
const donos = async (env, id) => ((await env.DB.prepare('SELECT item FROM loja_itens WHERE usuario = ?').bind(id).all()).results || []).map((x) => x.item);
async function perfilVer(env, id) {
  const r = await env.DB.prepare('SELECT p.apelido AS ap, p.avatar AS av, p.moldura AS mo, p.faixa AS faixa, p.apelido_em AS em, u.nome AS nome FROM usuarios u LEFT JOIN perfis p ON p.usuario = u.id WHERE u.id = ?').bind(id).first(), meus = await donos(env, id);
  return { id, completo: !!(r && r.ap && r.faixa), apelido: r?.ap || r?.nome || '', sugestao: r?.nome || '', avatar: r?.av || 'a1', moldura: r?.mo || '', molduras: meus.filter((i) => CATALOGO[i]?.tipo === 'moldura'), faixa: r?.faixa || null, avatares: [...AVATARES_GRATIS, ...meus.filter((i) => CATALOGO[i]?.tipo === 'avatar')], troca_em: r?.em ? Math.max(0, r.em + SETE_DIAS - Date.now()) : 0 };
}
async function perfilSalvar(env, id, corpo) {
  const atual = await env.DB.prepare('SELECT apelido, avatar, moldura, faixa, apelido_em FROM perfis WHERE usuario = ?').bind(id).first(), now = Date.now();
  const faixa = atual?.faixa || corpo.faixa;
  if (faixa === '<13') throw new Erro(403, 'O Astromercante é para maiores de 13 anos.');
  if (!['13-17', '18+'].includes(faixa)) throw new Erro(400, 'Escolha sua faixa etária.');
  const avatar = corpo.avatar === undefined ? (atual?.avatar || 'a1') : String(corpo.avatar);
  const meus = await donos(env, id);
  if (!AVATARES_GRATIS.includes(avatar) && !meus.includes(avatar)) throw new Erro(400, 'Avatar indisponível.');
  const moldura = corpo.moldura === undefined ? (atual?.moldura || '') : String(corpo.moldura);
  if (moldura && !(CATALOGO[moldura]?.tipo === 'moldura' && meus.includes(moldura))) throw new Erro(400, 'Moldura indisponível.');
  let ap = atual?.apelido || null, em = atual?.apelido_em || 0;
  if (corpo.apelido !== undefined) {
    const novo = String(corpo.apelido).trim().replace(/\s+/g, ' ');
    if (novo !== ap) {
      if (ap) throw new Erro(403, 'O apelido não pode ser alterado.');   // depois de criado, só o suporte altera (direto no banco)
      if (novo.length < 3 || novo.length > 16 || !/^[\p{L}\p{N}_ .-]+$/u.test(novo)) throw new Erro(400, 'Apelido: 3 a 16 letras, números, espaço, ponto, _ ou -.');
      const l = limpaNome(novo); if (PROIBIDAS.some((w) => l.includes(w))) throw new Erro(400, 'Esse apelido não é permitido. Escolha outro.');
      const outro = await env.DB.prepare('SELECT 1 AS x FROM perfis WHERE apelido = ? AND usuario <> ?').bind(novo, id).first() || await env.DB.prepare('SELECT 1 AS x FROM usuarios WHERE nome = ? AND id <> ?').bind(novo, id).first();
      if (outro) throw new Erro(409, 'Esse apelido já está em uso.');
      em = 0; ap = novo;   // só a primeira escolha é livre
    }
  }
  if (!ap) throw new Erro(400, 'Escolha um apelido.');
  try { await env.DB.prepare('INSERT INTO perfis (usuario, apelido, avatar, moldura, faixa, apelido_em, criado) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(usuario) DO UPDATE SET apelido = excluded.apelido, avatar = excluded.avatar, moldura = excluded.moldura, faixa = excluded.faixa, apelido_em = excluded.apelido_em').bind(id, ap, avatar, moldura, faixa, em, now).run(); }
  catch (e) { if (/UNIQUE/i.test(String(e))) throw new Erro(409, 'Esse apelido já está em uso.'); throw e; }
  rankCache.t = 0;   // o ranking mostra o apelido novo já na próxima leitura
  return await perfilVer(env, id);
}

/* ---------- loja: itens só de aparência (avatar e moldura), pagos com créditos da carreira. O servidor guarda o que cada piloto tem; nada aqui dá vantagem no jogo ---------- */
const CATALOGO = {
  b1: { tipo: 'avatar', nome: 'Robô de carga', raridade: 'comum', preco: 2000 },
  b2: { tipo: 'avatar', nome: 'Alienígena', raridade: 'comum', preco: 5000 },
  b3: { tipo: 'avatar', nome: 'Astronauta', raridade: 'raro', preco: 15000 },
  b4: { tipo: 'avatar', nome: 'Ciborgue', raridade: 'raro', preco: 50000 },
  b5: { tipo: 'avatar', nome: 'Piloto lendário', raridade: 'épico', preco: 250000 },
  b6: { tipo: 'avatar', nome: 'Fantasma estelar', raridade: 'lendário', preco: 1000000 },
  m1: { tipo: 'moldura', nome: 'Neon', raridade: 'comum', preco: 3000 },
  m2: { tipo: 'moldura', nome: 'Ouro', raridade: 'raro', preco: 20000 },
  m3: { tipo: 'moldura', nome: 'Fogo', raridade: 'épico', preco: 100000 },
  m4: { tipo: 'moldura', nome: 'Gelo', raridade: 'épico', preco: 100000 },
  m5: { tipo: 'moldura', nome: 'Arco-íris', raridade: 'lendário', preco: 1000000 },
  cap: { tipo: 'avatar', nome: 'O Capitão', raridade: 'conquista', preco: 0, patente: 4, cond: 'Alcance a patente Comodoro' }
};
async function lojaVer(env, id) {
  const { S } = await carregarJogo(env, id, Date.now());
  let meus = await donos(env, id);
  for (const [k, v] of Object.entries(CATALOGO)) if (v.patente != null && S.rank >= v.patente && !meus.includes(k)) { await env.DB.prepare('INSERT OR IGNORE INTO loja_itens (usuario, item, quando) VALUES (?, ?, ?)').bind(id, k, Date.now()).run(); meus.push(k); }
  return { creditos: Math.floor(S.credits), itens: Object.entries(CATALOGO).map(([k, v]) => ({ id: k, ...v, tem: meus.includes(k) })) };
}
async function lojaComprar(env, id, item) {
  const v = CATALOGO[item]; if (!v || v.patente != null) throw new Erro(400, 'Item indisponível.');
  const novo = await env.DB.prepare('INSERT OR IGNORE INTO loja_itens (usuario, item, quando) VALUES (?, ?, ?)').bind(id, item, Date.now()).run();
  if (!novo.meta || !novo.meta.changes) throw new Erro(409, 'Você já tem este item.');
  try { await ajustarCreditos(env, id, -v.preco, `Você precisa de ${v.preco.toLocaleString('pt-BR')} Cr em caixa para comprar ${v.nome}.`); }
  catch (e) { await env.DB.prepare('DELETE FROM loja_itens WHERE usuario = ? AND item = ?').bind(id, item).run(); throw e; }
  await env.DB.prepare('UPDATE rank_base SET base = base - ? WHERE usuario = ? AND periodo IN (?, ?)').bind(v.preco, id, periodos().semana.id, periodos().mes.id).run();   // cosmético não conta como prejuízo no ganho do período
  return await lojaVer(env, id);
}

/* ---------- suporte: o jogador abre um chamado; ele fica guardado (tabela chamados) e chega por e-mail ao suporte, que responde direto ao e-mail do jogador ---------- */
const CATEGORIAS = { duvida: 'Dúvida', tecnico: 'Problema técnico', compra: 'Compra ou pagamento', conta: 'Conta ou apelido', sugestao: 'Sugestão', outro: 'Outro' };
async function suporteAbrir(env, id, corpo) {
  const cat = CATEGORIAS[corpo.categoria] ? String(corpo.categoria) : 'outro', msg = String(corpo.mensagem || '').trim();
  if (msg.length < 10) throw new Erro(400, 'Conte um pouco mais (mínimo de 10 caracteres).');
  if (msg.length > 2000) throw new Erro(400, 'A mensagem pode ter até 2000 caracteres.');
  const agora = Date.now(), h = await env.DB.prepare('SELECT COUNT(*) AS n FROM chamados WHERE usuario = ? AND criado > ?').bind(id, agora - 3600e3).first(), d = await env.DB.prepare('SELECT COUNT(*) AS n FROM chamados WHERE usuario = ? AND criado > ?').bind(id, agora - 864e5).first();
  if (h.n >= 3 || d.n >= 8) throw new Erro(429, 'Você já enviou vários chamados. Aguarde um pouco antes de abrir outro.');
  const u = await env.DB.prepare('SELECT u.email AS email, u.nome AS nome, p.apelido AS ap, s.patrimonio AS pat FROM usuarios u LEFT JOIN perfis p ON p.usuario = u.id LEFT JOIN saves s ON s.usuario = u.id WHERE u.id = ?').bind(id).first() || {};
  const r = await env.DB.prepare('INSERT INTO chamados (usuario, email, categoria, mensagem, criado) VALUES (?, ?, ?, ?, ?)').bind(id, u.email || null, cat, msg, agora).run();
  const num = r.meta?.last_row_id || 0, destino = env.EMAIL_SUPORTE || env.EMAIL_REMETENTE;
  if (destino) {
    try { await enviar(env, destino, `[Astromercante] Chamado #${num}: ${CATEGORIAS[cat]}`, `Chamado #${num} (${CATEGORIAS[cat]})\nJogador: ${u.ap || u.nome || '?'} (id ${id})\nE-mail: ${u.email || 'sem e-mail'}\nPatrimônio: ${Math.round(u.pat || 0)}\n\n${msg}\n\n(Responda este e-mail para falar com o jogador.)`, u.email || undefined); } catch { /* o chamado já está guardado */ }
  }
  return { ok: true, numero: num };
}
async function rota(req, env, url) {
  await perfisInit(env);
  const m = req.method, p = url.pathname;
  const corpo = m === 'GET' ? {} : await req.json().catch(() => ({}));
  if (p === '/precos' && m === 'GET') {
    let d = JSON.parse((await env.PRECOS.get('latest')) || 'null');
    if (!d) d = await refresh(env);
    return { btc: d.btc ?? null, gold: d.gold ?? null, eth: d.eth ?? null, fx: d.fx ?? null, ant: d.ant ?? null, updated: d.updated ?? null, stale: !d.updated || Date.now() - d.updated > STALE_MS };
  }
  if (p === '/auth/registrar' && m === 'POST') {
    const nome = corpo.nome || '', senha = corpo.senha, ip = req.headers.get('CF-Connecting-IP') || 'ip';
    if (!/^\w{3,20}$/.test(nome)) throw new Erro(400, 'Nome: 3 a 20 letras, números ou _.');
    if (typeof senha !== 'string' || senha.length < 8 || senha.length > 72) throw new Erro(400, 'A senha precisa ter de 8 a 72 caracteres.');
    if (corpo.maior13 !== true) throw new Erro(400, 'O Astromercante é para maiores de 13 anos: confirme para criar a conta.');
    const email = normEmail(corpo.email);
    await limite(env, ['reg:' + ip]); await humano(env, req, corpo.turnstile);
    await env.DB.prepare('INSERT INTO falhas (chave, quando) VALUES (?, ?)').bind('reg:' + ip, Date.now()).run();   // freia criação em massa
    await limparPendentes(env);
    const dono = await env.DB.prepare('SELECT id, verificado FROM usuarios WHERE email = ?').bind(email).first();
    if (dono && dono.verificado) throw new Erro(409, 'Este e-mail já tem conta. Entre ou recupere a senha.');
    if (dono) await apagarUsuario(env, dono.id);                                   // cadastro anterior nunca confirmado: recomeça
    if (await env.DB.prepare('SELECT 1 AS x FROM usuarios WHERE nome = ?').bind(nome).first()) throw new Erro(409, 'Este nome já está em uso.');
    const r = await env.DB.prepare('INSERT INTO usuarios (nome, email, senha, verificado, criado) VALUES (?, ?, ?, 0, ?)').bind(nome, email, await hashSenha(senha, env), Date.now()).run();
    await enviarCodigo(env, email, 'confirmar');
    return { pendente: true, email };
  }
  if (p === '/auth/confirmar' && m === 'POST') {
    const email = normEmail(corpo.email, true), u = await env.DB.prepare('SELECT id, nome FROM usuarios WHERE email = ?').bind(email).first();
    await limite(env, ['cod:' + email]);
    if (!u) throw new Erro(400, 'Código incorreto.');
    try { await conferirCodigo(env, email, 'confirmar', corpo.codigo); } catch (e) { await env.DB.prepare('INSERT INTO falhas (chave, quando) VALUES (?, ?)').bind('cod:' + email, Date.now()).run(); throw e; }
    await env.DB.prepare('UPDATE usuarios SET verificado = 1 WHERE id = ?').bind(u.id).run();
    const sv = await lerSave(env, u.id);
    return { token: await criarSessao(env, u.id), nome: u.nome };
  }
  if (p === '/auth/reenviar' && m === 'POST') {
    const email = normEmail(corpo.email, true), u = await env.DB.prepare('SELECT verificado FROM usuarios WHERE email = ?').bind(email).first();
    if (u && !u.verificado) await enviarCodigo(env, email, 'confirmar');
    return { ok: true };
  }
  if (p === '/auth/esqueci' && m === 'POST') {
    const email = normEmail(corpo.email, true), ip = req.headers.get('CF-Connecting-IP') || 'ip';
    await limite(env, ['esq:' + ip]); await humano(env, req, corpo.turnstile);
    await env.DB.prepare('INSERT INTO falhas (chave, quando) VALUES (?, ?)').bind('esq:' + ip, Date.now()).run();
    const u = await env.DB.prepare('SELECT 1 AS x FROM usuarios WHERE email = ? AND verificado = 1').bind(email).first();
    if (u) await enviarCodigo(env, email, 'redefinir');
    return { ok: true };                                                           // mesma resposta exista ou não a conta
  }
  if (p === '/auth/redefinir' && m === 'POST') {
    const email = normEmail(corpo.email, true), senha = corpo.senha;
    if (typeof senha !== 'string' || senha.length < 8 || senha.length > 72) throw new Erro(400, 'A senha precisa ter de 8 a 72 caracteres.');
    const u = await env.DB.prepare('SELECT id FROM usuarios WHERE email = ?').bind(email).first();
    if (!u) throw new Erro(400, 'Código incorreto.');
    await conferirCodigo(env, email, 'redefinir', corpo.codigo);
    await env.DB.prepare('UPDATE usuarios SET senha = ?, verificado = 1 WHERE id = ?').bind(await hashSenha(senha, env), u.id).run();
    await env.DB.prepare('DELETE FROM sessoes WHERE usuario = ?').bind(u.id).run();   // derruba sessões antigas
    return { ok: true };
  }
  if (p === '/auth/google' && m === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) throw new Erro(503, 'Login com Google não configurado.');
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(corpo.credential || '')));
    const g = await r.json().catch(() => ({}));
    if (!r.ok || g.aud !== env.GOOGLE_CLIENT_ID || String(g.email_verified) !== 'true' || Number(g.exp) * 1000 < Date.now()) throw new Erro(401, 'Não foi possível validar o login do Google.');
    const email = normEmail(g.email, false, true);
    let u = await env.DB.prepare('SELECT id, nome FROM usuarios WHERE google = ? OR email = ?').bind(g.sub, email).first(), novo = false;
    if (u) await env.DB.prepare('UPDATE usuarios SET google = ?, verificado = 1 WHERE id = ?').bind(g.sub, u.id).run();
    else {
      const base = 'Piloto';   // nome público neutro: o ranking é visível a todos, então nada do e-mail entra no nome
      let nome = base + String(Math.floor(Math.random() * 9000) + 1000);
      while (await env.DB.prepare('SELECT 1 AS x FROM usuarios WHERE nome = ?').bind(nome).first()) nome = base + String(Math.floor(Math.random() * 90000) + 10000);
      const ins = await env.DB.prepare("INSERT INTO usuarios (nome, email, senha, verificado, google, criado) VALUES (?, ?, '', 1, ?, ?)").bind(nome, email, g.sub, Date.now()).run();
      u = { id: ins.meta.last_row_id, nome }; novo = true;
    }
    const sv = await lerSave(env, u.id);
    return { token: await criarSessao(env, u.id), nome: u.nome, ...(novo ? { novo: true } : {}) };
  }
  if (p === '/auth/entrar' && m === 'POST') {
    const login = String(corpo.nome || '').trim(), ip = req.headers.get('CF-Connecting-IP') || 'ip', chaves = ['nome:' + login.toLowerCase(), 'ip:' + ip];
    await limite(env, chaves);
    let busca = login; try { if (login.includes('@')) busca = normEmail(login, false, true); } catch {}
    const u = await env.DB.prepare(`SELECT id, nome, senha, email, verificado FROM usuarios WHERE ${login.includes('@') ? 'email' : 'nome'} = ?`).bind(busca).first();
    const ok = u && u.senha ? await confere(String(corpo.senha || ''), u.senha) : (await derivar('x', new Uint8Array(16), 50000), false);   // tempo parecido com ou sem usuário
    if (!ok) { for (const c of chaves) await env.DB.prepare('INSERT INTO falhas (chave, quando) VALUES (?, ?)').bind(c, Date.now()).run(); throw new Erro(401, 'Nome ou senha incorretos.'); }
    if (!u.verificado) throw new Erro(403, 'Confirme seu e-mail para entrar. Enviamos um código quando você criou a conta.', { pendente: true, email: u.email });
    return { token: await criarSessao(env, u.id), nome: u.nome };
  }
  const eu = await autenticar(req, env);
  if (p === '/auth/sair' && m === 'POST') { await env.DB.prepare('DELETE FROM sessoes WHERE hash = ?').bind(eu.hash).run(); return { ok: true }; }
  if (p === '/suporte' && m === 'POST') return await suporteAbrir(env, eu.id, corpo);
  if (p === '/loja' && m === 'GET') return await lojaVer(env, eu.id);
  if (p === '/loja/comprar' && m === 'POST') return await lojaComprar(env, eu.id, String(corpo.item || ''));
  if (p === '/perfil' && m === 'GET') return await perfilVer(env, eu.id);
  if (p === '/perfil' && m === 'POST') return await perfilSalvar(env, eu.id, corpo);
  if (p === '/ranking' && m === 'GET') { const t = url.searchParams.get('p'); if (t === 'semana' || t === 'mes') return await rankingPeriodo(env, eu.id, t); if (t === 'amigos') return await rankingAmigos(env, eu.id, url.searchParams.get('q')); return await ranking(env, eu.id); }
  if (p === '/amigos' && m === 'GET') return await amigosVer(env, eu.id);
  if (p === '/amigos/quem' && m === 'GET') { const i = Number(url.searchParams.get('id')), q = (await quemInfo(env, [i]))[i]; if (!q) throw new Erro(404, 'Piloto não encontrado.'); return { id: q.id, n: q.n, a: q.a }; }
  if (p === '/amigos/pedir' && m === 'POST') return await amigosPedir(env, eu.id, corpo);
  if (p === '/amigos/responder' && m === 'POST') return await amigosResponder(env, eu.id, corpo);
  if (p === '/amigos/remover' && m === 'POST') return await amigosRemover(env, eu.id, corpo);
  if (p === '/jogo' && m === 'GET') return await jogoLer(env, eu.id, url);
  if (p === '/jogo/acao' && m === 'POST') return await jogo(env, eu.id, String(corpo.acao || ''), corpo);
  if (p === '/partida' && m === 'GET') return await partidaVer(env, eu.id, url);
  if (p === '/partida/criar' && m === 'POST') return await partidaCriar(env, eu.id, corpo);
  if (p === '/partida/entrar' && m === 'POST') return await partidaEntrar(env, eu.id, corpo);
  if (p === '/partida/iniciar' && m === 'POST') return await partidaIniciar(env, eu.id);
  if (p === '/partida/sair' && m === 'POST') return await partidaSair(env, eu.id);
  if (p === '/partida/acao' && m === 'POST') return await partidaAcao(env, eu.id, String(corpo.acao || ''), corpo);
  if (p === '/conta' && m === 'DELETE') {
    const u = await env.DB.prepare('SELECT senha FROM usuarios WHERE id = ?').bind(eu.id).first();
    const ok = u.senha ? await confere(String(corpo.senha || ''), u.senha) : corpo.senha === 'EXCLUIR';   // conta Google: digitar EXCLUIR
    if (!ok) throw new Erro(401, 'Confirmação incorreta.');
    await apagarUsuario(env, eu.id);
    return { ok: true };
  }
  throw new Erro(404, 'Rota inexistente.');
}

export default {
  async scheduled(_evento, env, ctx) { ctx.waitUntil(refresh(env)); ctx.waitUntil(partidasManutencao(env)); },
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const h = { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    try { return new Response(JSON.stringify(await rota(req, env, new URL(req.url))), { headers: h }); }
    catch (e) { return new Response(JSON.stringify({ erro: e.status ? e.message : 'Erro interno.', ...(e.extra || {}) }), { status: e.status || 500, headers: h }); }
  },
};
