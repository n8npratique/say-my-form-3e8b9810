
# Preview e Compartilhamento de Formularios

## O que sera feito

Habilitar o botao **Preview** no editor e criar o sistema de **publicacao e compartilhamento** com duas opcoes de acesso: **publico** (qualquer pessoa) ou **autenticado por email**.

---

## 1. Migracao de Banco de Dados

Adicionar coluna `access_mode` na tabela `forms` para controlar o tipo de acesso:

```text
forms.settings (jsonb) -> adicionar campo "access_mode": "public" | "email_required"
```

Usaremos o campo `settings` (jsonb) que ja existe na tabela `forms` para armazenar:
- `access_mode`: `"public"` ou `"email_required"`

Nenhuma migracao SQL necessaria -- o campo `settings` ja existe como jsonb.

---

## 2. Publicacao do Formulario (Botao "Publicar")

No editor (`FormEditor.tsx`):
- Adicionar botao **Publicar** ao lado de Salvar
- Ao publicar:
  - Gerar slug unico (se nao existir)
  - Atualizar `forms.status` para `"published"`
  - Setar `forms.published_version_id` para a versao atual
- Adicionar dialog de **Compartilhamento** com:
  - Toggle entre "Publico" e "Requer email"
  - Link copiavel do formulario (`/f/{slug}`)
  - Botao copiar link

---

## 3. Preview no Editor

- Ativar o botao **Preview** (atualmente desabilitado)
- Abrir nova aba/modal com a rota `/f/{slug}/preview` ou navegar para `/f/{slug}` em nova aba
- O preview usa o schema salvo da versao atual (nao precisa estar publicado)

---

## 4. Runner Publico (Fase 3 parcial)

Criar a pagina `/f/{slug}` que renderiza o formulario conversacional:

- **Rota**: `/f/:slug` (sem ProtectedRoute)
- **Fluxo**:
  1. Buscar formulario pelo slug
  2. Verificar `settings.access_mode`
  3. Se `email_required`: mostrar tela de coleta de email antes de iniciar
  4. Se `public`: iniciar direto
  5. Renderizar uma pergunta por tela com transicoes suaves (framer-motion)
  6. Barra de progresso
  7. Salvar respostas incrementalmente em `responses` + `response_answers`
  8. Tela final ao concluir

---

## 5. Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| `src/pages/FormRunner.tsx` | **Criar** - Pagina publica do formulario conversacional |
| `src/pages/FormEditor.tsx` | **Modificar** - Botoes Preview, Publicar, dialog de compartilhamento |
| `src/components/form-runner/RunnerField.tsx` | **Criar** - Componente que renderiza cada tipo de campo |
| `src/components/form-runner/EmailGate.tsx` | **Criar** - Tela de coleta de email (quando access_mode = email_required) |
| `src/components/form-editor/ShareDialog.tsx` | **Criar** - Dialog de compartilhamento com toggle publico/email |
| `src/components/form-editor/PublishButton.tsx` | **Criar** - Logica de publicacao com geracao de slug |
| `src/App.tsx` | **Modificar** - Adicionar rota `/f/:slug` |

---

## Detalhes Tecnicos

### Geracao de Slug
- Formato: nome do formulario em kebab-case + 6 chars aleatorios (ex: `meu-formulario-a3f2b1`)
- Garantir unicidade via query antes de salvar

### Runner - Fluxo de Resposta
1. Criar registro em `responses` com status `in_progress`
2. A cada pergunta respondida, salvar em `response_answers`
3. Ao finalizar, atualizar `responses.status` para `completed` e setar `completed_at`

### RLS
- As policies ja existentes cobrem os casos:
  - `Anyone can view published forms` (SELECT em forms com status = published)
  - `Anyone can view published form versions` (SELECT em form_versions vinculado a published_version_id)
  - `Anyone can create response` (INSERT em responses)
  - `Anyone can create answer` (INSERT em response_answers)
  - `Anyone can update in_progress response` (UPDATE em responses)

### Email Gate
- Quando `access_mode = "email_required"`, exibir formulario simples de email
- Email salvo no campo `responses.meta` como `{"respondent_email": "..."}`
- Nao requer cadastro/login -- apenas coleta do email
