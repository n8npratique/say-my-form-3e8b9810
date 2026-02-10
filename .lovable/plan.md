

# Testar Integracao Google Sheets com Spreadsheet ID Real

## Situacao Atual

- A integracao esta configurada no banco com um ID de teste (`test-spreadsheet-id-123`)
- A edge function `sync-google-sheets` esta deployada e funcional
- O secret `GOOGLE_SERVICE_ACCOUNT_KEY` esta configurado
- Existem 2 respostas completadas no formulario "Novo colaborador Saver"

## O Que Precisa Ser Feito

### 1. Atualizar o Spreadsheet ID via UI

Navegar ate a pagina de respostas do formulario e usar o componente GoogleSheetsIntegration para:
- Limpar o campo do Spreadsheet ID
- Inserir o ID real: `1qEZ_7Hmx4O2PdCsA_GZkwAggwFoVF9eJHV9sAERnptE`
- Clicar em "Atualizar" para salvar

### 2. Testar Sincronizacao Completa

Clicar em "Sincronizar Tudo" para exportar as 2 respostas existentes para a planilha.

### 3. Verificar Resultado

- Chamar a edge function diretamente via curl para confirmar o funcionamento
- Verificar os logs da edge function para confirmar sucesso
- Confirmar que as 2 respostas foram escritas na planilha (header + 2 linhas de dados)

## Requisito Importante

Certifique-se de que a planilha do Google Sheets foi compartilhada com o email da Service Account (com permissao de editor). Caso contrario, a API retornara erro 403.

## Detalhes Tecnicos

A edge function sera chamada com:
```text
POST /sync-google-sheets
{
  "form_id": "6b8c7f53-b471-49f3-9994-37ff625e455a",
  "sync_all": true
}
```

Isso ira limpar a aba "Respostas" e escrever o header + todas as respostas completadas.

