import { getFieldTypeConfig, FIELD_CATEGORIES } from "@/config/fieldTypes";
import type { FormField } from "@/types/workflow";
import { GitBranch } from "lucide-react";

interface WorkflowStepCardProps {
  field: FormField;
  index: number;
  selected: boolean;
  hasLogic: boolean;
  onClick: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Informações de contato": "bg-blue-500",
  "Texto": "bg-emerald-500",
  "Escolha": "bg-purple-500",
  "Classificação e avaliação": "bg-amber-500",
  "Outro": "bg-gray-500",
};

export const WorkflowStepCard = ({ field, index, selected, hasLogic, onClick }: WorkflowStepCardProps) => {
  const cfg = getFieldTypeConfig(field.type);
  if (!cfg) return null;

  const Icon = cfg.icon;
  const categoryColor = CATEGORY_COLORS[cfg.category] || "bg-gray-500";

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 transition-all min-w-[110px] max-w-[140px] ${
        selected
          ? "border-primary bg-primary/10 shadow-lg ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 bg-card hover:shadow-md"
      }`}
    >
      {/* Step number */}
      <span className="absolute -top-2.5 -left-2.5 h-5 w-5 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
        {index + 1}
      </span>

      {/* Logic badge */}
      {hasLogic && (
        <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
          <GitBranch className="h-3 w-3 text-primary-foreground" />
        </span>
      )}

      {/* Icon with category color indicator */}
      <div className={`h-8 w-8 rounded-lg ${categoryColor}/10 flex items-center justify-center`}>
        <Icon className={`h-4.5 w-4.5 ${cfg.color}`} />
      </div>

      {/* Label */}
      <span className="text-xs font-medium truncate max-w-[100px] text-center leading-tight">
        {field.label || `Q${index + 1}`}
      </span>

      {/* Type */}
      <span className="text-[10px] text-muted-foreground leading-none">{cfg.label}</span>
    </button>
  );
};
