// Notícias do ASTROMERCANTE: lê manchetes reais, pede ao Gemini para recontá-las no universo do jogo (tudo fictício)
// e guarda o resultado no KV. Roda no máximo 1x por hora (Cron de 5 min só confere o relógio), então o custo não depende de jogadores.
// Só existe notícia no jogo quando existe notícia real sobre o ativo: sem manchete relevante (ou sem GEMINI_KEY, ou se o Gemini falhar) o feed simplesmente não ganha itens.
import { RES } from './motor.js';
import { GALAXIES, FEEDS } from './dados.js';

const INTERVALO = 55 * 60 * 1000, GUARDA = 24 * 3600 * 1000, MAX = 20;
const FONTES = [   // feeds RSS públicos de veículos; só o título de cada matéria é usado como inspiração (o texto do jogo é sempre fictício)
  ['coindesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
  ['cointelegraph', 'https://cointelegraph.com/rss'],
  ['decrypt', 'https://decrypt.co/feed'],
  ['cryptoslate', 'https://cryptoslate.com/feed/'],
  ['cnbc-economia', 'https://www.cnbc.com/id/20910258/device/rss/rss.html'],
  ['cnbc-financas', 'https://www.cnbc.com/id/10000664/device/rss/rss.html'],
  ['bbc-negocios', 'https://feeds.bbci.co.uk/news/business/rss.xml'],
  ['bbc-mundo', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  ['guardian-negocios', 'https://www.theguardian.com/business/rss'],
  ['guardian-mundo', 'https://www.theguardian.com/world/rss'],
  ['g1-economia', 'https://g1.globo.com/rss/g1/economia/'],
];
// nada de pessoas, países ou empresas reais no texto final
const PROIBIDO = /trump|biden|putin|zelensk|musk|lula|bolsonaro|powell|xi jinping|netanyahu|china|chin[eê]s|\beua\b|estados unidos|r[uú]ssia|ucr[aâ]nia|israel|\bir[aã]\b|gaza|brasil|europa|opep|opec|\bfed\b|binance|coinbase|apple|google|tesla|nvidia|microsoft|amazon|\bmeta\b|openai|\bsec\b|nasdaq|wall street|dow jones/i;
const BASE_ATIVO = { btc: 'Bitcoin', gold: 'ouro (PAXG)', eth: 'Ethereum', fx: 'dólar contra o real' };
const ativoDe = (src) => BASE_ATIVO[src] || (FEEDS[src] ? `${FEEDS[src].nome} (${FEEDS[src].sym})` : src);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sha = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const limpa = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// lê só o começo de cada feed (as primeiras manchetes ficam nos primeiros KB): poupa CPU, que no plano grátis é de só 10 ms por execução
async function comecoDe(u, max = 14000) {
  const r = await fetch(u, { signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; Astromercante/1.0)', accept: 'application/rss+xml, application/xml, text/xml, */*' } });
  if (!r.ok) throw new Error('http ' + r.status);
  if (!r.body) return (await r.text()).slice(0, max);
  const rd = r.body.getReader(), dec = new TextDecoder(); let t = '';
  while (t.length < max) { const { done, value } = await rd.read(); if (done) break; t += dec.decode(value, { stream: true }); }
  try { await rd.cancel(); } catch {}
  return t;
}
async function manchetes(diag) {
  const r = await Promise.allSettled(FONTES.map(([, u]) => comecoDe(u)));
  const out = [], rel = [];
  r.forEach((x, i) => {
    const nome = FONTES[i][0];
    if (x.status !== 'fulfilled') return rel.push(`${nome}: ${String(x.reason?.message || x.reason).slice(0, 30)}`);
    let n = 0; for (const m of x.value.matchAll(/<item[\s>][\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)) { const t = limpa(m[1].replace(/ - [^-]+$/, ''), 160); if (t && n++ < 6) out.push(t); }
    rel.push(`${nome}: ${n}`);
  });
  if (diag) diag.fontes = rel;
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
- Uma notícia por produto (nunca duas para o mesmo produto). Revise a ortografia.
- Título até 80 caracteres; texto de 1 ou 2 frases, até 220 caracteres. Sem emojis. Não é recomendação financeira.
- Vale notícia direta (sobre o próprio ativo) e indireta, quando o efeito econômico for plausível. Exemplos: conflito ou tensão entre grandes potências tende a subir o ouro e o dólar e pressionar cripto; juros altos pressionam Bitcoin e altcoins; juros em queda ou estímulo favorecem cripto; regulação favorável ou aprovação de fundos sobe cripto; hack ou proibição derruba cripto; petróleo em alta afeta energia (o produto ligado ao Ethereum); dólar forte derruba o ouro. Escolha os produtos que seguem os ativos afetados.
- Só crie notícia quando a manchete tiver esse tipo de ligação clara com algum dos ativos reais indicados acima. Não invente nada sem manchete correspondente. Escolha no máximo 4, as mais relevantes e de assuntos diferentes. Se nenhuma manchete servir, devolva [].

SAÍDA: apenas JSON, um array: [{"o":3,"ti":"...","tx":"...","r":["id1","id2"],"d":1,"m":0.5,"h":3}]  ("o" = número da manchete real que inspirou a notícia)

MANCHETES REAIS:
${titulos.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
}

// o gemini-2.0-flash foi desligado em 01/06/2026: tenta o modelo configurado e, se ele falhar, os próximos da lista
const MODELOS_GEMINI = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];
async function gemini(env, texto, diag) {
  const lista = [...new Set([env.GEMINI_MODEL, ...MODELOS_GEMINI].filter(Boolean))];
  for (const modelo of lista) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: texto }] }], generationConfig: { responseMimeType: 'application/json', temperature: .9, maxOutputTokens: 6000 } }),
    });
    if (!r.ok) { diag.gemini = `erro ${r.status} em ${modelo}`; (diag.tentativas ||= []).push(diag.gemini); if (r.status === 401 || r.status === 403 || r.status === 429) throw new Error(diag.gemini); continue; }   // chave inválida/sem cota: não adianta trocar de modelo
    const j = await r.json(); diag.gemini = 'ok ' + modelo;
    return JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
  }
  throw new Error(diag.gemini || 'sem modelo');
}

const IDS = new Set(RES.map((r) => r.id));
// valida tudo que vem da IA: só ids conhecidos, intensidade limitada (no máx. ±10%), texto curto e sem nomes reais
export function validar(lista, agora, titulos = [], diag = {}, ativos = []) {
  const out = [], usados = new Set(); diag.recebidas = Array.isArray(lista) ? lista.length : 0; diag.descartadas = 0;
  if (!Array.isArray(lista)) return out;
  for (const n of lista.slice(0, 6)) {
    const ti = limpa(n?.ti, 90), tx = limpa(n?.tx, 260), r = [...new Set((Array.isArray(n?.r) ? n.r : []).filter((x) => IDS.has(x)))].slice(0, 3);
    if (ti.length < 8 || tx.length < 20 || !r.length || PROIBIDO.test(ti + ' ' + tx) || r.some((x) => usados.has(x))) { diag.descartadas++; continue; }   // 1 notícia por produto em cada rodada
    const d = n.d < 0 ? -1 : 1, m = clamp(Number(n.m) || .4, .1, 1), h = clamp(Math.round(Number(n.h)) || 3, 1, 5);
    const sinal = d, conflito = ativos.some((a) => a.s * sinal < 0 && a.t1 > agora && a.r.some((x) => r.includes(x)));   // não contradiz uma notícia ainda ativa do mesmo produto
    if (conflito) { diag.descartadas++; continue; }
    r.forEach((x) => usados.add(x));
    out.push({ id: sha(ti + agora), ti, tx, r, s: +(d * m * .1).toFixed(3), t0: agora, t1: agora + h * 3600000, f: 'ia', orig: titulos[Number(n.o) - 1] || null });   // orig: só para conferência em /noticias/diag, não vai para o jogo
  }
  return out;
}

export async function atualizarNoticias(env, forcar = false) {
  const agora = Date.now(), ant = JSON.parse((await env.PRECOS.get('news')) || '{}');
  if (!forcar && ant.t && agora - ant.t < INTERVALO) return ant;
  const vistos = new Set(ant.vistos || []), diag = { v: 'v7', t: agora, chave: !!env.GEMINI_KEY, manchetes: 0, gemini: env.GEMINI_KEY ? '—' : 'GEMINI_KEY não encontrada', gerou: 0 };
  let novos = [], falhou = !env.GEMINI_KEY;
  if (env.GEMINI_KEY) {
    try {
      const todos = await manchetes(diag), titulos = todos.filter((t) => !vistos.has(sha(t))).slice(0, 40);
      diag.manchetes = todos.length;
      if (!todos.length) falhou = true;
      else if (titulos.length < 4) diag.motivo = `só ${titulos.length} manchetes novas (as demais já foram vistas); use ?rodar=1&limpar=1`;
      else { novos = validar(await gemini(env, prompt(titulos), diag), agora, titulos, diag, ant.itens || []); if (novos.length || !diag.recebidas) titulos.forEach((t) => vistos.add(sha(t))); }   // só "gasta" as manchetes se saiu notícia ou se o Gemini achou todas irrelevantes
    } catch (e) { falhou = true; diag.erro = String(e?.message || e).slice(0, 120); console.log('noticias:', diag.erro); }
  }
  diag.gerou = novos.length;
  const itens = [...novos, ...(ant.itens || [])].filter((n) => agora - n.t0 < GUARDA).slice(0, MAX);
  // se algo falhou, tenta de novo em ~10 min em vez de esperar 1 hora
  const out = { t: falhou ? agora - INTERVALO + 10 * 60000 : agora, itens, vistos: [...vistos].slice(-200), diag };
  await env.PRECOS.put('news', JSON.stringify(out));
  return out;
}

// usado pelo Cron: nunca deixa um erro passar em silêncio (grava o motivo em diag)
export async function rodarNoticias(env, forcar = false) {
  try { return await atualizarNoticias(env, forcar); } catch (e) {
    try { const ant = JSON.parse((await env.PRECOS.get('news')) || '{}'); await env.PRECOS.put('news', JSON.stringify({ ...ant, t: Date.now() - INTERVALO + 10 * 60000, diag: { t: Date.now(), erro: 'falha geral: ' + String(e?.message || e).slice(0, 120) } })); } catch {}
  }
}
