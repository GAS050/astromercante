# Worker do ASTROMERCANTE: preços, contas e salvamento na nuvem

Um único Worker faz três coisas: entrega os preços reais (cache de 5 min), cria contas e guarda o progresso de cada jogador.

## Publicar (cerca de 15 minutos)
Precisa de conta gratuita na Cloudflare e Node 18+.

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create PRECOS      # copie o "id" para [[kv_namespaces]] no wrangler.toml
npx wrangler d1 create astromercante            # copie o "database_id" para [[d1_databases]] no wrangler.toml
npx wrangler d1 execute astromercante --remote --file=schema.sql    # cria as tabelas
npx wrangler secret put COINGECKO_KEY        # opcional, recomendado (chave Demo gratuita da CoinGecko)
npx wrangler deploy                          # mostra a URL do Worker
```
1. Abra `SUA-URL/precos`: deve aparecer um JSON com btc, gold, eth e fx.
2. Cole a URL (sem `/precos`) em `config.js` na raiz do jogo e publique o jogo de novo. O mesmo endereço atende preços e contas.
3. Depois de publicar o jogo, troque `ALLOWED_ORIGIN` no `wrangler.toml` pelo endereço dele e rode `npx wrangler deploy` outra vez.

## E-mail (Brevo) e domínio
O cadastro envia um código de 6 dígitos por e-mail; a conta só vale depois de confirmada. A recuperação de senha usa o mesmo caminho.

1. Crie uma conta gratuita na Brevo (300 e-mails/dia) e gere uma chave de API (SMTP & API → API Keys).
2. Em *Senders, Domains*, valide o seu domínio (ela mostra os registros SPF, DKIM e DMARC para colar no DNS). Sem domínio próprio, os e-mails caem no spam.
3. Guarde a chave e ajuste o remetente:
```bash
npx wrangler secret put BREVO_KEY
# no wrangler.toml: EMAIL_REMETENTE = "nao-responda@seudominio.com"
```
Se `BREVO_KEY` não estiver configurada, o cadastro responde "Envio de e-mail não configurado".

## Anti-robô (Turnstile) e Google, opcionais
- **Turnstile:** painel da Cloudflare → Turnstile → criar widget. `npx wrangler secret put TURNSTILE_SECRET` e cole a *site key* em `config.js` (`TURNSTILE_SITEKEY`).
- **Google:** Google Cloud Console → Credenciais → ID do cliente OAuth (tipo Web), com o endereço do jogo em "origens JavaScript autorizadas". Cole o ID em `GOOGLE_CLIENT_ID` no `wrangler.toml` **e** no `config.js`.

## Rotas
| Rota | O que faz |
|---|---|
| `GET /precos` | variação de 24h de BTC, ouro, ETH e USD/BRL |
| `POST /auth/registrar` | cria conta pendente (nome, e-mail, senha) e envia o código |
| `POST /auth/confirmar` | confirma o código e abre a sessão |
| `POST /auth/reenviar` | reenvia o código (1 por minuto) |
| `POST /auth/esqueci`, `/auth/redefinir` | recuperação de senha por código; derruba as sessões antigas |
| `POST /auth/google` | entra ou cria conta com Google (token validado no servidor) |
| `POST /auth/entrar` | entra por nome ou e-mail; exige e-mail confirmado |
| `POST /auth/sair` | encerra a sessão |
| `GET /jogo` | estado da conta (o servidor resolve chegadas de viagem e o bônus do dia); `?v=` devolve só `{igual:true}` se nada mudou |
| `GET /ranking` | top 10 do patrimônio, posição e total de pilotos (cache de 30 s). Contas Google aparecem como `Piloto####`, sem nada do e-mail |
| `POST /jogo/acao` | única forma de mudar o jogo: `negociar`, `viajar`, `saltar`, `melhorar`. O servidor valida e executa; o aparelho não envia saldo, preço nem posição |
| `DELETE /conta` | exclui a conta e o progresso (senha; em conta Google, digitar EXCLUIR) |

