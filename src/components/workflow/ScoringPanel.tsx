import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Award, PanelBottom } from "lucide-react";
import type { FormField, ScoringConfig } from "@/types/workflow";

interface ScoringPanelProps {
  fields: FormField[];
  scoring: ScoringConfig;
  onUpdateScoring: (scoring: ScoringConfig) => void;
}

const CHOICE_TYPES = ["multiple_choice", "dropdown", "image_choice", "yes_no", "checkbox"];

export const ScoringPanel = ({ fields, scoring, onUpdateScoring }: ScoringPanelProps) => {
  const choiceFields = fields.filter((f) => CHOICE_TYPES.includes(f.type) && f.options?.length);
  const endScreenFields = fields.filter((f) => f.type === "end_screen");

  const setScore = (fieldId: string, option: string, score: number) => {
    const fieldScores = { ...scoring.field_scores };
    if (!fieldScores[fieldId]) fieldScores[fieldId] = {};
    fieldScores[fieldId] = { ...fieldScores[fieldId], [option]: score };
    onUpdateScoring({ ...scoring, field_scores: fieldScores });
  };

  const addRange = () => {
    onUpdateScoring({
      ...scoring,
      ranges: [...scoring.ranges, { min: 0, max: 100, label: "" }],
    });
  };

  const updateRange = (index: number, key: string, value: any) => {
    const ranges = [...scoring.ranges];
    ranges[index] = { ...ranges[index], [key]: value };
    onUpdateScoring({ ...scoring, ranges });
  };

  const removeRange = (index: number) => {
    onUpdateScoring({ ...scoring, ranges: scoring.ranges.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Pontuação</h3>
        </div>
        <Switch
          checked={scoring.enabled}
          onCheckedChange={(enabled) => onUpdateScoring({ ...scoring, enabled })}
        />
      </div>

      {scoring.enabled && (
        <>
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Pontos por opção</h4>
            {choiceFields.map((field) => (
              <div key={field.id} className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">{field.label || field.type}</p>
                {field.options?.map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <span className="text-xs flex-1 truncate">{opt}</span>
                    <Input
                      type="number"
                      className="h-7 w-20 text-xs"
                      value={scoring.field_scores[field.id]?.[opt] ?? 0}
                      onChange={(e) => setScore(field.id, opt, Number(e.target.value))}
                    />
                    <span className="text-xs text-muted-foreground">pts</span>
                  </div>
                ))}
              </div>
            ))}
            {choiceFields.length === 0 && (
              <p className="text-xs text-muted-foreground">Adicione campos de escolha para atribuir pontuação.</p>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Faixas de resultado</h4>
            {scoring.ranges.map((range, i) => (
              <div key={i} className="border rounded-lg p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="h-7 w-16 text-xs"
                    placeholder="Min"
                    value={range.min}
                    onChange={(e) => updateRange(i, "min", Number(e.target.value))}
                  />
                  <span className="text-xs">—</span>
                  <Input
                    type="number"
                    className="h-7 w-16 text-xs"
                    placeholder="Max"
                    value={range.max}
                    onChange={(e) => updateRange(i, "max", Number(e.target.value))}
                  />
                  <Input
                    className="h-7 flex-1 text-xs"
                    placeholder="Rótulo"
                    value={range.label ?? ""}
                    onChange={(e) => updateRange(i, "label", e.target.value)}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeRange(i)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                {endScreenFields.length > 0 && (
                  <div className="flex items-center gap-2">
                    <PanelBottom className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Label className="text-xs text-muted-foreground shrink-0">Tela final:</Label>
                    <Select
                      value={range.end_screen_id || "__default__"}
                      onValueChange={(v) => updateRange(i, "end_screen_id", v === "__default__" ? "" : v)}
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
            <Button variant="outline" size="sm" className="w-full" onClick={addRange}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar faixa
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
