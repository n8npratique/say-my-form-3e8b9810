
# Pratique Forms — Plano V1

## Visão Geral
Plataforma de formulários conversacionais (estilo Typeform) com builder visual, lógica condicional, loops dinâmicos, versionamento, webhooks e exportação. Design moderno e colorido com gradientes e cores vibrantes.

---

## Fase 1: Fundação (Backend + Auth + Estrutura)

### 1.1 Conexão Supabase e Schema do banco
- Conectar projeto Supabase externo
- Criar todas as tabelas: `workspaces`, `workspace_members`, `forms`, `form_versions`, `responses`, `response_answers`, `webhooks`, `integrations`
- Enum `app_role` para permissões (owner, admin, editor, viewer)
- Tabela `user_roles` separada para segurança
- RLS policies por `workspace_id` em todas as tabelas relevantes

### 1.2 Autenticação e Workspaces
- Login/cadastro com email (Supabase Auth)
- Criação e seleção de workspace
- Convite de membros com diferentes papéis
- Tela de gerenciamento de equipe

---

## Fase 2: Builder Visual

### 2.1 Listagem e criação de formulários
- Dashboard com lista de formulários do workspace
- Cards com nome, status (rascunho/publicado), data de criação
- Botão de criar novo formulário

### 2.2 Editor de perguntas
- Interface drag-and-drop para reordenar blocos
- Painel lateral para configurar cada pergunta
- Tipos suportados: texto curto, texto longo, email, número, data, escolha única, múltipla, NPS, arquivo, declaração, consentimento
- Campos: label, placeholder, obrigatório, validação
- Suporte a variáveis dinâmicas `{{nome}}`
- Preview em tempo real ao lado do editor

### 2.3 Editor de lógica condicional
- Interface visual para criar regras "Se campo X = valor, ir para bloco Y"
- Operadores: equals, not_equals, contains, greater_than, less_than

### 2.4 Configuração de loops
- Definir grupos de blocos que podem se repetir
- Modo "while" (adicionar mais?) com campo de controle
- Configuração visual simples

### 2.5 Publicação e versionamento
- Botão "Publicar" que cria nova versão em `form_versions`
- Gera slug único para URL pública do formulário
- Histórico de versões acessível

---

## Fase 3: Runner (Experiência de Resposta)

### 3.1 Formulário público conversacional
- URL pública: `/f/{slug}`
- Uma pergunta por tela, transição suave entre perguntas
- Barra de progresso
- Navegação voltar/avançar
- Design mobile-first, moderno e responsivo
- Sem necessidade de login para responder

### 3.2 Motor de lógica (runtime)
- Avaliação de regras condicionais para determinar próximo bloco
- Gerenciamento de loops ativos com stack no `responses.meta`
- Salvamento incremental de cada resposta (campo a campo)

### 3.3 Upload de arquivos
- Perguntas tipo "arquivo" fazem upload para Supabase Storage
- URLs assinadas para segurança

---

## Fase 4: Resultados e Exportação

### 4.1 Painel de respostas
- Lista de respostas por formulário com filtros (data, status)
- Busca por conteúdo de campo
- Visualização detalhada de cada resposta individual
- Indicadores: total de respostas, taxa de conclusão

### 4.2 Exportação
- Export CSV direto da interface
- Botão de reenvio de webhook por resposta individual

---

## Fase 5: Integrações (Webhooks + n8n)

### 5.1 Configuração de webhooks
- Tela para cadastrar URL de webhook por formulário
- Secret para assinatura HMAC
- Seleção de eventos (ex: `response.completed`)
- Toggle ativar/desativar

### 5.2 Edge Function de disparo
- Ao completar resposta, Edge Function dispara POST com payload padronizado
- Inclui assinatura HMAC no header
- Payload: event, form_id, response_id, answers, meta

### 5.3 Google Sheets sync
- Configuração de integração por formulário (spreadsheet_id, tab, mapeamento de colunas)
- Export manual para Google Sheets (via n8n webhook)

---

## Design e UX
- Paleta moderna e colorida com gradientes vibrantes
- Cores de destaque para diferentes tipos de pergunta
- Tipografia clean com hierarquia clara
- Animações suaves nas transições do runner
- Interface administrativa rica com ícones e badges coloridos
- Dark mode disponível
