

# Graficos, Exportacao CSV e Drag-and-Drop

## Visao Geral

Tres melhorias complementares: (1) graficos analiticos na pagina de respostas, (2) exportacao CSV, e (3) reordenacao de campos com arrastar e soltar no editor.

---

## 1. Graficos de Distribuicao (FormResponses)

Adicionar uma secao de graficos abaixo dos cards de resumo, usando a biblioteca `recharts` (ja instalada).

### Graficos planejados:
- **Distribuicao de Scores** (BarChart): histograma mostrando quantas respostas caem em cada faixa de score (quando scoring habilitado)
- **Respostas por Campo** (BarChart horizontal): para cada campo de escolha (multiple_choice, dropdown, yes_no, checkbox), exibir a contagem de cada opcao selecionada

### Dados:
- Scores: extraidos de `responses.meta.score` (ja carregados)
- Respostas por campo: requer buscar todos os `response_answers` do formulario (novo fetch agrupando por field_key + value)

---

## 2. Exportacao CSV (FormResponses)

Botao "Exportar CSV" no header da pagina que gera e baixa um arquivo .csv com todas as respostas filtradas.

### Colunas do CSV:
- Data, Status, Email, Score, Tags, Outcome + uma coluna por campo do formulario (usando labels do fieldMap)

### Implementacao:
- Buscar todos os `response_answers` dos responses filtrados
- Montar matriz de dados em memoria
- Gerar string CSV e disparar download via `Blob` + `URL.createObjectURL`
- Sem dependencia externa necessaria

---

## 3. Drag-and-Drop para Reordenar Campos (FormEditor)

Permitir arrastar os cards de campo na lista lateral para reordenar, conforme a imagem de referencia (icone de grip ja existe no FieldItem).

### Implementacao:
- Usar a API nativa HTML5 Drag and Drop (sem nova dependencia)
- Adicionar handlers `onDragStart`, `onDragOver`, `onDrop` no FieldItem e na lista
- Ao soltar, reordenar o array `fields` no state do FormEditor
- Indicador visual de posicao de drop (linha colorida entre items)

---

## Arquivos

### Criar
| Arquivo | Descricao |
|---------|-----------|
| `src/components/responses/ScoreDistributionChart.tsx` | Grafico de barras com distribuicao de scores |
| `src/components/responses/FieldResponsesChart.tsx` | Grafico de respostas por opcao para cada campo de escolha |

### Modificar
| Arquivo | Mudanca |
|---------|---------|
| `src/pages/FormResponses.tsx` | Adicionar secao de graficos, botao de exportar CSV, fetch adicional de answers para graficos |
| `src/pages/FormEditor.tsx` | Implementar drag-and-drop na lista de campos com reordenacao do array |
| `src/components/form-editor/FieldItem.tsx` | Adicionar props e handlers de drag (onDragStart, onDragOver, onDrop, onDragEnd) com feedback visual |

---

## Detalhes Tecnicos

### Graficos (recharts)

**ScoreDistributionChart**: Recebe array de scores numericos. Agrupa em faixas (buckets) de 10 pontos e renderiza um `BarChart` com eixo X = faixa, eixo Y = contagem.

**FieldResponsesChart**: Recebe `fieldMap`, `fields` (schema) e `allAnswers` (todos os response_answers). Para cada campo do tipo escolha, conta ocorrencias de cada valor e renderiza um `BarChart` horizontal.

### Exportacao CSV

```text
Fluxo:
1. Usuario clica "Exportar CSV"
2. Buscar response_answers para todos os response IDs filtrados
3. Montar headers: [Data, Status, Email, Score, Tags, Outcome, ...campo labels]
4. Para cada response, preencher linha com meta + respostas mapeadas
5. Gerar CSV string, criar Blob, disparar download
```

Funcao auxiliar para escapar valores CSV (aspas duplas, virgulas, quebras de linha).

### Drag-and-Drop (HTML5 nativo)

- `FieldItem` recebe props: `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd`
- No `FormEditor`, manter estado `dragIndex` para rastrear o item sendo arrastado
- No `onDrop`, calcular nova posicao e reordenar o array com splice
- CSS: adicionar classe `border-t-2 border-primary` no item sobre o qual esta passando o arraste

