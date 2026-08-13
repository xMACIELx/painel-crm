# CLAUDE.md — painel-crm

Contexto persistente do projeto pra qualquer sessão do Claude Code que abrir
este repositório. Leia isto antes de propor mudanças de arquitetura.

## O que é este projeto

Painel leve embutido no Chatwoot via **Dashboard Apps**, mostrando dados do
Twenty CRM do contato/conversa atual. É a "Direção C" da integração CRM ↔
Atendimento do projeto W&W Assessoria (cliente de consultoria de cidadania
europeia) — decidida em vez de embutir o Chatwoot dentro do Twenty (Direção
A, adiada pra quando o framework de Apps do Twenty amadurecer).

Faz parte de uma stack maior, multi-cliente, self-hosted numa VPS única
(Hostinger, `srv1885364.hstgr.cloud`): Twenty CRM, Evolution API (WhatsApp
oficial), Chatwoot, n8n, Postgres compartilhado, tudo em Docker + Nginx
Proxy Manager + Coolify.

## Regras de arquitetura — não violar sem discutir antes

1. **Nunca tocar no código-fonte ou banco interno de ferramentas de
   terceiros** (Twenty, Chatwoot). Toda integração é via API pública com
   token — nunca acesso direto a banco de dados interno de outro sistema, e
   nunca fork/modificação do código deles. Motivo: quebra em atualização, e
   entra em zona cinzenta de licença (Twenty é AGPL-3.0).

2. **Multi-tenant por linha de tabela, nunca por duplicação de
   workflow/serviço.** Cliente novo = nova linha em `client_config`, nunca
   um novo repositório, workflow ou variável de ambiente por cliente. Isso é
   o requisito de negócio mais importante do projeto — o Pedro está
   construindo uma stack reutilizável pra múltiplos clientes, não uma
   solução one-off pro W&W.

3. **Segredos nunca em texto puro em lugar nenhum**: nem no código, nem no
   `.env` versionado (está no `.gitignore`), nem na tabela do banco. O token
   de API de cada cliente fica cifrado em `client_config.crm_api_token_enc`
   via `pgcrypto` (`pgp_sym_encrypt`/`pgp_sym_decrypt`), com uma única chave
   mestra (`CHAVE_MESTRA_TOKENS`) guardada como variável de ambiente — nunca
   commitada, nunca hardcoded.

4. **Sem estado onde dá pra calcular.** Preferir lógica derivada de data /
   consulta em tempo real a contadores salvos que podem travar numa falha
   de execução (mesmo princípio usado no motor de e-mail Compasso, projeto
   irmão deste).

## Schema do Postgres compartilhado (`n8n-postgres-data`, banco `n8n_data`)

Tabela relevante pra este projeto:

```sql
client_config (
  client_id TEXT PRIMARY KEY,
  ativo BOOLEAN NOT NULL DEFAULT true,
  compasso_inicio DATE NOT NULL,           -- usado pelo motor de e-mail, não por este painel
  crm_base_url TEXT NOT NULL,              -- ex: https://twenty.srv1885364.hstgr.cloud
  crm_api_token_enc BYTEA NOT NULL,        -- cifrado via pgcrypto
  ses_from_email TEXT NOT NULL,            -- usado pelo motor de e-mail, não por este painel
  ses_from_name TEXT NOT NULL,
  ses_configuration_set TEXT,
  batch_size INTEGER NOT NULL DEFAULT 10,
  throttle_ms INTEGER NOT NULL DEFAULT 2000
)
```

Este projeto só lê `client_id`, `ativo`, `crm_base_url` e `crm_api_token_enc`
dessa tabela — os campos de SES/Compasso pertencem ao serviço irmão (motor
de disparo de e-mail), não usar aqui.

## API do Twenty CRM — o que já foi validado

- Self-hosted, API REST em `{crm_base_url}/rest/...`, autenticação Bearer
  token (chave gerada em Settings → API & Webhooks no próprio Twenty).
- `/rest/people` — pessoas/contatos. Tem `name.firstName`/`lastName`,
  `emails.primaryEmail`, `phones.primaryPhoneNumber`.
- `/rest/opportunities` — oportunidades/deals. Tem `stage` (etapa do
  funil), `closeDate`, `amount`, e uma relação `pointOfContact` que aponta
  pra uma pessoa.
- **Importante**: etapa do funil NÃO existe no objeto Person. Fica em
  Opportunities, relacionada via `pointOfContact`. Erro já cometido uma vez
  neste projeto — não repetir.
- A sintaxe exata de operador de filtro da API (`filter=...`) ainda não foi
  confirmada ao vivo no playground embutido do Twenty. Por enquanto, a busca
  traz a lista (`?limit=500`) e filtra no lado do cliente (JS), o que é
  aceitável pro volume atual (algumas centenas de contatos). Se o volume
  crescer muito, otimizar pra filtro nativo — mas confirmar a sintaxe no
  playground antes de mudar.

## Chatwoot Dashboard Apps

- A forma exata do payload que o Chatwoot manda via `postMessage` **não
  está 100% confirmada** — `public/index.html` tenta os formatos mais
  documentados, mas só a validação ao vivo dentro do Chatwoot (com
  `?debug=1` na URL do painel) confirma de verdade.
- A URL registrada no Chatwoot inclui o `client_id` como query string:
  `https://painel-crm.srv1885364.hstgr.cloud/?client=ww-assessoria`.

## Deploy

- Coolify (mesma VPS), conectado à rede Docker `n8n-data` (Destination) pra
  alcançar `n8n-postgres-data` pelo nome.
- Build via **Dockerfile** (não Nixpacks — o projeto tem uma pasta
  `public/` que precisa ser copiada, e o Nixpacks não foi configurado pra
  isso).
- HTTPS/domínio pelo **Nginx Proxy Manager** (não pelo proxy interno do
  Coolify) — mesmo padrão usado por todos os outros serviços da VPS.
  Domínio: `painel-crm.srv1885364.hstgr.cloud`.
- Variáveis de ambiente ficam só na UI do Coolify: `DATABASE_URL`,
  `CHAVE_MESTRA_TOKENS`, `PORT`. Nunca em `.env` versionado.

## Convenções de código

- TypeScript, comentários e nomes de variável em português (convenção já
  estabelecida no projeto).
- Erros tratados de forma que uma falha parcial (ex: busca de oportunidade)
  não derruba a resposta inteira — degrada graciosamente.
