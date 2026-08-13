# Painel CRM — Direção C (Twenty CRM dentro do Chatwoot)

Painel leve exibido dentro do Chatwoot via Dashboard Apps, mostrando dados do
Twenty CRM do contato/conversa atual. Backend em Node.js/TypeScript.

## Passo 2 — Rodar localmente

```bash
npm install
npm run build
cp .env.example .env   # edite DATABASE_URL e CHAVE_MESTRA_TOKENS
npm start
```

Confirme que subiu: `curl http://localhost:3000/health` deve devolver `{"ok":true}`.

## Passo 3 — Testar o listener de contexto (sem depender do Chatwoot ainda)

Abra `http://localhost:3000/?client=ww-assessoria&debug=1` no navegador, abra o
console de desenvolvedor, e cole isso pra simular o Chatwoot te mandando o
contexto de uma conversa:

```js
window.postMessage({ data: { contact: { phone_number: '+5511999999999', email: 'teste@exemplo.com' } } }, '*');
```

Se aparecer "Buscando no Twenty CRM..." na tela, o listener está funcionando.
O painel de debug (`?debug=1`) mostra o payload recebido — importante pra
confirmar contra o formato real que o Chatwoot manda (ver nota abaixo).

⚠️ **A forma exata do payload que o Chatwoot envia não está 100% confirmada
neste código** — o `extrairContato()` em `public/index.html` tenta os formatos
mais comuns documentados, mas só dá pra confirmar de verdade testando dentro
do Chatwoot real (passo 6) com `?debug=1` ligado e olhando o painel de debug
na tela.

## Passo 4 — Testar a busca no Twenty (precisa do Postgres real)

Com `DATABASE_URL` apontando pro `n8n-postgres-data` de verdade e uma linha
cadastrada em `client_config` para `ww-assessoria` (token cifrado com a mesma
`CHAVE_MESTRA_TOKENS`), teste direto:

```bash
curl "http://localhost:3000/api/contact?client=ww-assessoria&phone=5511999999999"
```

Deve devolver nome, etapa do funil e link do contato — ou um erro claro
(cliente não encontrado / contato não encontrado) se algo estiver errado.

## Passo 5 — Registrar no Chatwoot

Settings → Integrations → Dashboard Apps → Configurar → adicionar:
- Nome: "Twenty CRM"
- URL: `https://painel-crm.SEU_DOMINIO/?client=ww-assessoria`

## Passo 6 — Publicar com HTTPS na VPS

```bash
docker build -t painel-crm .
docker run -d --name painel-crm --network n8n-data --env-file .env -p 3000:3000 painel-crm
```

Depois configure um Proxy Host novo no Nginx Proxy Manager apontando pro
container (mesmo padrão dos outros serviços: domínio + Let's Encrypt), e
teste abrindo uma conversa real no Chatwoot pra ver o painel carregar.
