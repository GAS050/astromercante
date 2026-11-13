# Roteiro de publicação para testes (sem domínio próprio)

Tempo estimado: 40 a 60 minutos. Você precisa de: conta gratuita na Cloudflare, Node 18+ instalado e o zip `astromercante-publicar.zip`.

## Etapa 1: Worker (preços, contas e nuvem)
Na pasta `worker` do projeto:
```bash
npx wrangler login
npx wrangler kv namespace create PRECOS        # copie o "id" para [[kv_namespaces]] no wrangler.toml
npx wrangler d1 create astromercante              # copie o "database_id" para [[d1_databases]] no wrangler.toml
npx wrangler d1 execute astromercante --remote --file=schema.sql
npx wrangler secret put COINGECKO_KEY          # opcional (chave Demo gratuita da CoinGecko)
npx wrangler deploy                            # envia index.js, motor.js, dados.js e naves.js juntos. Anote a URL: https://astromercante-precos.SEU-USUARIO.workers.dev
```
Teste: abra `SUA-URL/precos` no navegador. Deve aparecer um JSON com btc, gold, eth e fx.

## Etapa 2: o jogo no Cloudflare Pages
1. Descompacte o zip e abra `config.js`. Cole a URL do Worker (sem `/precos`) em `PRECOS_URL`.
2. Painel da Cloudflare → Workers & Pages → Create → Pages → Upload assets. Dê um nome ao projeto (ex.: `astromercante-teste`) e arraste a pasta descompactada.
3. Anote o endereço: `https://astromercante-teste.pages.dev`.
4. Abra no celular. Deve aparecer a tela de login.

## Etapa 3: login com Google (caminho mais simples para testar)
1. Google Cloud Console → crie um projeto → *APIs e serviços* → *Tela de permissão OAuth*. Tipo "Externo".
2. Em modo de teste, só entram as contas que você adicionar em *Usuários de teste* (até 100). Adicione o seu Gmail e o de quem for testar.
3. *Credenciais* → *Criar credenciais* → *ID do cliente OAuth* → tipo "Aplicativo da Web". Em *Origens JavaScript autorizadas*, coloque o endereço do Pages.
4. Copie o ID do cliente e cole em dois lugares: `GOOGLE_CLIENT_ID` no `wrangler.toml` e `GOOGLE_CLIENT_ID` no `config.js`.
5. Rode `npx wrangler deploy` de novo (na pasta `worker`) e reenvie a pasta do jogo ao Pages.

## Etapa 4 (opcional): e-mail de teste pela Brevo com o seu Gmail
Serve só para você e poucos amigos; os e-mails podem cair no spam.
1. Crie conta gratuita na Brevo. Gere uma chave em *SMTP & API → API Keys*.
2. Em *Senders*, adicione o seu Gmail como remetente e confirme pelo e-mail que a Brevo enviar.
3. `npx wrangler secret put BREVO_KEY` e, no `wrangler.toml`, `EMAIL_REMETENTE = "seu-gmail@gmail.com"`. Rode `npx wrangler deploy`.
4. A Brevo pode pedir aprovação da conta antes de liberar os envios.

## Etapa 5: trancar o Worker ao seu jogo
No `wrangler.toml`, troque `ALLOWED_ORIGIN = "*"` pelo endereço do Pages e rode `npx wrangler deploy`.

## Checklist de testes
- [ ] O indicador do topo mostra "Dados reais".
- [ ] Criar conta (por Google ou por e-mail) e entrar.
- [ ] Abrir o jogo em dois aparelhos: os preços do mesmo recurso devem ser quase iguais.
- [ ] Comprar algo, esperar ~20 s, abrir a conta em outro aparelho: o progresso deve aparecer.
- [ ] "Esqueci minha senha" (se usou e-mail).
- [ ] Sair e entrar de novo. Excluir conta em Configurações.

## Se algo der errado
| Sintoma | Causa provável |
|---|---|
| Indicador em "Simulação" | URL errada no `config.js`, ou `ALLOWED_ORIGIN` diferente do endereço do jogo (veja F12 → Rede) |
| Erro 1102 ao criar conta ou entrar | Limite de CPU do plano gratuito: reduza `PBKDF2_ITER` ou use o plano pago |
| "Envio de e-mail não configurado" | Falta `BREVO_KEY` (etapa 4). Use o Google nos testes |
| Botão do Google não aparece | `GOOGLE_CLIENT_ID` vazio no `config.js` ou origem não autorizada |
| Google recusa o login | Seu Gmail não está na lista de usuários de teste |
| Código não chega | Veja o spam; remetente não validado na Brevo |


## Atualização: partidas
Depois de enviar os arquivos novos, rode de novo `npx wrangler d1 execute astromercante --remote --file=schema.sql` (cria as tabelas das partidas) e `npx wrangler deploy`. No site, publique também o novo arquivo `partidas.js`.

## Publicar o site com muitos arquivos (naves)
O envio pelo painel do Cloudflare aceita no máximo 1.000 arquivos, e o jogo agora tem mais de 1.000 imagens. Use o Wrangler (aceita 20.000):
1. Extraia o `astromercante-publicar.zip` numa pasta e coloque nela o seu `config.js` preenchido (o do zip vai vazio).
2. Nessa pasta, rode `npx wrangler deploy`. Ele usa o `wrangler.jsonc` incluído (nome `astromercante`, o mesmo do seu site) e envia tudo, ignorando os arquivos listados em `.assetsignore`.
