
# Pagina de Respostas do Formulario

## Visao Geral

Criar a pagina `/workspace/:workspaceId/form/:formId/responses` onde o dono do formulario pode visualizar todas as respostas recebidas, incluindo scores, tags e outcomes calculados pelo workflow.

---

## O que sera construido

### Pagina Principal (FormResponses)
- Header com nome do formulario, contagem de respostas e botao de voltar
- Cards de resumo: total de respostas, taxa de completude, score medio (se scoring habilitado)
- Tabela com todas as respostas mostrando:
  - Data/hora de inicio e conclusao
  - Status (em andamento / completada)
  - Email do respondente (se coletado)
  - Score (se scoring habilitado)
  - Tags (como badges coloridos)
  - Outcome (se quiz habilitado)
- Ao clicar em uma linha, abre um painel/dialog com os detalhes de todas as respostas individuais daquela submissao

### Painel de Detalhes da Resposta
- Lista campo a campo com label da pergunta e valor respondido
- Metadados: score total, tags coletadas, outcome determinado
- Horarios de inicio e conclusao

### Filtros e Ordenacao
- Filtrar por status (completada / em andamento)
- Ordenar por data (mais recente primeiro por padrao)

---

## Arquivos

### Criar
| Arquivo | Descricao |
|---------|-----------|
| `src/pages/FormResponses.tsx` | Pagina principal com tabela de respostas, cards de resumo e dialog de detalhes |

### Modificar
| Arquivo | Mudanca |
|---------|---------|
| `src/App.tsx` | Adicionar rota `/workspace/:workspaceId/form/:formId/responses` |
| `src/pages/FormEditor.tsx` | Adicionar botao "Respostas" no header |

---

## Detalhes Tecnicos

### Consultas ao banco
1. Buscar formulario: `forms` filtrado por `id` para obter nome
2. Buscar versao publicada: `form_versions` para obter schema com labels dos campos
3. Buscar respostas: `responses` filtrado por `form_id`, ordenado por `started_at desc`
4. Buscar answers: `response_answers` filtrado por `response_id` (ao abrir detalhes)

### Mapeamento de field_key para label
- O `response_answers.field_key` armazena o `field.id`
- Para mostrar o label legivel, buscar `form_versions.schema.fields` e criar um mapa `id -> label`

### Exibicao de meta (score, tags, outcome)
- `responses.meta` e JSONB contendo `score`, `score_range`, `tags[]`, `outcome_id`, `outcome_label`
- Renderizar score como numero, tags como badges, outcome como texto

### Estrutura da tabela

```text
| Data       | Status     | Email          | Score | Tags              | Outcome      |
|------------|------------|----------------|-------|-------------------|--------------|
| 10/02/2026 | Completada | user@email.com | 85    | Perfil A, Perfil B| Extrovertido |
```

### Componentes UI utilizados
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead` (ja existem)
- `Badge` para tags e status
- `Dialog` para detalhes da resposta
- `Card` para metricas de resumo
- `Skeleton` para loading states
- `Button` para navegacao
