// Notícias do ASTROMERCANTE: lê manchetes reais, pede ao Gemini para recontá-las no universo do jogo (tudo fictício)
// e guarda o resultado no KV. Roda no máximo 1x por hora (Cron de 5 min só confere o relógio), então o custo não depende de jogadores.
// Só existe notícia no jogo quando existe notícia real sobre o ativo: sem manchete relevante (ou sem GEMINI_KEY, ou se o Gemini falhar) o feed simplesmente não ganha itens.
import { RES } from './motor.js';
import { GALAXIES, FEEDS } from './dados.js';

const INTERVALO = 55 * 60 * 1000, GUARDA = 24 * 3600 * 1000, MAX = 20;
const FONTES = [   // consultas de manchetes (Google News RSS); só o título é usado como inspiração
  'https://news.google.com/rss/search?q=bitcoin+when:1d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=ethereum+OR+solana+OR+crypto+market+when:1d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=gold+price+when:1d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=d%C3%B3lar+real+c%C3%A2mbio+when:1d&hl=pt-BR&gl=BR&ceid=BR:pt-419',
  'https://news.google.com/rss/search?q=oil+OR+energy+OR+inflation+OR+interest+rates+when:1d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=global+economy+OR+stock+market+when:1d&hl=en-US&gl=US&ceid=US:en',
];
// nada de pessoas, países ou empresas reais no texto final
const PROIBIDO = /trump|biden|putin|zelensk|musk|lula|bolsonaro|powell|xi jinping|netanyahu|china|chin[eê]s|eua\b|estados unidos|r[uú]ssia|ucr[aâ]nia|israel|\bir[aã]\b|gaza|brasil|europa|opep|opec|\bfed\b|binance|coinbase|apple|google|tesla|nvidia|microsoft|amazon|meta\b|openai|sec\b|nasdaq|wall street|dow jones/i;
const BASE_ATIVO = { btc: 'Bitcoin', gold: 'ouro (PAXG)', eth: 'Ethereum', fx: 'dólar contra o real' };
const ativoDe = (src) => BASE_ATIVO[src] || (FEEDS[src] ? `${FEEDS[src].nome} (${FEEDS[src].sym})` : src);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sha = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const limpa = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

async function manchetes() {
  const r = await Promise.allSettled(FONTES.map((u) => fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 Astromercante' } }).then((x) => (x.ok ? x.text() : Promise.reject(x.status)))));
  const out = [];
  r.forEach((x) => { if (x.status !== 'fulfilled') return; let n = 0; for (const m of x.value.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)) { const t = limpa(m[1].replace(/ - [^-]+$/, ''), 160); if (t && n++ < 7) out.push(t); } });
  return [...new Set(out)];
}

function prompt(titulos) {
  const prods = RES.filter((r) => r.id).map((r) => `${r.id} = ${r.nome} (segue ${ativoDe(r.src)})`).join('\n');
  const gal = GALAXIES.map((g) => g.nome).join(', ');
  const planetas = GALAXIES.flatMap((g) => g.planetas.slice(0, 2).map((p) => p.nome)).join(', ');
  return `Você é o redator do "Noticiário Interplanetário" de um jogo de comércio espacial (português do Brasil, tom leve de ficção científica).
Abaixo há manchetes REAIS de hoje sobre economia e criptomoedas. Para cada notícia relevante, escreva UMA notícia FICTÍCIA do universo do jogo que conte a mesma ideia econômica com outros personagens e lugares.

REGRAS OBRIGATÓRIAS
- NUNCA cite pessoas, países, cidades, empresas, marcas ou moedas reais. Troque por personagens e lugares inventados (ex.: "Comandante Vasko de Orionis", "Conselho de Cassiopeia", "Guilda dos Mineradores"). Galáxias do jogo: ${gal}. Planetas: ${planetas}.
- A notícia fictícia precisa ter o mesmo sentido econômico da real (alta ou queda do ativo relacionado).
- Escolha 1 a 3 produtos afetados, usando SOMENTE estes ids (o produto segue o ativo real indicado):
${prods}
- "d" é 1 se o preço tende a subir e -1 se tende a cair. "m" é a intensidade de 0.1 a 1. "h" é a duração em horas (1 a 5).
- Título até 80 caracteres; texto de 1 ou 2 frases, até 220 caracteres. Sem emojis. Não é recomendação financeira.
- Só crie notícia para manchetes que tratem claramente de um dos ativos reais indicados acima (ou da economia em geral, se afetar algum deles). Não invente nada sem manchete correspondente. Escolha no máximo 4, as mais relevantes e de assuntos diferentes. Se nenhuma manchete servir, devolva [].

SAÍDA: apenas JSON, um array: [{"ti":"...","tx":"...","r":["id1","id2"],"d":1,"m":0.5,"h":3}]

MANCHETES REAIS:
${titulos.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
}

async function gemini(env, texto) {
  const modelo = env.GEMINI_MODEL || 'gemini-2.0-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: texto }] }], generationConfig: { responseMimeType: 'application/json', temperature: .9, maxOutputTokens: 1500 } }),
  });
  if (!r.ok) throw new Error('gemini ' + r.status);
  const j = await r.json();
  return JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
}

const IDS = new Set(RES.map((r) => r.id));
// valida tudo que vem da IA: só ids conhecidos, intensidade limitada (no máx. ±10%), texto curto e sem nomes reais
export function validar(lista, agora) {
  const out = [];
  if (!Array.isArray(lista)) return out;
  for (const n of lista.slice(0, 6)) {
    const ti = limpa(n?.ti, 90), tx = limpa(n?.tx, 260), r = [...new Set((Array.isArray(n?.r) ? n.r : []).filter((x) => IDS.has(x)))].slice(0, 3);
    if (ti.length < 8 || tx.length < 20 || !r.length || PROIBIDO.test(ti + ' ' + tx)) continue;
    const d = n.d < 0 ? -1 : 1, m = clamp(Number(n.m) || .4, .1, 1), h = clamp(Math.round(Number(n.h)) || 3, 1, 5);
    out.push({ id: sha(ti + agora), ti, tx, r, s: +(d * m * .1).toFixed(3), t0: agora, t1: agora + h * 3600000, f: 'ia' });
  }
  return out;
}

export async function atualizarNoticias(env, forcar = false) {
  const agora = Date.now(), ant = JSON.parse((await env.PRECOS.get('news')) || '{}');
  if (!forcar && ant.t && agora - ant.t < INTERVALO) return ant;
  let novos = [], vistos = new Set(ant.vistos || []);
  if (env.GEMINI_KEY) {
    try {
      const todos = await manchetes(), titulos = todos.filter((t) => !vistos.has(sha(t))).slice(0, 40);
      if (titulos.length >= 4) { novos = validar(await gemini(env, prompt(titulos)), agora); titulos.forEach((t) => vistos.add(sha(t))); }
    } catch (e) { console.log('noticias:', e?.message || e); }
  }
  const itens = [...novos, ...(ant.itens || [])].filter((n) => agora - n.t0 < GUARDA).slice(0, MAX);
  const out = { t: agora, itens, vistos: [...vistos].slice(-200) };
  await env.PRECOS.put('news', JSON.stringify(out));
  return out;
}
