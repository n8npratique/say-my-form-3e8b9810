

# Correcao: Tema nao aplica ao clicar "Aplicar"

## Problemas Identificados

1. **Estado local nao sincroniza ao reabrir o painel**: O `ThemePanel` usa `useState(theme)` que so inicializa uma vez. Se o Dialog permanece montado (comportamento padrao do Radix), reabrir o painel mostra valores antigos em vez do tema atual.

2. **Nenhum feedback visual no editor**: O tema so e aplicado na pagina do Runner (`/f/slug`). No editor, o usuario clica "Aplicar" mas nada muda visualmente na tela, dando a impressao de que nao funcionou.

3. **Fluxo confuso**: Apos "Aplicar", o usuario ainda precisa clicar "Salvar" e depois "Publicar" para ver as mudancas no formulario publico. Nao ha indicacao clara disso.

---

## Solucao

### 1. Sincronizar estado local do ThemePanel

Adicionar um `useEffect` no `ThemePanel` para atualizar o estado local sempre que o dialog abrir ou o tema externo mudar:

```text
useEffect(() => {
  if (open) setLocal(theme);
}, [open, theme]);
```

### 2. Adicionar preview visual no editor

Mostrar uma barra ou mini-preview no editor que reflete o tema atual, para que o usuario veja que as mudancas foram aplicadas. Opcoes:
- Adicionar um indicador visual no header do editor mostrando as cores do tema ativo (circulos coloridos)
- Ou: aplicar uma borda/fundo sutil no painel do editor baseado no tema

### 3. Toast de confirmacao com orientacao

Ao aplicar o tema, exibir um toast informando: "Tema aplicado! Salve e publique para ver no formulario."

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/form-editor/ThemePanel.tsx` | Adicionar `useEffect` para sincronizar `local` com `theme` quando `open` mudar |
| `src/pages/FormEditor.tsx` | Adicionar indicador visual do tema ativo no header + toast apos aplicar tema |

---

## Detalhes Tecnicos

### ThemePanel.tsx

- Adicionar `useEffect` com dependencia em `open` e `theme` para resetar o estado local
- Isso garante que ao reabrir o painel, os valores refletem o tema salvo atualmente

### FormEditor.tsx

- Adicionar um callback `handleThemeChange` que:
  1. Atualiza o estado `theme`
  2. Exibe toast: "Tema atualizado! Clique em Salvar para persistir."
- Adicionar indicadores visuais (3 circulos coloridos pequenos) ao lado do botao "Aparencia" mostrando as cores ativas do tema (fundo, texto, botao)
- Considerar salvar automaticamente ao aplicar tema (chamar `saveSchema` apos `setTheme`)

