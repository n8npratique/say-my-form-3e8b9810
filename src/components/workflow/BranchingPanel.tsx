import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GitBranch, ArrowRight, ChevronDown, Star, ThumbsUp, ThumbsDown, Hash, Type, ListChecks } from "lucide-react";
import type { FormField, FieldLogic, LogicRule, ConditionOp } from "@/types/workflow";

interface BranchingPanelProps {
  field: FormField;
  fields: FormField[];
  logic: FieldLogic[];
  onUpdateLogic: (logic: FieldLogic[]) => void;
}

const OPS: { value: ConditionOp; label: string }[] = [
  { value: "equals", label: "É igual a" },
  { value: "not_equals", label: "Não é igual a" },
  { value: "contains", label: "Contém" },
  { value: "greater_than", label: "Maior que" },
  { value: "less_than", label: "Menor que" },
  { value: "is_set", label: "Está preenchido" },
  { value: "is_not_set", label: "Não está preenchido" },
];

// Operators that make sense per field type
const getOpsForField = (type: string): ConditionOp[] => {
  switch (type) {
    case "yes_no":
    case "legal":
      return ["equals", "not_equals", "is_set", "is_not_set"];
    case "multiple_choice":
    case "dropdown":
    case "image_choice":
      return ["equals", "not_equals", "is_set", "is_not_set"];
    case "checkbox":
    case "ranking":
      return ["contains", "is_set", "is_not_set"];
    case "rating":
    case "nps":
    case "opinion_scale":
      return ["equals", "not_equals", "greater_than", "less_than", "is_set", "is_not_set"];
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
      return ["equals", "not_equals", "contains", "is_set", "is_not_set"];
    case "number":
      return ["equals", "not_equals", "greater_than", "less_than", "is_set", "is_not_set"];
    default:
      return ["equals", "not_equals", "contains", "greater_than", "less_than", "is_set", "is_not_set"];
  }
};

// Get possible values for a field type as a dropdown list
const getValueOptions = (field: FormField): { value: string; label: string }[] | null => {
  const t = field.type;

  if (t === "yes_no" || t === "legal") {
    return [
      { value: "Sim", label: "Sim" },
      { value: "Não", label: "Não" },
    ];
  }

  if (t === "rating") {
    return [1, 2, 3, 4, 5].map((n) => ({
      value: String(n),
      label: `${"★".repeat(n)}${"☆".repeat(5 - n)} (${n})`,
    }));
  }

  if (t === "nps") {
    return Array.from({ length: 11 }, (_, i) => ({
      value: String(i),
      label: `${i}${i === 0 ? " (Muito improvável)" : i === 10 ? " (Muito provável)" : ""}`,
    }));
  }

  if (t === "opinion_scale") {
    return [1, 2, 3, 4, 5].map((n) => ({
      value: String(n),
      label: String(n),
    }));
  }

  if ((t === "multiple_choice" || t === "dropdown" || t === "image_choice") && field.options?.length) {
    return field.options.map((opt) => ({ value: opt, label: opt }));
  }

  if (t === "checkbox" && field.options?.length) {
    return field.options.map((opt) => ({ value: opt, label: opt }));
  }

  return null; // free text input
};

// Human-readable field type badge
const getFieldTypeBadge = (type: string): { label: string; icon: typeof Star } => {
  const map: Record<string, { label: string; icon: typeof Star }> = {
    yes_no: { label: "Sim/Não", icon: ThumbsUp },
    legal: { label: "Legal", icon: ThumbsUp },
    rating: { label: "Avaliação", icon: Star },
    nps: { label: "NPS 0-10", icon: Hash },
    opinion_scale: { label: "Escala 1-5", icon: Hash },
    multiple_choice: { label: "Múltipla escolha", icon: ListChecks },
    dropdown: { label: "Dropdown", icon: ChevronDown },
    image_choice: { label: "Imagem", icon: ListChecks },
    checkbox: { label: "Checkbox", icon: ListChecks },
    short_text: { label: "Texto curto", icon: Type },
    long_text: { label: "Texto longo", icon: Type },
    number: { label: "Número", icon: Hash },
    email: { label: "Email", icon: Type },
    phone: { label: "Telefone", icon: Type },
  };
  return map[type] || { label: type, icon: Type };
};

