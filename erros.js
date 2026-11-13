/* Registro de erros: quando o jogo quebra no aparelho de um jogador, mandamos uma linha curta ao servidor (só com sessão ativa).
   Limites: 5 por visita, sem repetir a mesma mensagem. Nada de dados pessoais: só texto do erro, arquivo/linha e a tela aberta. */
(() => {
  let n = 0; const vistos = new Set();
  const manda = (m, u) => {
    try {
      m = String(m || '').slice(0, 300); if (!m || n >= 5 || vistos.has(m)) return;
      if (/^Script error|ResizeObserver|Load failed|Failed to fetch|NetworkError|AbortError|Sem conexão/i.test(m)) return;
      if (typeof api !== 'function' || typeof TOK === 'undefined' || !TOK) return;
      vistos.add(m); n++; api('/log', 'POST', { m, u: String(u || '').replace(location.origin, '').slice(0, 200), v: document.body.dataset.view || '' }).catch(() => {});
    } catch {}
  };
  addEventListener('error', e => { if (e.target && e.target !== window) return; manda(e.message, (e.filename || '') + ':' + (e.lineno || 0)); });
  addEventListener('unhandledrejection', e => { const r = e.reason; manda(r && (r.message || r), r && r.stack ? String(r.stack).split('\n')[1] : ''); });
})();