## Segurança: o que já existe e o que falta
- Senhas com PBKDF2-SHA256 e sal; sessões só como hash; bloqueio de 15 min após 8 erros; código de e-mail vale 15 min e morre após 5 tentativas erradas.
- Um e-mail por conta (no Gmail, pontos e `+apelido` são ignorados) e bloqueio de e-mails descartáveis comuns. Cadastros não confirmados somem em 24 h.
- **Custo do hash:** o padrão é 50.000 iterações por causa dos 10 ms de CPU do plano gratuito. Se aparecer o erro 1102, use o plano pago e suba `PBKDF2_ITER` para 100000.
- **O progresso é calculado no aparelho**, então dá para trapacear editando créditos. Para ranking global justo, o servidor precisa validar compras e vendas.
- A lista de e-mails descartáveis é parcial: o Turnstile cobre o que ela não pega.

## Limites do plano gratuito
Workers: 100 mil requisições/dia. D1 cabe folgado. CoinGecko: ~8.640 chamadas/mês. Brevo: 300 e-mails/dia (cadastros e recuperações).

## Se a API de preços cair
O Worker mantém o último valor bom e marca `"stale": true` após 30 minutos; o jogo cai para a simulação.


## Anti-trapaça (o servidor é dono do jogo)

- O aparelho só **pede ações**. Preços (relógio + feed), oferta dos planetas, custo e duração de viagens, sorteios de piratas e desgaste, missões, bônus diário e patente são calculados em `motor.js`, no Worker. Editar o jogo no navegador não muda nada: a próxima resposta do servidor sobrescreve a tela.
- Não existe mais rota para o aparelho gravar o próprio progresso (`PUT /save` foi removida).
- Cada gravação usa compare-and-swap (`atualizado`): ações simultâneas de dois aparelhos nunca se corrompem.
- A chegada de uma viagem é gravada **antes** da ação seguinte: não dá para descartar um sorteio ruim mandando pedidos inválidos.
- Limite de ritmo por conta (80 ms entre ações) e limites de quantidade.
- Progressos antigos (salvos pelo aparelho, antes desta versão) são aproveitados, mas revalidados e limitados (por exemplo, no máximo 100 milhões de créditos).
- O dia do jogo (missões e bônus) segue o horário de Brasília.
- `dados.js` é gerado por `python3 tools/gerar_galaxias.py` junto com `galaxias.js`. Ao mudar galáxias, rode o script e faça deploy de novo.
- Os preços base e as regras em `motor.js` espelham as de `game.js` (usadas só quando o jogo roda sem Worker). Mantenha os dois iguais.

## Partidas (torneio e convite entre amigos)
Rotas: `GET /partida`, `POST /partida/criar | entrar | iniciar | sair | acao`. Tabelas novas: `partidas` e `partida_jog` (rode o `schema.sql` de novo: é seguro, só cria o que falta).
- A partida é um jogo à parte (estado próprio no servidor); só a taxa de entrada e o prêmio do torneio mexem nos créditos da carreira.
- O criador escolhe duração, saldo (2.000 a 10.000), galáxias, 2 a 8 jogadores, bots, eventos e piratas. Cada jogador só entra se já desbloqueou **todas** as galáxias da sala.
- Vence o maior patrimônio ao fim do tempo. Prêmio: 2 pilotos, vencedor leva tudo; 3 ou mais, 60/30/10 do bolo; sozinho contra bots, recupera a taxa na metade de cima (+25%/+50% se vencer em Normal/Difícil).
- Bots não têm estado: o patrimônio deles é uma curva calculada pelo servidor (ritmo em `ritmoReferencia`, em `motor.js`).
- O Cron (a cada 5 min) encerra partidas vencidas e cancela, com reembolso, salas esquecidas por mais de 2 h.

## Naves (50 naves em camadas)
- `naves.js` (servidor) e `../naves.js` (jogo) são gerados por `python3 tools/gerar_naves.py`: nomes, patente, preço e força de cada nave ficam numa tabela só. Ao mudar, rode o script e faça deploy dos dois lados.
- Cada nave tem níveis 1 a 5 em porão, motor e armas. Comprar nave exige a patente da nave (5 naves por patente) e créditos; trocar de nave não é possível em trânsito, em partida, nem se a carga não couber.
- Contas antigas (porão/motor/armas sem limite) viram a Nave 1; níveis acima de 5 são devolvidos em créditos.
- Ações novas: `comprarNave` ({i}) e `equipar` ({i}) em `POST /jogo/acao`.
