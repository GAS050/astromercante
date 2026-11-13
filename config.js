// Configuração de publicação (veja worker/README.md).
const CONFIG = {
  PRECOS_URL: 'https://astromercante-precos.5xcontax5.workers.dev',          // URL do Worker (preços, contas e nuvem). Vazio = jogo só neste aparelho
  GOOGLE_CLIENT_ID: '655503554422-0cmvq61j6o0gsg5n171agcuh1eljn80q.apps.googleusercontent.com',    // opcional: ID do cliente OAuth do Google (habilita "Entrar com Google")
  TURNSTILE_SITEKEY: '',   // opcional: chave pública do Cloudflare Turnstile (anti-robô no cadastro)
};
