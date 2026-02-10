

# Prevenção de Cadastros Duplicados

## Resumo
Adicionar na tela de Respostas uma configuracao para bloquear respostas duplicadas com base em nome, celular ou email. Por padrao, duplicados NAO serao aceitos. A validacao sera feita no momento do envio do formulario (FormRunner).

## Como funciona

1. **Configuracao na tela de Respostas**: Um card/secao com toggles para ativar/desativar a prevencao de duplicados e escolher por quais campos validar (nome, celular, email). Por padrao, todos marcados e prevencao ativada.

2. **Armazenamento**: A configuracao sera salva no campo `settings` (JSONB) da tabela `forms`, sem necessidade de migracoes. Exemplo:
   ```json
   {
     "dedup": {
       "enabled": true,
       "fields": ["email", "phone", "name"]
     }
   }
   ```

3. **Validacao no FormRunner**: Antes de criar a resposta (ou ao completar), o sistema consulta respostas anteriores do mesmo formulario para verificar se ja existe um registro com o mesmo email, telefone ou nome, conforme configurado.

## Detalhes Tecnicos

### Arquivo 1: `src/pages/FormResponses.tsx`
- Adicionar um card entre os filtros e a tabela com:
  - Switch "Bloquear respostas duplicadas" (ligado por padrao)
  - Checkboxes para selecionar quais campos validar: Email, Celular, Nome
  - Salvar automaticamente no `forms.settings.dedup` ao alterar
- Carregar a configuracao atual no `fetchData` (ja busca `settings` via `forms`)

### Arquivo 2: `src/pages/FormRunner.tsx`
- Ao carregar o formulario, ler `settings.dedup` 
- Criar uma edge function `check-duplicate` (ou fazer a verificacao client-side via query nas `response_answers`) que:
  - Recebe `form_id` + campo (email/phone/name) + valor
  - Consulta `responses` + `response_answers` para verificar se ja existe resposta completada com o mesmo valor
  - Retorna `{ isDuplicate: true/false }`
- No fluxo de `completeForm`, antes de marcar como completado, verificar duplicidade
- Se duplicado encontrado, exibir mensagem de erro ao usuario ("Ja recebemos uma resposta com este email/telefone/nome")

### Abordagem de verificacao (client-side via Supabase query)
- Como as `response_answers` ja possuem RLS permitindo leitura para membros do workspace, a verificacao de duplicidade sera feita via uma edge function com service role key para evitar problemas de permissao (respondentes anonimos nao tem acesso de leitura)
- A edge function `check-duplicate` recebera `form_id`, `field_key`, `value` e consultara se existe resposta completada com aquele valor

### Arquivo 3: `supabase/functions/check-duplicate/index.ts` (novo)
- Edge function que:
  - Recebe `{ form_id, checks: [{ field_key, value }] }`
  - Usa service role para consultar `response_answers` + `responses` (status = completed)
  - Retorna `{ duplicate: true, field: "email" }` ou `{ duplicate: false }`

### Arquivos modificados:
| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/FormResponses.tsx` | Card de configuracao de duplicados |
| `src/pages/FormRunner.tsx` | Verificacao antes de completar |
| `supabase/functions/check-duplicate/index.ts` | Nova edge function |

