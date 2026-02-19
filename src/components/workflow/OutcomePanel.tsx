import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Trophy, PanelBottom } from "lucide-react";
import type { FormField, OutcomesConfig } from "@/types/workflow";

interface OutcomePanelProps {
  fields: FormField[];
  outcomes: OutcomesConfig;
  onUpdateOutcomes: (outcomes: OutcomesConfig) => void;
}

const CHOICE_TYPES = ["multiple_choice", "dropdown", "image_choice", "yes_no", "checkbox"];

export const OutcomePanel = ({ fields, outcomes, onUpdateOutcomes }: OutcomePanelProps) => {
  const choiceFields = fields.filter((f) => CHOICE_TYPES.includes(f.type) && f.options?.length);
  const endScreenFields = fields.filter((f) => f.type === "end_screen");

  const addOutcome = () => {
    const id = `outcome_${Date.now()}`;
    onUpdateOutcomes({
      ...outcomes,
      definitions: [...outcomes.definitions, { id, label: "", description: "" }],
    });
  };

  const updateDefinition = (index: number, key: string, value: string) => {
    const defs = [...outcomes.definitions];
    defs[index] = { ...defs[index], [key]: value };
    onUpdateOutcomes({ ...outcomes, definitions: defs });
  };

  const removeOutcome = (index: number) => {
    const removed = outcomes.definitions[index];
    const defs = outcomes.definitions.filter((_, i) => i !== index);
    // Clean field_outcomes references
    const field_outcomes = { ...outcomes.field_outcomes };
    for (const fid of Object.keys(field_outcomes)) {
      for (const opt of Object.keys(field_outcomes[fid])) {
        if (field_outcomes[fid][opt] === removed.id) {
          delete field_outcomes[fid][opt];
        }
      }
    }
    onUpdateOutcomes({ ...outcomes, definitions: defs, field_outcomes });
  };

  const setFieldOutcome = (fieldId: string, option: string, outcomeId: string) => {
    const field_outcomes = { ...outcomes.field_outcomes };
    if (!field_outcomes[fieldId]) field_outcomes[fieldId] = {};
    if (outcomeId === "__none__") {
      delete field_outcomes[fieldId][option];
    } else {
      field_outcomes[fieldId][option] = outcomeId;
    }
    onUpdateOutcomes({ ...outcomes, field_outcomes });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Outcome Quiz</h3>
        </div>
        <Switch
          checked={outcomes.enabled}
          onCheckedChange={(enabled) => onUpdateOutcomes({ ...outcomes, enabled })}
        />
      </div>

      {outcomes.enabled && (
        <>
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Resultados possíveis</h4>
            {outcomes.definitions.map((def, i) => (
              <div key={def.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    className="h-7 flex-1 text-xs"
                    placeholder="Nome do resultado"
                    value={def.label}
                    onChange={(e) => updateDefinition(i, "label", e.target.value)}
                  />
                  <Input
                    className="h-7 flex-1 text-xs"
                    placeholder="Descrição"
                    value={def.description ?? ""}
                    onChange={(e) => updateDefinition(i, "description", e.target.value)}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeOutcome(i)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                {endScreenFields.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <PanelBottom className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Label className="text-xs text-muted-foreground shrink-0">Tela final:</Label>
                    <Select
                      value={def.end_screen_id || "__default__"}
                      onValueChange={(v) => updateDefinition(i, "end_screen_id", v === "__default__" ? "" : v)}
                    >
                      <SelectTrigger className="h-6 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Padrão (genérica)</SelectItem>
                        {endScreenFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.label || "Tela final"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={addOutcome}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar resultado
            </Button>
          </div>

          {outcomes.definitions.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">Associar opções a resultados</h4>
              {choiceFields.map((field) => (
                <div key={field.id} className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium">{field.label || field.type}</p>
                  {field.options?.map((opt) => (
                    <div key={opt} className="flex items-center gap-2">
                      <span className="text-xs flex-1 truncate">{opt}</span>
                      <Select
                        value={outcomes.field_outcomes[field.id]?.[opt] || "__none__"}
                        onValueChange={(v) => setFieldOutcome(field.id, opt, v)}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {outcomes.definitions.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.label || d.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
