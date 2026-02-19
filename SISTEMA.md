# TecForms — Documentação do Sistema

> Documento gerado automaticamente em 19/02/2026  
> Descreve todas as funcionalidades implementadas, a arquitetura e as decisões técnicas do projeto.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Estrutura de Rotas](#3-estrutura-de-rotas)
4. [Banco de Dados](#4-banco-de-dados)
5. [Autenticação e Workspaces](#5-autenticação-e-workspaces)
6. [Editor de Formulários](#6-editor-de-formulários)
7. [Tipos de Campo](#7-tipos-de-campo)
8. [Aparência e Temas](#8-aparência-e-temas)
9. [Tela de Boas-vindas](#9-tela-de-boas-vindas)
10. [Publicação e Compartilhamento](#10-publicação-e-compartilhamento)
11. [Runner (Respondente)](#11-runner-respondente)
12. [Lógica Condicional (Branching)](#12-lógica-condicional-branching)
13. [Workflow](#13-workflow)
14. [Respostas e Analytics](#14-respostas-e-analytics)
15. [Prevenção de Duplicados](#15-prevenção-de-duplicados)
16. [Webhooks](#16-webhooks)
17. [Edge Functions](#17-edge-functions)
18. [Armazenamento de Arquivos](#18-armazenamento-de-arquivos)
19. [Fluxo Completo de uma Resposta](#19-fluxo-completo-de-uma-resposta)
20. [Segurança e RLS](#20-segurança-e-rls)

---

## 1. Visão Geral

O **TecForms** é uma plataforma SaaS de criação e gerenciamento de formulários interativos. Permite que usuários autenticados criem formulários com lógica condicional, temas visuais personalizados, automações pós-resposta (scoring, tagging, outcomes, webhooks, e-mails) e visualização analítica de resultados.

Formulários publicados são acessados por respondentes via URL pública (`/f/:slug`), sem necessidade de autenticação.

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Tailwind CSS + shadcn/ui |
| Animações | Framer Motion |
| Roteamento | React Router DOM v6 |
| Estado/Query | TanStack React Query |
| Backend | Lovable Cloud (Supabase) |
| Banco de Dados | PostgreSQL (via Supabase) |
| Autenticação | Supabase Auth (email/senha) |
| Storage | Supabase Storage (bucket `form-assets`) |
| Edge Functions | Deno (Supabase Edge Functions) |

---

## 3. Estrutura de Rotas

```
/                          → Landing page (Index)
/auth                      → Login / Cadastro
/dashboard                 → Lista de Workspaces (protegida)
/workspace/:id             → Formulários do Workspace (protegida)
/workspace/:id/form/:id/edit       → Editor de Formulário (protegida)
/workspace/:id/form/:id/workflow   → Workflow / Automações (protegida)
/workspace/:id/form/:id/responses  → Respostas e Analytics (protegida)
/f/:slug                   → Runner público do formulário
```

Rotas protegidas usam o componente `<ProtectedRoute>` que verifica a sessão do Supabase Auth e redireciona para `/auth` se não autenticado.

---

## 4. Banco de Dados

### Tabelas principais

#### `workspaces`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| name | TEXT | Nome do workspace |
| owner_id | UUID | ID do usuário dono |
| created_at | TIMESTAMPTZ | Data de criação |

#### `workspace_members`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| workspace_id | UUID | FK → workspaces |
| user_id | UUID | ID do membro |
| role | app_role | owner / admin / editor / viewer |

#### `forms`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| workspace_id | UUID | FK → workspaces |
| name | TEXT | Nome do formulário |
| slug | TEXT | URL pública única |
| status | TEXT | draft / published |
| published_version_id | UUID | FK → form_versions |
| settings | JSONB | Configurações extras (access_mode, dedup...) |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### `form_versions`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| form_id | UUID | FK → forms |
| version_number | INT | Número incremental |
| schema | JSONB | Schema completo (campos, tema, workflow...) |

> O schema JSONB é a fonte da verdade de todo o conteúdo do formulário: campos, tema, lógica, scoring, tagging, outcomes, e-mails.

#### `responses`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| form_id | UUID | FK → forms |
| form_version_id | UUID | Versão respondida |
| status | TEXT | in_progress / completed |
| session_token | UUID | Token para segurança anônima |
| meta | JSONB | score, tags, outcome_label, email do respondente |
| started_at | TIMESTAMPTZ | Início |
| completed_at | TIMESTAMPTZ | Conclusão |

#### `response_answers`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| response_id | UUID | FK → responses |
| field_key | UUID | ID do campo |
| value | JSONB | Valor bruto |
| value_text | TEXT | Valor normalizado (texto) |

#### `webhooks`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| form_id | UUID | FK → forms |
| url | TEXT | Endpoint de destino |
| events | JSONB | Eventos assinados (response.started, response.completed) |
| is_enabled | BOOLEAN | Ativo/inativo |
| secret | TEXT | Segredo para HMAC |

#### `profiles`
Armazena dados extras do usuário (nome, avatar).

#### `google_service_accounts` / `integrations`
Suporte a integrações com Google (Sheets, etc).

---

## 5. Autenticação e Workspaces

- Autenticação via **email e senha** (Supabase Auth).
- Ao logar, usuário é redirecionado ao **Dashboard** onde vê seus Workspaces.
- Cada Workspace é um ambiente isolado com seus próprios formulários e membros.
- Funções SQL auxiliares controlam permissões:
  - `can_edit_in_workspace(_workspace_id)` — pode editar?
  - `can_manage_workspace(_workspace_id)` — pode gerenciar?
  - `get_workspace_role(_workspace_id)` — retorna o papel do usuário

---

## 6. Editor de Formulários

**Arquivo:** `src/pages/FormEditor.tsx`

Interface de três colunas:
1. **Header** — nome do formulário, atalhos (Respostas, Workflow, Preview, Aparência, Compartilhar, Publicar, Salvar)
2. **Painel esquerdo** — lista de campos com drag-and-drop para reordenar
3. **Painel direito** — configuração do campo selecionado (`FieldConfigPanel`)

### Funcionalidades do editor

- **Adicionar campo** — Dialog com todos os tipos disponíveis agrupados por categoria
- **Reordenar campos** — Drag and drop nativo com indicador visual de posição
- **Editar campo** — Painel lateral com todas as opções do tipo selecionado
- **Deletar campo** — Botão na lista; limpa seleção se era o campo ativo
- **Salvar** — Merge do schema atual com campos e tema; preserva dados de workflow
- **Publicar** — Gera slug único (nome + random), salva versão, atualiza `published_version_id`
- **Preview** — Abre `/f/:slug` em nova aba

### Persistência do schema

O schema é um objeto JSONB na tabela `form_versions` com a seguinte estrutura:

```json
{
  "fields": [...],
  "theme": { ... },
  "logic": [...],
  "scoring": { ... },
  "tagging": { ... },
  "outcomes": { ... },
  "email_templates": [...]
}
```

Ao salvar, o sistema faz **merge** com o schema existente para não sobrescrever dados de workflow ao salvar apenas campos, e vice-versa.

---

## 7. Tipos de Campo

**Arquivo:** `src/config/fieldTypes.ts`

### Informações de Contato
| Tipo | Label |
|------|-------|
| `contact_info` | Informações de contato (bloco com nome, email, telefone) |
| `email` | E-mail |
| `phone` | Número de telefone (com seleção de país) |
| `address` | Endereço |
| `website` | Site |

### Texto
| Tipo | Label |
|------|-------|
| `short_text` | Texto curto |
| `long_text` | Texto longo |
| `statement` | Declaração (exibe texto, sem input) |

### Escolha
| Tipo | Label |
|------|-------|
| `multiple_choice` | Múltipla escolha |
| `dropdown` | Suspenso |
| `image_choice` | Escolha com imagem |
| `yes_no` | Sim/Não |
| `legal` | Jurídico (aceite de termos) |
| `checkbox` | Caixas de seleção |

### Classificação e Avaliação
| Tipo | Label |
|------|-------|
| `nps` | Net Promoter Score (0–10) |
| `opinion_scale` | Escala de opinião (1–10 configurável) |
| `rating` | Avaliação com estrelas (1–5) |
| `ranking` | Classificação por arrastar |
| `matrix` | Matriz de opções |

### Outros
| Tipo | Label |
|------|-------|
| `number` | Número |
| `date` | Data |
| `file_upload` | Envio de arquivo |
| `welcome_screen` | Tela de boas-vindas |
| `end_screen` | Tela final |
| `question_group` | Grupo de perguntas |
| `redirect_url` | Redirecionamento para URL |

---

## 8. Aparência e Temas

**Arquivo:** `src/lib/formTheme.ts`  
**Editor:** `src/components/form-editor/ThemePanel.tsx`  
**Componente picker de fundo:** `src/components/form-editor/BackgroundPicker.tsx`

### Interface `FormTheme`

```typescript
interface FormTheme {
  background_color: string;    // Cor sólida ou gradiente CSS
  text_color: string;
  text_secondary_color: string;
  button_color: string;
  button_text_color: string;
  font_family: string;          // Inter, Poppins, Lora, Roboto, etc.
  font_size?: number;           // px (12–24)
  font_weight?: "normal" | "bold";
  font_style?: "normal" | "italic";
  background_image?: string;    // URL
  background_size?: "cover" | "contain" | "repeat";
  background_overlay?: number;  // 0–1 (opacidade de overlay escuro)
  welcome_screen?: WelcomeScreen;
}
```

### Paletas pré-definidas (8 no total)
Clássico, Oceano, Floresta, Sunset, Noturno, Coral, Minimalista, Gradiente.

### Fontes disponíveis
Inter, Space Grotesk, Poppins, Roboto, Lora, Playfair Display — carregadas dinamicamente do Google Fonts.

### Imagem de fundo
- Upload via bucket `form-assets` (pasta `backgrounds/`)
- URL externa colável
- Controle de tamanho: cover / contain / repeat
- Overlay escuro ajustável por slider (0%–80%)

---

## 9. Tela de Boas-vindas

**Interface:** `src/lib/formTheme.ts` → `WelcomeScreen`  
**Editor:** aba "Boas-vindas" no `ThemePanel`  
**Runtime:** `src/components/form-runner/WelcomeScreen.tsx`

### Interface `WelcomeScreen`

```typescript
interface WelcomeScreen {
  enabled: boolean;
  title?: string;
  description?: string;
  button_text?: string;
  logo_url?: string;       // Imagem introdutória acima do título
  image_url?: string;      // Imagem de fundo exclusiva desta tela
  image_size?: "cover" | "contain" | "repeat";
  image_overlay?: number;
}
```

### Campos configuráveis (aba "Boas-vindas")

| Campo | Descrição |
|-------|-----------|
| Ativar/desativar | Switch principal |
| **Imagem / Logo** | Upload local (bucket `form-assets/logos/`) ou URL externa; preview com botão remover |
| Título | Texto principal exibido em destaque |
| Descrição | Subtítulo descritivo |
| Texto do botão | Label do CTA (padrão: "Começar") |
| Imagem de fundo | Background exclusivo da tela de boas-vindas |

### Renderização no runtime

A imagem/logo é exibida **acima do título** com:
- Animação de entrada (`opacity: 0 → 1`, `scale: 0.9 → 1`)
- `max-h-40 max-w-xs object-contain rounded-lg mx-auto`
- Independente da imagem de fundo (que fica na camada posterior)

---

## 10. Publicação e Compartilhamento

- **Slug** gerado automaticamente: `nome-do-formulario-XXXXXX` (sufixo aleatório de 6 chars para unicidade)
- Formulário publicado → `status = "published"`, `published_version_id` aponta para a versão mais recente
- **Modos de acesso** (salvo em `forms.settings.access_mode`):
  - `public` — qualquer pessoa com o link pode responder
  - `email_required` — respondente deve informar e-mail antes de iniciar (`EmailGate`)
- **Dialog de compartilhamento** (`ShareDialog`) exibe a URL pública e botão de cópia

---

## 11. Runner (Respondente)

**Arquivo:** `src/pages/FormRunner.tsx`  
**URL:** `/f/:slug`

### Fluxo de exibição

```
Carregando → (email_required? → EmailGate) → (welcome_screen? → WelcomeScreen) → Campos → Conclusão
```

### Comportamento

1. Carrega o formulário pelo slug (apenas `published`)
2. Lê schema da versão publicada (campos, tema, lógica, scoring, tagging, outcomes)
3. Cria registro `response` com status `in_progress` ao iniciar
4. Exibe campos um por um com animação (`AnimatePresence`)
5. Salva cada resposta em `response_answers` imediatamente ao avançar
6. Avalia lógica condicional para decidir o próximo campo
7. Ao concluir:
   - Calcula score (se configurado)
   - Coleta tags (se configurado)
   - Determina outcome (se configurado)
   - Verifica duplicados (se configurado)
   - Atualiza `response` para `completed` com `meta` preenchido
   - Dispara webhooks (`response.completed`)
8. Exibe tela de conclusão com score (se houver) ou outcome

### Progresso visual
Barra de progresso no topo (`Progress`) calculada por `(campos respondidos / total de campos) * 100`.

---

## 12. Lógica Condicional (Branching)

**Arquivo:** `src/lib/logicEngine.ts`  
**Editor:** `src/components/workflow/BranchingPanel.tsx`

Permite que a resposta de um campo determine **qual campo exibir a seguir** (ou encerrar o formulário).

### Estrutura de uma regra

```typescript
interface FieldLogic {
  field_id: string;       // Campo que dispara a lógica
  conditions: Condition[];
  action: "jump" | "end";
  target_field_id?: string;
  operator: "AND" | "OR";
}

interface Condition {
  value: string;          // Valor esperado
  comparator: "equals" | "contains" | "greater_than" | "less_than" | "not_equals";
}
```

### Avaliação

A função `getNextFieldId(currentFieldId, value, logic, fieldIds)` em `logicEngine.ts`:
1. Encontra regras para o campo atual
2. Avalia condições com o operador AND/OR
3. Retorna o ID do próximo campo, `"end"` ou `null` (próximo sequencial)

---

## 13. Workflow

**Arquivo:** `src/pages/FormWorkflow.tsx`

Tela separada com quatro módulos configuráveis:

### Branching
Editor visual de regras de lógica condicional (descrito acima).

### Scoring
**Arquivo:** `src/components/workflow/ScoringPanel.tsx`

- Atribui pontos a cada opção de cada campo
- Define faixas de pontuação com labels (ex: 0–40 "Iniciante", 41–70 "Intermediário", 71–100 "Expert")
- No runtime, pontuação é calculada e salva em `response.meta.score`

### Tagging
**Arquivo:** `src/components/workflow/TaggingPanel.tsx`

- Mapeia respostas de campos para tags (ex: resposta "Sim" → tag "Interessado")
- Tags salvas em `response.meta.tags`

### Outcome Quiz
**Arquivo:** `src/components/workflow/OutcomePanel.tsx`

- Define perfis/resultados possíveis (ex: "Perfil A", "Perfil B")
- Mapeia respostas a esses outcomes
- Runtime determina o outcome com mais "votos" das respostas
- Salvo em `response.meta.outcome_label` e exibido na tela de conclusão com descrição

### Ações (sidebar)
**Arquivo:** `src/components/workflow/ActionsPanel.tsx`

- Configuração de **e-mails automáticos** enviados ao concluir o formulário
- Templates com variáveis dinâmicas (score, tags, outcome)
- Preview de e-mail em tempo real

---

## 14. Respostas e Analytics

**Arquivo:** `src/pages/FormResponses.tsx`

### Métricas exibidas

| Métrica | Descrição |
|---------|-----------|
| Total de Respostas | Count total de registros |
| Taxa de Completude | % de respostas com status `completed` |
| Score Médio | Média dos scores (exibido apenas se scoring ativado) |

### Gráficos
- **Distribuição de Scores** (`ScoreDistributionChart`) — histograma dos scores de todas as respostas
- **Gráfico por Campo** (`FieldResponsesChart`) — frequência de cada opção para campos de escolha

### Tabela de respostas
- Filtro por status (todos / completada / em andamento)
- Colunas dinâmicas: Data, Status, Email, Score (se houver), Tags (se houver), Outcome (se houver)
- Click em linha → **Dialog de detalhes** com todas as respostas campo a campo

### Exportação CSV
- Botão "Exportar CSV" gera arquivo com todas as respostas filtradas
- Inclui colunas: Data, Status, Email, Score, Tags, Outcome + todos os campos do formulário
- Encoding UTF-8 com BOM para compatibilidade com Excel

---

## 15. Prevenção de Duplicados

**Arquivo de config:** `src/pages/FormResponses.tsx`  
**Runtime:** `src/pages/FormRunner.tsx`  
**Edge Function:** `supabase/functions/check-duplicate/index.ts`

### Configuração

Na tela de Respostas, card "Prevenção de Duplicados":
- **Switch** "Bloquear respostas duplicadas" (ativo por padrão)
- **Checkboxes** para selecionar campos de verificação: Email, Celular, Nome
- Configuração salva automaticamente em `forms.settings.dedup`:

```json
{
  "dedup": {
    "enabled": true,
    "fields": ["email", "phone", "name"]
  }
}
```

### Validação no runtime

Antes de marcar a resposta como `completed`, o runner:
1. Coleta os valores dos campos relevantes (email, telefone, campos de nome)
2. Invoca a edge function `check-duplicate` com `{ form_id, checks: [{ field_key, value }] }`
3. Se `duplicate: true` → exibe tela de erro "Resposta duplicada" com alerta amarelo e bloqueia submissão

### Edge Function `check-duplicate`
- Usa **service role key** para burlar RLS (respondentes anônimos não têm acesso às respostas)
- Busca respostas `completed` do formulário
- Compara `value_text` de forma **case-insensitive** com o valor informado
- Retorna `{ duplicate: true, field: "campo_id" }` ou `{ duplicate: false }`

---

## 16. Webhooks

**Arquivo:** `src/components/workflow/WebhookManager.tsx`  
**Edge Function:** `supabase/functions/fire-webhooks/index.ts`

- Cadastro de endpoints externos por formulário
- Eventos suportados: `response.started`, `response.completed`
- Assinatura HMAC com segredo configurável
- Disparados de forma assíncrona (best-effort, falha silenciosa no runner)

---

## 17. Edge Functions

| Função | Arquivo | Descrição |
|--------|---------|-----------|
| `fire-webhooks` | `supabase/functions/fire-webhooks/index.ts` | Dispara webhooks para endpoints externos |
| `check-duplicate` | `supabase/functions/check-duplicate/index.ts` | Verifica duplicidade de resposta |

Ambas usam `verify_jwt = false` (configurado em `supabase/config.toml`) para acesso público.

---

## 18. Armazenamento de Arquivos

**Bucket:** `form-assets`

| Pasta | Uso |
|-------|-----|
| `backgrounds/` | Imagens de fundo dos formulários e telas de boas-vindas |
| `logos/` | Imagens introdutórias / logomarcas da tela de boas-vindas |
| `field-media/` | Mídia associada a campos (imagens de opções, etc.) |

Upload via Supabase Storage SDK com geração de UUID como nome de arquivo para evitar colisões. URLs públicas retornadas e armazenadas no schema do formulário.

---

## 19. Fluxo Completo de uma Resposta

```
1. Respondente acessa /f/:slug
2. Sistema valida: form publicado? → sim
3. access_mode === "email_required"?
   → sim: exibe EmailGate → respondente informa email
   → não: pula
4. welcome_screen.enabled?
   → sim: exibe WelcomeScreen (com logo se configurada)
   → não: pula
5. Cria registro `responses` com status "in_progress"
   → dispara webhook response.started
6. Loop de perguntas:
   a. Exibe campo atual com animação
   b. Respondente responde
   c. Salva em `response_answers` (value + value_text)
   d. Avalia lógica condicional → decide próximo campo ou fim
   e. Repete
7. Último campo respondido → completeForm():
   a. Verifica duplicados (se dedup.enabled)
      → duplicado: exibe tela de erro, interrompe
   b. Calcula score (se scoring.enabled)
   c. Coleta tags (se tagging.enabled)
   d. Determina outcome (se outcomes.enabled)
   e. Atualiza `responses` → status "completed", meta preenchido
   f. Dispara webhook response.completed
8. Exibe tela de conclusão:
   - Com outcome → título do outcome + descrição
   - Com score → pontuação numérica + label da faixa
   - Padrão → "Obrigado! Suas respostas foram enviadas."
```

---

## 20. Segurança e RLS

- Todas as tabelas possuem **Row Level Security (RLS)** habilitado
- Usuários só acessam dados dos workspaces dos quais são membros
- `responses` e `response_answers` têm políticas especiais para acesso de respondentes anônimos via `session_token`
- Edge functions que precisam de acesso irrestrito usam a `SUPABASE_SERVICE_ROLE_KEY`
- Chaves privadas nunca são expostas no frontend — apenas a `anon key` pública é usada no cliente
- `verify_jwt = false` nas edge functions públicas é mitigado por lógica interna de validação

---

*Fim do documento. Última atualização: 19/02/2026*
