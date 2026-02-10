
# Painel de Gerenciamento Google Sheets

## Objetivo

Criar um painel completo para gerenciar a integracao com Google Sheets, incluindo:
1. Cadastro/gerenciamento de Service Accounts do Google
2. Mapeamento de formularios para planilhas externas
3. Tabela visual mostrando o estado de sincronizacao de cada formulario

## Mudancas no Banco de Dados

### Nova tabela: `google_service_accounts`
Armazenar multiplas Service Accounts no nivel do workspace (em vez de depender de um unico secret global).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | Identificador |
| workspace_id | uuid (FK -> workspaces) | Workspace dona |
| name | text | Nome amigavel (ex: "Conta Principal") |
| client_email | text | Email da service account (extraido do JSON) |
| encrypted_key | text | JSON completo da chave (armazenado como texto) |
| created_at | timestamptz | Data de criacao |

RLS: Somente owner/admin do workspace podem gerenciar.

### Alteracao na tabela `integrations`
Adicionar coluna `service_account_id` (uuid, nullable, FK -> google_service_accounts) para vincular cada integracao a uma Service Account especifica. Quando null, usa o secret global como fallback.

Adicionar coluna `last_synced_at` (timestamptz, nullable) para registrar a ultima sincronizacao.

## Novos Componentes

### 1. `ServiceAccountManager` (novo componente)
Painel para cadastrar e listar Service Accounts do workspace:
- Formulario para colar o JSON da chave e dar um nome amigavel
- Ao salvar, extrai automaticamente o `client_email` do JSON
- Lista de contas cadastradas com opcao de remover
- Indicador visual de qual conta esta sendo usada

### 2. `GoogleSheetsPanel` (evolucao do GoogleSheetsIntegration)
Painel expandido que substitui o componente atual, com:
- Seletor de Service Account (dropdown das contas cadastradas no workspace)
- Campo do Spreadsheet ID
- Campo do nome da aba
- Botao de sincronizar tudo
- Indicador de ultima sincronizacao (`last_synced_at`)

### 3. `SheetsIntegrationTable` (novo componente)
Tabela que mostra todos os formularios do workspace com suas integracoes Google Sheets:
- Colunas: Nome do formulario, Spreadsheet ID, Aba, Ultima sincronizacao, Status, Acoes
- Permite ver rapidamente quais formularios estao conectados e quais nao
- Botao de sincronizar individual por linha

### 4. Nova pagina: `WorkspaceIntegrations`
Pagina acessivel a partir do workspace que agrega:
- `ServiceAccountManager` no topo
- `SheetsIntegrationTable` abaixo
- Rota: `/workspace/:workspaceId/integrations`

## Alteracao na Edge Function

Atualizar `sync-google-sheets` para:
- Verificar se a integracao tem um `service_account_id` configurado
- Se sim, buscar a chave da tabela `google_service_accounts`
- Se nao, usar o secret global `GOOGLE_SERVICE_ACCOUNT_KEY` como fallback
- Atualizar `last_synced_at` na tabela `integrations` apos sincronizacao bem-sucedida

## Alteracoes no Router

Adicionar nova rota protegida:
```text
/workspace/:workspaceId/integrations -> WorkspaceIntegrations
```

Adicionar link de navegacao no workspace para acessar o painel de integracoes.

## Detalhes Tecnicos

### Seguranca
- As chaves das Service Accounts ficam armazenadas na tabela `google_service_accounts` com RLS restrito a owner/admin
- A edge function usa `SUPABASE_SERVICE_ROLE_KEY` para acessar as chaves, bypassing RLS
- O componente frontend nunca exibe a chave completa, apenas o `client_email`

### Fluxo de dados
```text
Usuario cadastra SA -> Salva na tabela google_service_accounts
Usuario configura integracao -> Vincula SA + Spreadsheet ID na tabela integrations  
Sync dispara -> Edge function busca SA key -> Autentica no Google -> Escreve na planilha
```

### Arquivos a criar/modificar
- `src/components/integrations/ServiceAccountManager.tsx` (novo)
- `src/components/integrations/SheetsIntegrationTable.tsx` (novo)
- `src/pages/WorkspaceIntegrations.tsx` (novo)
- `src/components/responses/GoogleSheetsIntegration.tsx` (atualizar)
- `supabase/functions/sync-google-sheets/index.ts` (atualizar)
- `src/App.tsx` (adicionar rota)
- Migracao SQL para nova tabela e colunas
