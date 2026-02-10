

# Integracao Google Sheets em Tempo Real

## Visao Geral

Quando um respondente completar um formulario, a resposta sera automaticamente adicionada como uma nova linha em uma planilha do Google Sheets configurada pelo dono do formulario. O dono tambem podera exportar todas as respostas existentes de uma vez.

---

## Como Funciona

1. O dono do formulario vai na pagina de Respostas e clica em "Conectar Google Sheets"
2. Informa o **ID da planilha** e faz upload de um arquivo JSON de **Service Account** do Google
3. A partir desse momento, cada nova resposta completada e automaticamente adicionada como linha na planilha
4. Um botao "Sincronizar Tudo" permite exportar todas as respostas existentes de uma vez

---

## Passo a Passo para o Usuario

Para usar a integracao, o usuario precisara:

1. Criar um projeto no Google Cloud Console (console.cloud.google.com)
2. Ativar a API do Google Sheets
3. Criar uma Service Account e baixar o arquivo JSON de credenciais
4. Compartilhar a planilha do Google Sheets com o email da Service Account (com permissao de editor)
5. Copiar o ID da planilha (parte da URL entre `/d/` e `/edit`)

---

## Arquivos

### Criar
| Arquivo | Descricao |
|---------|-----------|
| `supabase/functions/sync-google-sheets/index.ts` | Edge function que recebe dados de resposta e adiciona linha na planilha via Google Sheets API |
| `src/components/responses/GoogleSheetsIntegration.tsx` | Componente de UI para configurar a integracao (spreadsheet ID, status, botoes) |

### Modificar
| Arquivo | Mudanca |
|---------|---------|
| `src/pages/FormResponses.tsx` | Adicionar o componente GoogleSheetsIntegration no header ou abaixo dos cards |
| `src/pages/FormRunner.tsx` | Apos completar resposta, chamar a edge function sync-google-sheets alem do fire-webhooks |
| `supabase/config.toml` | Adicionar configuracao da nova edge function com verify_jwt = false |

### Banco de Dados
- Usar a tabela `integrations` ja existente (form_id, type='google_sheets', config JSONB)
- O campo `config` armazenara: `{ spreadsheet_id: string, sheet_name: string }`

### Secret
- Sera necessario armazenar a chave da Service Account como um secret (`GOOGLE_SERVICE_ACCOUNT_KEY`)

---

## Detalhes Tecnicos

### Edge Function: sync-google-sheets

Recebe via POST:
```text
{
  "form_id": "uuid",
  "response_id": "uuid",   // para sincronizar uma resposta
  "sync_all": false         // se true, sincroniza todas as respostas
}
```

Fluxo:
1. Buscar integracao google_sheets da tabela `integrations` pelo form_id
2. Buscar schema do formulario (form_versions) para montar os headers
3. Buscar a resposta (ou todas, se sync_all) com seus answers
4. Autenticar na Google Sheets API usando Service Account JWT
5. Se primeira vez ou sync_all: criar/limpar sheet e adicionar header
6. Adicionar linha(s) com os dados via `spreadsheets.values.append`

### Autenticacao Google (Service Account JWT)

A edge function ira:
1. Ler o secret `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON da service account)
2. Gerar um JWT assinado com RS256 usando a chave privada
3. Trocar o JWT por um access_token via `https://oauth2.googleapis.com/token`
4. Usar o access_token para chamar a API do Google Sheets

### Colunas da Planilha

Mesma estrutura do CSV:
```text
Data | Status | Email | Score | Tags | Outcome | Campo1 | Campo2 | ...
```

### Componente GoogleSheetsIntegration

- Mostra status da integracao (conectado/desconectado)
- Campo para informar o Spreadsheet ID
- Campo para nome da aba (sheet name, padrao "Respostas")
- Botao "Conectar" para salvar na tabela integrations
- Botao "Sincronizar Tudo" para exportar respostas existentes
- Indicador visual de sincronizacao em andamento

### Trigger em Tempo Real (FormRunner)

Apos completar a resposta e chamar fire-webhooks, chamar tambem:
```text
supabase.functions.invoke("sync-google-sheets", {
  body: { form_id, response_id }
})
```
Chamada best-effort (nao bloqueia a conclusao do formulario).

### Migracao de Banco

Nenhuma migracao necessaria - a tabela `integrations` ja existe com a estrutura adequada (form_id, type, config).

