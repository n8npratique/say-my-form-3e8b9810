
# Renomear "Pratique Forms" para "TecForms" e Tornar Breadcrumbs Clicaveis

## O que sera feito

1. **Renomear** todas as ocorrencias de "Pratique Forms" para "TecForms" em 5 arquivos
2. **Tornar os itens do breadcrumb clicaveis** para navegacao correta:
   - Clicar em **"TecForms"** leva ao Dashboard (`/dashboard`)
   - Clicar no **nome do formulario** leva ao editor do formulario
   - O item da pagina atual (ex: "Workflow", "Respostas") permanece como texto sem link

## Arquivos a Modificar

| Arquivo | Mudancas |
|---------|----------|
| `src/pages/FormWorkflow.tsx` | Renomear para "TecForms", tornar "TecForms" clicavel (vai para `/dashboard`), tornar nome do form clicavel (vai para `/workspace/.../form/.../edit`) |
| `src/pages/FormEditor.tsx` | Renomear para "TecForms", tornar "TecForms" clicavel (vai para `/dashboard`) |
| `src/pages/FormResponses.tsx` | Renomear para "TecForms", tornar "TecForms" clicavel (vai para `/dashboard`), tornar nome do form clicavel (vai para `/workspace/.../form/.../edit`) |
| `src/pages/WorkspaceForms.tsx` | Renomear para "TecForms", tornar "TecForms" clicavel (vai para `/dashboard`) |
| `src/pages/FormRunner.tsx` | Renomear para "TecForms" no rodape |

## Detalhes Tecnicos

Os `<span>` estaticos serao substituidos por botoes estilizados com `cursor-pointer` e `onClick` usando `navigate()`:

```text
// Antes (estatico)
<span className="...gradient-text">Pratique Forms</span>

// Depois (clicavel)
<button onClick={() => navigate("/dashboard")} className="...gradient-text hover:opacity-80 transition">
  TecForms
</button>
```

Para o nome do formulario nas paginas de Workflow e Respostas:

```text
// Antes
<span className="font-medium...">{formName}</span>

// Depois
<button onClick={() => navigate(`/workspace/${workspaceId}/form/${formId}/edit`)}
  className="font-medium... hover:text-primary transition cursor-pointer">
  {formName}
</button>
```
