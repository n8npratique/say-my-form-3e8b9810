
# Personalizacao Visual Completa do Formulario

## Visao Geral

Adicionar um sistema completo de temas visuais no editor de formularios, incluindo cores, fontes, paletas pre-definidas e **importacao de imagem de fundo/textura via URL (PNG, JPG)**. O tema e salvo no schema JSON e aplicado dinamicamente no runner.

---

## O que sera construido

### No Editor (FormEditor)
- Novo botao "Aparencia" (icone Palette) no header que abre um Dialog de personalizacao
- O painel tera 3 secoes:
  1. **Paletas pre-definidas** - 8 combinacoes prontas clicaveis
  2. **Ajuste fino** - color pickers individuais + seletor de fonte
  3. **Imagem de fundo** - campo para colar URL de imagem PNG/JPG como textura/fundo

### Paletas Pre-definidas (8 opcoes)

| Nome | Fundo | Texto | Botao | Fonte |
|------|-------|-------|-------|-------|
| Classico | #FFFFFF | #1A1A1A | #7C3AED | Inter |
| Oceano | #0F172A | #E2E8F0 | #0EA5E9 | Space Grotesk |
| Floresta | #F0FDF4 | #14532D | #16A34A | Lora |
| Sunset | #FFF7ED | #7C2D12 | #EA580C | Poppins |
| Noturno | #18181B | #FAFAFA | #A78BFA | Space Grotesk |
| Coral | #FFF1F2 | #881337 | #E11D48 | Playfair Display |
| Minimalista | #FAFAFA | #3F3F46 | #18181B | Inter |
| Gradiente | linear-gradient roxo-rosa | #FFFFFF | #FFFFFF | Poppins |

### Imagem de Fundo / Textura
- Campo de URL para colar link de imagem (PNG, JPG, WEBP)
- Preview da imagem aplicada como fundo
- Opcoes de exibicao: "cover" (preencher tela), "repeat" (ladrilho/textura), "contain"
- Controle de opacidade (overlay escuro/claro sobre a imagem para manter legibilidade)
- Botao para remover imagem de fundo

### No Runner (FormRunner)
- Ler `schema.theme` e aplicar como CSS inline no container raiz
- Se houver `background_image`, aplicar como `backgroundImage` com overlay de opacidade
- Fontes do Google Fonts carregadas dinamicamente
- Todos os componentes (RunnerField, EmailGate, tela de conclusao) herdam o tema via CSS variables

---

## Arquivos

### Criar
| Arquivo | Descricao |
|---------|-----------|
| `src/lib/formTheme.ts` | Interface FormTheme, paletas pre-definidas, tema padrao, funcao de conversao para CSS variables |
| `src/components/form-editor/ThemePanel.tsx` | Dialog de personalizacao com paletas, color pickers, seletor de fonte e campo de imagem de fundo |

### Modificar
| Arquivo | Mudanca |
|---------|---------|
| `src/types/workflow.ts` | Adicionar `theme?: FormTheme` no `FormSchema` |
| `src/pages/FormEditor.tsx` | Adicionar estado `theme`, botao "Aparencia", carregar/salvar tema no schema via merge |
| `src/pages/FormRunner.tsx` | Ler `schema.theme`, aplicar CSS variables + background image no container, carregar Google Fonts |
| `src/components/form-runner/RunnerField.tsx` | Usar CSS variables do tema para cores de botao e texto |
| `src/components/form-runner/EmailGate.tsx` | Usar CSS variables do tema para cores |

---

## Detalhes Tecnicos

### Interface FormTheme (formTheme.ts)

```text
interface FormTheme {
  background_color: string;       // cor de fundo (hex ou gradiente CSS)
  text_color: string;             // cor do texto principal
  text_secondary_color: string;   // cor do texto secundario
  button_color: string;           // cor de fundo do botao
  button_text_color: string;      // cor do texto do botao
  font_family: string;            // nome da fonte
  background_image?: string;      // URL da imagem de fundo (PNG, JPG, WEBP)
  background_size?: "cover" | "contain" | "repeat";  // modo de exibicao
  background_overlay?: number;    // opacidade do overlay (0-1, ex: 0.5)
}
```

### Armazenamento

O tema e salvo dentro de `form_versions.schema.theme`, usando o merge existente para nao sobrescrever workflow/logic.

### Aplicacao no Runner (FormRunner)

O container raiz recebera style inline:

```text
style={{
  "--runner-bg": theme.background_color,
  "--runner-text": theme.text_color,
  "--runner-text-secondary": theme.text_secondary_color,
  "--runner-btn-bg": theme.button_color,
  "--runner-btn-text": theme.button_text_color,
  fontFamily: theme.font_family,
  backgroundColor: theme.background_color,
  color: theme.text_color,
  backgroundImage: theme.background_image
    ? `url(${theme.background_image})`
    : undefined,
  backgroundSize: theme.background_size === "repeat"
    ? "auto"
    : theme.background_size,
  backgroundRepeat: theme.background_size === "repeat"
    ? "repeat"
    : "no-repeat",
  backgroundPosition: "center",
}}
```

Se `background_image` e `background_overlay` estiverem definidos, um `<div>` overlay absoluto sera renderizado sobre o fundo para garantir legibilidade.

### Carregamento de Fontes

Fontes disponiveis: Inter, Space Grotesk (ja importadas), Poppins, Roboto, Lora, Playfair Display.
No Runner, injetar dinamicamente um `<link>` no `<head>` com Google Fonts da fonte selecionada.

### ThemePanel (Dialog)

- Secao 1: Grid de paletas (cards 2x4 com preview colorido, clique aplica todos os valores)
- Secao 2: Color pickers nativos (`<input type="color">`) para cada propriedade + Select para fonte
- Secao 3: Campo de URL para imagem de fundo com preview, Select para modo (cover/repeat/contain), Slider para opacidade do overlay
- Mini-preview ao vivo mostrando como ficara o formulario

### Componentes do Runner (RunnerField, EmailGate)

Substituir classes hardcoded por CSS variables:
- Botoes: `style={{ backgroundColor: "var(--runner-btn-bg)", color: "var(--runner-btn-text)" }}`
- Textos: `style={{ color: "var(--runner-text)" }}` e `style={{ color: "var(--runner-text-secondary)" }}`
- Inputs: bordas herdam cor do tema
