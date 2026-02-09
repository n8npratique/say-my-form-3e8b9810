import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GitBranch } from "lucide-react";
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

  const addRule = () => {
    updateFieldLogic({
      ...fieldLogic,
      rules: [
        ...fieldLogic.rules,
        {
          condition: { op: "equals", value: "" },
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

  const jumpTargets = [
    ...fields.filter((f) => f.id !== field.id).map((f) => ({
      value: f.id,
      label: f.label || f.type,
    })),
    { value: "__end__", label: "Encerrar formulário" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Lógica condicional</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        Quando "{field.label || "esta pergunta"}" for respondida:
      </p>

      {fieldLogic.rules.map((rule, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">SE</span>
            <Select
              value={rule.condition.op}
              onValueChange={(v) =>
                updateRule(i, { ...rule, condition: { ...rule.condition, op: v as ConditionOp } })
              }
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeRule(i)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>

          {!["is_set", "is_not_set"].includes(rule.condition.op) && (
            <div>
              <Label className="text-xs">Valor</Label>
              {field.options && field.options.length > 0 ? (
                <Select
                  value={String(rule.condition.value ?? "")}
                  onValueChange={(v) =>
                    updateRule(i, { ...rule, condition: { ...rule.condition, value: v } })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs"
                  value={String(rule.condition.value ?? "")}
                  onChange={(e) =>
                    updateRule(i, { ...rule, condition: { ...rule.condition, value: e.target.value } })
                  }
                />
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">ENTÃO ir para</Label>
            <Select
              value={rule.action.type === "end" ? "__end__" : rule.action.target || ""}
              onValueChange={(v) => {
                if (v === "__end__") {
                  updateRule(i, { ...rule, action: { type: "end" } });
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
      ))}

      <Button variant="outline" size="sm" className="w-full" onClick={addRule}>
        <Plus className="h-4 w-4 mr-1" /> Adicionar regra
      </Button>
    </div>
  );
};
