import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GitBranch, ArrowRight, ChevronDown, Star, ThumbsUp, Hash, Type, ListChecks, AlertTriangle, Settings2 } from "lucide-react";
import type { FormField, FieldLogic, LogicRule, ConditionOp } from "@/types/workflow";
import { validateLogic } from "@/lib/logicEngine";

interface BranchingPanelProps {
  field: FormField;
  fields: FormField[];
  logic: FieldLogic[];
  onUpdateLogic: (logic: FieldLogic[]) => void;
}

const OPS: { value: ConditionOp; label: string }[] = [
  { value: "always", label: "Sempre (pular sem condição)" },
  { value: "equals", label: "É igual a" },
  { value: "not_equals", label: "Não é igual a" },
  { value: "contains", label: "Contém" },
  { value: "greater_than", label: "Maior que" },
  { value: "less_than", label: "Menor que" },
  { value: "is_set", label: "Está preenchido" },
  { value: "is_not_set", label: "Não está preenchido" },
];

const getOpsForField = (type: string): ConditionOp[] => {
  switch (type) {
    case "yes_no":
    case "legal":
      return ["equals", "not_equals", "is_set", "is_not_set", "always"];
    case "multiple_choice":
    case "dropdown":
    case "image_choice":
      return ["equals", "not_equals", "is_set", "is_not_set", "always"];
    case "checkbox":
    case "ranking":
      return ["contains", "is_set", "is_not_set", "always"];
    case "rating":
    case "nps":
    case "opinion_scale":
      return ["equals", "not_equals", "greater_than", "less_than", "is_set", "is_not_set", "always"];
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
      return ["equals", "not_equals", "contains", "is_set", "is_not_set", "always"];
    case "number":
      return ["equals", "not_equals", "greater_than", "less_than", "is_set", "is_not_set", "always"];
    default:
      return ["equals", "not_equals", "contains", "greater_than", "less_than", "is_set", "is_not_set", "always"];
  }
};

// Fields that support the simple "each option -> destination" mode
const isSimpleMode = (field: FormField): boolean => {
  const t = field.type;
  if (t === "yes_no" || t === "legal") return true;
  if ((t === "multiple_choice" || t === "dropdown" || t === "image_choice") && field.options?.length) return true;
  return false;
};

