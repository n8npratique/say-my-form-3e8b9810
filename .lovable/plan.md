
# Imagem Introdutoria na Tela de Boas-vindas

## O que sera feito
Adicionar um campo na aba "Boas-vindas" do painel de Aparencia para que o usuario possa anexar uma imagem (logomarca, ilustracao, etc.) que aparecera **acima do titulo** na tela de boas-vindas do formulario. Essa imagem e independente da imagem de fundo -- ela e exibida em primeiro plano como elemento visual de destaque.

## Como vai funcionar
- Na configuracao (ThemePanel, aba Boas-vindas), um novo campo "Imagem / Logo" aparecera antes do campo de titulo, permitindo:
  - Upload de arquivo local (usando o bucket `form-assets` ja existente)
  - Colar uma URL de imagem externa
  - Remover a imagem
- Na tela de boas-vindas do formulario (WelcomeScreen), a imagem sera renderizada acima do titulo com animacao suave, centralizada, com tamanho maximo controlado (max-h-40, max-w-xs) e bordas arredondadas

## Detalhes Tecnicos

### 1. `src/lib/formTheme.ts`
- Adicionar campo `logo_url?: string` na interface `WelcomeScreen`

### 2. `src/components/form-editor/ThemePanel.tsx`
- Na secao de boas-vindas (quando `welcome.enabled`), adicionar antes do campo "Titulo":
  - Label "Imagem / Logo"
  - Preview da imagem atual (se houver) com botao de remover
  - Botao de upload (reutilizando logica do BackgroundPicker para enviar ao bucket `form-assets`)
  - Input de URL alternativo
- Usar `updateWelcome({ logo_url: ... })` para salvar

### 3. `src/components/form-runner/WelcomeScreen.tsx`
- Antes do `<motion.h1>`, renderizar condicionalmente a imagem:
  ```
  {welcome.logo_url && (
    <motion.img src={welcome.logo_url} ... />
  )}
  ```
- Imagem centralizada, com `max-h-40 max-w-xs object-contain rounded-lg`

### Arquivos modificados:
| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/formTheme.ts` | Adicionar `logo_url` ao `WelcomeScreen` |
| `src/components/form-editor/ThemePanel.tsx` | Campo de upload/URL para logo |
| `src/components/form-runner/WelcomeScreen.tsx` | Renderizar logo acima do titulo |
