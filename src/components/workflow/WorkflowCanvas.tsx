import { getFieldTypeConfig } from "@/config/fieldTypes";
import type { FormField, FieldLogic } from "@/types/workflow";
import { ArrowRight, GitBranch } from "lucide-react";

interface WorkflowCanvasProps {
  fields: FormField[];
  logic: FieldLogic[];
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
}

export const WorkflowCanvas = ({ fields, logic, selectedFieldId, onSelectField }: WorkflowCanvasProps) => {
  const hasLogic = (fieldId: string) => logic.some((l) => l.field_id === fieldId && l.rules.length > 0);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-4">
        {fields.map((field, i) => {
          const cfg = getFieldTypeConfig(field.type);
          if (!cfg) return null;
          const Icon = cfg.icon;
          const selected = selectedFieldId === field.id;
          const logicActive = hasLogic(field.id);

          return (
            <div key={field.id} className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onSelectField(field.id)}
                className={`relative flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 transition-all min-w-[100px] ${
                  selected
                    ? "border-primary bg-primary/10 shadow-md"
                    : "border-border hover:border-primary/40 bg-card"
                }`}
              >
                {logicActive && (
                  <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <GitBranch className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <Icon className={`h-5 w-5 ${cfg.color}`} />
                <span className="text-xs font-medium truncate max-w-[80px]">
                  {field.label || `Q${i + 1}`}
                </span>
                <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
              </button>
              {i < fields.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