// Get options for simple mode
const getSimpleOptions = (field: FormField): string[] => {
  if (field.type === "yes_no" || field.type === "legal") return ["Sim", "Não"];
  return field.options || [];
};

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

  // Answerable fields only
  const answerableFields = fields.filter(
    (f) => !["welcome_screen", "end_screen", "statement", "redirect_url"].includes(f.type)
  );
  const endScreenFields = fields.filter((f) => f.type === "end_screen");

  const jumpTargets = [
    { value: "__next__", label: "Próxima pergunta" },
    ...answerableFields.filter((f) => f.id !== field.id).map((f) => {
      const idx = answerableFields.findIndex((af) => af.id === f.id);
      return { value: f.id, label: `Q${idx + 1}. ${f.label || f.type}` };
    }),
    ...(endScreenFields.length > 0 ? [
      { value: "__end_divider__", label: "── Telas finais ──" },
      ...endScreenFields.map((f, i) => ({
        value: f.id,
        label: `🏁 ${f.label || `Tela final ${i + 1}`}`,
      })),
    ] : []),
    { value: "__end__", label: "Encerrar formulário" },
  ];

  // Helper to get current target for a specific option value
  const getTargetForOption = (optionValue: string): string => {
    const rule = fieldLogic.rules.find(
      (r) => r.condition.op === "equals" && String(r.condition.value) === optionValue
    );
    if (!rule) return "__next__";
    if (rule.action.type === "end") return "__end__";
    if (rule.action.type === "jump_to" && rule.action.target) return rule.action.target;
    return "__next__";
  };

  // Helper to set target for a specific option
  const setTargetForOption = (optionValue: string, target: string) => {
    const newRules = fieldLogic.rules.filter(
      (r) => !(r.condition.op === "equals" && String(r.condition.value) === optionValue)
    );

    if (target !== "__next__") {
      const action = target === "__end__"
        ? { type: "end" as const }
        : { type: "jump_to" as const, target };
      newRules.push({
        condition: { op: "equals" as ConditionOp, value: optionValue },
        action,
      });
    }

    updateFieldLogic({ ...fieldLogic, rules: newRules });
  };

  const typeBadge = getFieldTypeBadge(field.type);
  const TypeIcon = typeBadge.icon;

  // Non-branching field types
  const nonBranchable = ["welcome_screen", "end_screen", "statement", "redirect_url"];
  if (nonBranchable.includes(field.type)) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Lógica condicional</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Este tipo de campo não suporta lógica condicional.
        </p>
      </div>
    );
  }

  const simple = isSimpleMode(field);
  const simpleOptions = simple ? getSimpleOptions(field) : [];

  // Validation
  const allFieldIds = fields.map((f) => f.id);
  const issues = validateLogic(logic, allFieldIds).filter((i) => i.fieldId === field.id);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Lógica</h3>
        </div>
        <Badge variant="secondary" className="text-[10px] gap-1">
          <TypeIcon className="h-3 w-3" />
          {typeBadge.label}
        </Badge>
      </div>

      {/* Field label */}
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <p className="text-xs font-medium">{field.label || "Sem título"}</p>
      </div>

      {/* ===== SIMPLE MODE: each option → destination ===== */}
      {simple && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground font-medium">
            Para cada resposta, escolha o destino:
          </p>
          {simpleOptions.map((opt) => (
            <div key={opt} className="flex items-center gap-2 rounded-md border px-3 py-2 bg-background">
              <span className="text-xs font-medium flex-1 truncate">{opt}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <Select
                value={getTargetForOption(opt)}
                onValueChange={(v) => setTargetForOption(opt, v)}
              >
                <SelectTrigger className="h-7 text-[11px] w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {jumpTargets.filter((t) => t.value !== "__end_divider__").map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          {/* Default for options not configured */}
          <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2">
            <span className="text-xs text-muted-foreground flex-1">Qualquer outra</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <Select
              value={
                fieldLogic.default_action.type === "end" ? "__end__"
                : fieldLogic.default_action.type === "jump_to" && fieldLogic.default_action.target
                ? fieldLogic.default_action.target
                : "__next__"
              }
              onValueChange={(v) => {
                if (v === "__next__") updateFieldLogic({ ...fieldLogic, default_action: { type: "next" } });
                else if (v === "__end__") updateFieldLogic({ ...fieldLogic, default_action: { type: "end" } });
                else updateFieldLogic({ ...fieldLogic, default_action: { type: "jump_to", target: v } });
              }}
            >
              <SelectTrigger className="h-7 text-[11px] w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jumpTargets.filter((t) => t.value !== "__end_divider__").map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ===== ADVANCED MODE: rule-based ===== */}
      {!simple && (
        <div className="space-y-3">
          {/* Quick always-jump when no rules */}
          {fieldLogic.rules.length === 0 && (
            <div className="rounded-md border border-dashed p-3 space-y-2">
              <p className="text-[11px] text-muted-foreground font-medium">Pular sempre para:</p>
              <Select
                value=""
                onValueChange={(v) => {
                  const action = v === "__end__"
                    ? { type: "end" as const }
                    : { type: "jump_to" as const, target: v };
                  updateFieldLogic({
                    ...fieldLogic,
                    rules: [{ condition: { op: "always" as ConditionOp }, action }],
                    default_action: action,
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione o destino..." />
                </SelectTrigger>
                <SelectContent>
                  {jumpTargets.filter((t) => t.value !== "__next__" && t.value !== "__end_divider__").map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Rules */}
          {fieldLogic.rules.map((rule, i) => (
            <div key={i} className="border rounded-md overflow-hidden">
              <div className="bg-primary/5 px-3 py-1.5 flex items-center justify-between border-b">
                <span className="text-[10px] font-semibold text-primary uppercase">Regra {i + 1}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                  updateFieldLogic({ ...fieldLogic, rules: fieldLogic.rules.filter((_, ri) => ri !== i) });
                }}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
              <div className="p-2.5 space-y-2">
                <Select
                  value={rule.condition.op}
                  onValueChange={(v) => {
                    const newRules = [...fieldLogic.rules];
                    newRules[i] = { ...rule, condition: { ...rule.condition, op: v as ConditionOp } };
                    updateFieldLogic({ ...fieldLogic, rules: newRules });
                  }}
                >
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPS.filter((op) => getOpsForField(field.type).includes(op.value)).map((op) => (
                      <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {!["is_set", "is_not_set", "always"].includes(rule.condition.op) && (
                  <Input
                    className="h-7 text-xs"
                    placeholder="Valor..."
                    value={String(rule.condition.value ?? "")}
                    onChange={(e) => {
                      const newRules = [...fieldLogic.rules];
                      newRules[i] = { ...rule, condition: { ...rule.condition, value: e.target.value } };
                      updateFieldLogic({ ...fieldLogic, rules: newRules });
                    }}
                  />
                )}

                <div className="flex items-center gap-1.5">
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <Select
                    value={
                      rule.action.type === "end" ? "__end__"
                      : rule.action.type === "next" ? "__next__"
                      : rule.action.target || "__next__"
                    }
                    onValueChange={(v) => {
                      const newRules = [...fieldLogic.rules];
                      const action = v === "__end__" ? { type: "end" as const }
                        : v === "__next__" ? { type: "next" as const }
                        : { type: "jump_to" as const, target: v };
                      newRules[i] = { ...rule, action };
                      updateFieldLogic({ ...fieldLogic, rules: newRules });
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {jumpTargets.filter((t) => t.value !== "__end_divider__").map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}

          {fieldLogic.rules.length > 0 && (
            <Button variant="outline" size="sm" className="w-full gap-1.5 h-7 text-xs" onClick={() => {
              const defaultOp = getOpsForField(field.type)[0] || "equals";
              updateFieldLogic({
                ...fieldLogic,
                rules: [...fieldLogic.rules, { condition: { op: defaultOp, value: "" }, action: { type: "next" } }],
              });
            }}>
              <Plus className="h-3 w-3" /> Adicionar regra
            </Button>
          )}
        </div>
      )}

      {/* Validation warnings */}
      {issues.length > 0 && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 space-y-1">
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Problemas
          </p>
          {issues.map((issue, i) => (
            <p key={i} className="text-[10px] text-amber-700 dark:text-amber-300">{issue.issue}</p>
          ))}
        </div>
      )}
    </div>
  );
};
