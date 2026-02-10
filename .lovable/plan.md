
# Midia Incorporada nos Campos do Formulario

## Visao Geral

Adicionar suporte a midia (videos do YouTube/Vimeo e imagens via URL) em qualquer campo do formulario. O dono do formulario podera adicionar uma URL de video ou imagem que sera exibida junto com a pergunta no runner.

---

## O que sera construido

### No Editor (FieldConfigPanel)
- Nova secao "Midia" no painel de configuracao de cada campo
- Campo para colar URL de video (YouTube ou Vimeo) com preview embutido
- Campo para colar URL de imagem com preview
- Botao para remover a midia
- Deteccao automatica do tipo de midia (video ou imagem) pela URL

### No Runner (RunnerField)
- Renderizar o video incorporado (iframe) ou imagem acima da pergunta
- YouTube: converter URL para formato embed (`youtube.com/embed/VIDEO_ID`)
- Vimeo: converter URL para formato embed (`player.vimeo.com/video/VIDEO_ID`)
- Imagem: renderizar como `<img>` com aspect-ratio responsivo

---

## Arquivos

### Modificar
| Arquivo | Mudanca |
|---------|---------|
| `src/types/workflow.ts` | Adicionar campos `media_url?` e `media_type?` na interface FormField |
| `src/components/form-editor/FieldConfigPanel.tsx` | Adicionar secao de midia com inputs de URL e preview |
| `src/components/form-runner/RunnerField.tsx` | Renderizar midia (video embed ou imagem) acima da pergunta |

---

## Detalhes Tecnicos

### Tipo FormField (workflow.ts)

Novos campos opcionais:
```text
media_url?: string       // URL do YouTube, Vimeo ou imagem
media_type?: "video" | "image"  // tipo detectado automaticamente
```

### Deteccao de tipo e parsing de URL

Funcao utilitaria para:
- Detectar YouTube: regex para `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`
- Detectar Vimeo: regex para `vimeo.com/VIDEO_ID`
- Detectar imagem: extensoes `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg` ou fallback
- Extrair ID do video e montar URL de embed

### FieldConfigPanel - Secao de Midia

- Input de URL com placeholder "Cole a URL do YouTube, Vimeo ou imagem..."
- Ao colar, detectar automaticamente o tipo e salvar `media_url` + `media_type`
- Preview inline: iframe para videos, img para imagens
- Botao X para remover midia

### RunnerField - Exibicao

- Se `field.media_url` existir, renderizar acima do titulo da pergunta:
  - Video: iframe 16:9 responsivo com `allow="autoplay; encrypted-media"`
  - Imagem: `<img>` com `max-w-full rounded-lg` e aspect-ratio automatico