export const BranchingPanel = ({ field, fields, logic, onUpdateLogic }: BranchingPanelProps) => {
  const fieldLogic = logic.find((l) => l.field_id === field.id) || {
    field_id: field.id,
    rules: [],
    default_action: { type: "next" as const },
  };

  const updateFieldLogic = (updated: FieldLogic) => {
    const exists = logic.findIndex((l) => l.field_id === field.id);
    if (exists >= 0) {
      const newLogic = [...logic];
      newLogic[exists] = updated;
      onUpdateLogic(newLogic);
    } else {
      onUpdateLogic([...logic, updated]);
    }
  };

  const validOps = getOpsForField(field.type);
  const valueOptions = getValueOptions(field);

  const addRule = () => {
    const defaultOp = validOps[0] || "equals";
    const defaultValue = valueOptions?.[0]?.value ?? "";
    updateFieldLogic({
      ...fieldLogic,
      rules: [
        ...fieldLogic.rules,
        {
          condition: { op: defaultOp, value: defaultValue },
          action: { type: "next" },
        },
      ],
    });
  };

  const updateRule = (index: number, rule: LogicRule) => {
    const newRules = [...fieldLogic.rules];
    newRules[index] = rule;
    updateFieldLogic({ ...fieldLogic, rules: newRules });
  };

  const removeRule = (index: number) => {
    updateFieldLogic({
      ...fieldLogic,
      rules: fieldLogic.rules.filter((_, i) => i !== index),
    });
  };

  const updateDefaultAction = (value: string) => {
    if (value === "__next__") {
      updateFieldLogic({ ...fieldLogic, default_action: { type: "next" } });
    } else if (value === "__end__") {
      updateFieldLogic({ ...fieldLogic, default_action: { type: "end" } });
    } else {
      updateFieldLogic({ ...fieldLogic, default_action: { type: "jump_to", target: value } });
    }
  };

  // Answerable fields only (exclude welcome_screen, end_screen, statement)
  const answerableFields = fields.filter(
    (f) => !["welcome_screen", "end_screen", "statement", "redirect_url"].includes(f.type)
  );

  const jumpTargets = [
    { value: "__next__", label: "Próxima pergunta (padrão)" },
    ...answerableFields.filter((f) => f.id !== field.id).map((f) => ({
      value: f.id,
      label: f.label || f.type,
    })),
    { value: "__end__", label: "Encerrar formulário" },
  ];

  const typeBadge = getFieldTypeBadge(field.type);
  const TypeIcon = typeBadge.icon;

  // Non-branching field types
  const nonBranchable = ["welcome_screen", "end_screen", "statement", "redirect_url"];
  if (nonBranchable.includes(field.type)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Lógica condicional</h3>
        </div>
        <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Este tipo de campo não suporta lógica condicional.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Lógica condicional</h3>
      </div>

      {/* Current field info */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
        <p className="text-xs text-muted-foreground">Quando este campo for respondido:</p>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{field.label || "Sem título"}</span>
          <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
            <TypeIcon className="h-3 w-3" />
            {typeBadge.label}
          </Badge>
        </div>
        {valueOptions && (
          <p className="text-[10px] text-muted-foreground">
            Valores possíveis: {valueOptions.length <= 6
              ? valueOptions.map((v) => v.label.replace(/★|☆/g, "").trim()).join(", ")
              : `${valueOptions.length} opções`
            }
          </p>
        )}
      </div>

      {/* Rules */}
      {fieldLogic.rules.map((rule, i) => (
        <div key={i} className="border rounded-lg overflow-hidden">
          {/* Rule header */}
          <div className="bg-primary/5 px-3 py-2 flex items-center justify-between border-b">
            <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
              Regra {i + 1}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRule(i)}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>

          <div className="p-3 space-y-3">
            {/* Condition: SE [operator] */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Se a resposta</Label>
              <Select
                value={rule.condition.op}
                onValueChange={(v) =>
                  updateRule(i, { ...rule, condition: { ...rule.condition, op: v as ConditionOp } })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPS.filter((op) => validOps.includes(op.value)).map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Condition value */}
            {!["is_set", "is_not_set"].includes(rule.condition.op) && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Valor</Label>
                {valueOptions ? (
                  <Select
                    value={String(rule.condition.value ?? "")}
                    onValueChange={(v) =>
                      updateRule(i, { ...rule, condition: { ...rule.condition, value: v } })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione um valor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {valueOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-8 text-xs"
                    placeholder="Digite o valor..."
                    value={String(rule.condition.value ?? "")}
                    onChange={(e) =>
                      updateRule(i, { ...rule, condition: { ...rule.condition, value: e.target.value } })
                    }
                  />
                )}
              </div>
            )}

            {/* Action: ENTÃO ir para */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                <ArrowRight className="h-3 w-3" /> Então ir para
              </Label>
              <Select
                value={
                  rule.action.type === "end"
                    ? "__end__"
                    : rule.action.type === "next"
                    ? "__next__"
                    : rule.action.target || "__next__"
                }
                onValueChange={(v) => {
                  if (v === "__end__") {
                    updateRule(i, { ...rule, action: { type: "end" } });
                  } else if (v === "__next__") {
                    updateRule(i, { ...rule, action: { type: "next" } });
                  } else {
                    updateRule(i, { ...rule, action: { type: "jump_to", target: v } });
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Próxima pergunta" />
                </SelectTrigger>
                <SelectContent>
                  {jumpTargets.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ))}

      {/* Add rule button */}
      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={addRule}>
        <Plus className="h-3.5 w-3.5" /> Adicionar regra
      </Button>

      {/* Default action */}
      {fieldLogic.rules.length > 0 && (
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            Se nenhuma regra for atendida
          </Label>
          <Select
            value={
              fieldLogic.default_action.type === "end"
                ? "__end__"
                : fieldLogic.default_action.type === "jump_to" && fieldLogic.default_action.target
                ? fieldLogic.default_action.target
                : "__next__"
            }
            onValueChange={updateDefaultAction}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jumpTargets.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Empty state */}
      {fieldLogic.rules.length === 0 && (
        <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
          <GitBranch className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-xs text-muted-foreground">
            Nenhuma regra configurada. Por padrão, o formulário segue para a próxima pergunta.
          </p>
          <p className="text-[10px] text-muted-foreground">
            Adicione regras para pular perguntas ou encerrar o formulário com base na resposta.
          </p>
        </div>
      )}
    </div>
  );
};
