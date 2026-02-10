

# Actions Panel Completo: Webhooks, Connect e Messages

## Visao Geral

Transformar o painel lateral "Actions" do Workflow em um sistema completo com 3 abas funcionais:

1. **Webhooks** - Melhorar o gerenciador existente com suporte explicito a n8n (instrucoes e dicas)
2. **Connect** - Painel de integracoes externas (n8n, Zapier, webhook generico) com configuracao de URL e teste
3. **Messages** - Editor completo de email de notificacao com titulo, corpo rico, imagem de topo, rodape e call-to-action

---

## 1. Webhooks (Melhorias)

### O que muda
- Adicionar label/nome ao webhook para identificacao (ex: "Notificacao n8n")
- Exibir dica visual de como conectar com n8n: "Cole a URL do webhook do n8n aqui"
- Mostrar o secret (copiavel) para validacao HMAC no n8n
- Adicionar seletor de eventos: `response.completed`, `response.started`
- Botao "Testar" que envia um payload de teste ao webhook

### Mudancas tecnicas
- Atualizar `WebhookManager.tsx` com campos de label, seletor de eventos, botao de copiar secret e botao de teste
- O teste invoca a Edge Function `fire-webhooks` com um payload dummy ou faz fetch direto

---

## 2. Connect

### O que sera construido
- Lista de conectores disponiveis: **n8n**, **Zapier**, **Webhook Generico**
- Cada conector mostra:
  - Icone e nome
  - Campo para URL do webhook
  - Instrucoes contextuais (ex: "No n8n, crie um workflow com trigger Webhook e cole a URL aqui")
  - Status de conexao (conectado/nao conectado)
  - Botao para testar e remover

### Armazenamento
- Usar a tabela `integrations` existente (type: "n8n" | "zapier" | "webhook_custom", config: { url, name, ... })
- CRUD via Supabase client

### Componente novo
- `ConnectPanel.tsx` - lista de conectores com cards expansiveis

---

## 3. Messages (Editor de Email)

### O que sera construido
Editor completo de template de email que sera enviado ao respondente (se email foi coletado) ou ao dono do formulario ao completar uma resposta.

O editor tera:
- **Destinatario**: toggle entre "Respondente" e "Dono do formulario"
- **Assunto**: campo de texto com variaveis dinamicas (ex: `{{form_name}}`, `{{respondent_email}}`)
- **Imagem de topo (header)**: campo URL para imagem de banner
- **Corpo do email**: textarea rico com suporte a variaveis
- **Call-to-Action (CTA)**: texto do botao + URL de destino
- **Rodape**: texto livre para informacoes legais ou branding
- **Preview**: visualizacao do email montado ao lado

### Armazenamento
- Salvar no schema do formulario como `form_versions.schema.email_templates[]`
- Cada template:

```text
interface EmailTemplate {
  id: string;
  name: string;
  enabled: boolean;
  recipient: "respondent" | "owner";
  subject: string;
  header_image_url?: string;
  body: string;            // texto com {{variaveis}}
  cta_text?: string;
  cta_url?: string;
  footer?: string;
}
```

### Envio (futuro - preparacao)
- O template sera salvo no schema agora
- O envio real sera implementado via Edge Function futura (ex: `send-email`) que monta o HTML e envia via servico de email
- Por ora, o editor permite configurar e salvar os templates

---

## Arquivos

### Criar
| Arquivo | Descricao |
|---------|-----------|
| `src/components/workflow/ConnectPanel.tsx` | Painel de conectores (n8n, Zapier, webhook generico) |
| `src/components/workflow/MessagesPanel.tsx` | Editor completo de template de email |
| `src/components/workflow/EmailPreview.tsx` | Preview visual do email montado |

### Modificar
| Arquivo | Mudanca |
|---------|---------|
| `src/components/workflow/ActionsPanel.tsx` | Substituir placeholders por ConnectPanel e MessagesPanel |
| `src/components/workflow/WebhookManager.tsx` | Adicionar label, seletor de eventos, botao copiar secret, botao testar, dicas n8n |
| `src/types/workflow.ts` | Adicionar interface EmailTemplate e campo `email_templates?` no FormSchema |
| `src/pages/FormWorkflow.tsx` | Carregar e salvar `email_templates` do schema |

---

## Detalhes Tecnicos

### WebhookManager - Melhorias

- Adicionar campo `label` (input texto) antes da URL
- Mostrar badge com eventos selecionados
- Botao icone para copiar `secret` com feedback "Copiado!"
- Botao "Testar" que faz `fetch(url, { method: "POST", mode: "no-cors", body: testPayload })`
- Texto de ajuda contextual: "Compativel com n8n, Zapier, Make e qualquer servico que aceite webhooks HTTP POST"

### ConnectPanel

- 3 cards de conectores:
  - **n8n**: icone, descricao "Conecte seu workflow n8n", campo URL, instrucoes passo-a-passo
  - **Zapier**: icone, descricao "Conecte com Zapier", campo URL, instrucoes
  - **Webhook Generico**: icone, descricao "Qualquer servico HTTP", campo URL
- Ao salvar, insere/atualiza na tabela `integrations` com `type` e `config: { url, name }`
- Lista integracoes salvas com toggle ativo/inativo e botao remover

### MessagesPanel

- Lista de templates de email (inicialmente vazia, botao "+ Novo template")
- Ao criar/editar, abre formulario com:
  - Toggle "Ativo"
  - Select destinatario (respondent/owner)
  - Input assunto com botoes de variavel
  - Input URL imagem de topo com preview
  - Textarea corpo com botoes para inserir variaveis `{{form_name}}`, `{{respondent_email}}`, `{{score}}`, `{{outcome}}`
  - Input CTA texto + URL
  - Textarea rodape
- Variaveis disponiveis mostradas como chips clicaveis que inserem no campo ativo

### EmailPreview

- Renderiza um card estilizado simulando um email:
  - Header com imagem (se definida)
  - Titulo (assunto)
  - Corpo (com variaveis substituidas por exemplos)
  - Botao CTA estilizado
  - Rodape em texto menor

### FormWorkflow - Estado

- Adicionar estado `emailTemplates` carregado de `schema.email_templates`
- Passar para `ActionsPanel` como prop
- Salvar junto com o resto do schema no `saveWorkflow`

