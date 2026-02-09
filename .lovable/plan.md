

# Workflow do Formulario (estilo Typeform)

## Visao Geral

Implementar a aba **Workflow** no editor de formularios com 4 sub-funcionalidades nativas do Typeform: **Branching** (logica condicional), **Scoring** (pontuacao), **Tagging** (etiquetas) e **Outcome Quiz** (resultados personalizados). Alem disso, um painel lateral de **Actions** com Webhooks e futuras integracoes.

---

## Funcionalidades

### 1. Branching (Logica Condicional)
Permite pular perguntas ou ir para finais diferentes com base nas respostas.
- Regras do tipo: "Se a resposta da pergunta X for Y, va para pergunta Z"
- Configuracao visual por campo: selecionar condicao e destino
- Armazenado no schema JSON da versao (`form_versions.schema`)

### 2. Scoring (Pontuacao)
Atribuir pontos a respostas de perguntas de escolha.
- Cada opcao de resposta pode ter um valor numerico
- Resultado final: soma dos pontos
- Permite mostrar finais diferentes com base em faixas de pontuacao

### 3. Tagging (Etiquetas)
Marcar respostas com tags para segmentacao.
- Tags definidas pelo criador do formulario
- Cada opcao de resposta pode ser associada a uma ou mais tags
- Tags coletadas ficam salvas no `responses.meta`

### 4. Outcome Quiz
Mostrar finais diferentes com base no perfil de respostas.
- Cada opcao de resposta e vinculada a um "outcome" (resultado)
- Ao final, o outcome mais frequente determina a tela final exibida
- Ideal para quizzes de personalidade, recomendacao de produto, etc.

### 5. Painel de Actions (lateral direito)
- **Webhooks**: CRUD de webhooks por formulario (tabela `webhooks` ja existe)
- **Connect**: placeholder para futuras integracoes (tabela `integrations` ja existe)
- **Messages**: placeholder para notificacoes por email (futuro)

---

## Arquitetura de Dados

### Schema JSON (sem migracao SQL)

Toda a logica de branching, scoring, tagging e outcomes sera armazenada dentro do campo `form_versions.schema` (JSONB), mantendo o modelo de versionamento ja existente:

```text
{
  "fields": [...],
  "logic": [
    {
      "field_id": "uuid",
      "rules": [
        {
          "condition": { "op": "equals", "value": "Sim" },
          "action": { "type": "jump_to", "target": "field_uuid_or_end" }
        }
      ],
      "default_action": { "type": "next" }
    }
  ],
  "scoring": {
    "enabled": false,
    "field_scores": {
      "field_uuid": { "Option A": 10, "Option B": 5 }
    },
    "ranges": [
      { "min": 0, "max": 50, "end_screen_id": "end_1" },
      { "min": 51, "max": 100, "end_screen_id": "end_2" }
    ]
  },
  "tagging": {
    "enabled": false,
    "tags": ["Perfil A", "Perfil B"],
    "field_tags": {
      "field_uuid": { "Option A": ["Perfil A"], "Option B": ["Perfil B"] }
    }
  },
  "outcomes": {
    "enabled": false,
    "definitions": [
      { "id": "outcome_1", "label": "Extrovertido", "end_screen_id": "end_1" },
      { "id": "outcome_2", "label": "Introvertido", "end_screen_id": "end_2" }
    ],
    "field_outcomes": {
      "field_uuid": { "Option A": "outcome_1", "Option B": "outcome_2" }
    }
  }
}
```

### Migracao SQL necessaria

Apenas para o **disparo de webhooks** ao completar um formulario:
- Criar edge function `fire-webhooks` que e chamada pelo runner ao completar uma resposta
- Usar a tabela `webhooks` ja existente

---

## Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `src/pages/FormWorkflow.tsx` | Pagina principal da aba Workflow com sub-abas |
| `src/components/workflow/WorkflowCanvas.tsx` | Visualizacao do fluxo (pipeline horizontal de campos) |
| `src/components/workflow/BranchingPanel.tsx` | Editor de regras de branching por campo |
| `src/components/workflow/ScoringPanel.tsx` | Editor de pontuacao por opcao de resposta |
| `src/components/workflow/TaggingPanel.tsx` | Editor de tags por opcao de resposta |
| `src/components/workflow/OutcomePanel.tsx` | Editor de outcomes/resultados |
| `src/components/workflow/ActionsPanel.tsx` | Painel lateral com Webhooks, Connect, Messages |
| `src/components/workflow/WebhookManager.tsx` | CRUD de webhooks |
| `supabase/functions/fire-webhooks/index.ts` | Edge function para disparar webhooks |

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/FormEditor.tsx` | Adicionar aba "Workflow" na header com navegacao |
| `src/components/form-editor/FieldItem.tsx` | Expandir `FormField` com propriedades de score/tag/outcome |
| `src/pages/FormRunner.tsx` | Integrar logica de branching, calcular score/tags/outcomes ao finalizar, chamar fire-webhooks |
| `src/App.tsx` | Adicionar rota para workflow |

---

## Detalhes Tecnicos

### Interface do Editor - Abas

O header do editor ganha abas (como no Typeform): **Content** | **Workflow** | **Share** | **Results**. A aba Workflow tera sub-abas: Branching, Scoring, Tagging, Outcome Quiz.

### WorkflowCanvas

Pipeline horizontal mostrando os campos do formulario como nodes conectados por linhas. Ao clicar em um node, abre o painel de configuracao (branching rules, scores, etc). Implementado com CSS/flex e posicoes relativas (sem lib de diagramas).

### Branching no Runner

O `FormRunner.tsx` sera atualizado para, ao receber uma resposta:
1. Verificar se existe regra de logica para o campo atual
2. Se sim, avaliar a condicao contra a resposta
3. Determinar o proximo campo (jump) ou seguir sequencialmente

### Scoring no Runner

Ao completar o formulario:
1. Calcular soma total dos pontos com base nas respostas
2. Determinar a faixa (range) correspondente
3. Redirecionar para o end_screen correto

### Fire Webhooks (Edge Function)

Quando uma resposta e completada, o runner chama a edge function que:
1. Busca webhooks habilitados para o formulario
2. Envia POST para cada URL com payload das respostas
3. Assina o payload com HMAC (usando `webhooks.secret`) no header `X-Webhook-Signature`

### Tipo FormField atualizado

```text
interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  scores?: Record<string, number>;     // pontuacao por opcao
  tags?: Record<string, string[]>;     // tags por opcao
  outcome?: Record<string, string>;    // outcome_id por opcao
}
```

### Fluxo do usuario

1. Criador abre o editor do formulario
2. Adiciona campos normalmente na aba "Content"
3. Muda para aba "Workflow"
4. Ve o pipeline visual com todos os campos
5. Clica em um campo para configurar branching, scores, tags ou outcomes
6. Configura webhooks no painel lateral de Actions
7. Salva e publica
8. Respondente preenche o formulario
9. Branching direciona o fluxo
10. Ao completar: score calculado, tags coletadas, outcome determinado, webhooks disparados

