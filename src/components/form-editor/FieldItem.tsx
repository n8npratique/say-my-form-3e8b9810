import { getFieldTypeConfig, type FieldType } from "@/config/fieldTypes";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash2 } from "lucide-react";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface FieldItemProps {
  field: FormField;
  index: number;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export const FieldItem = ({ field, index, selected, onClick, onDelete }: FieldItemProps) => {
  const cfg = getFieldTypeConfig(field.type);
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/30 hover:bg-muted/50"
      }`}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 cursor-grab" />
      <div className={`flex items-center justify-center h-8 w-8 rounded-md bg-muted shrink-0`}>
        <Icon className={`h-4 w-4 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{index + 1}.</span>
          <span className="text-sm font-medium truncate">{field.label || "Sem título"}</span>
        </div>
        <span className="text-xs text-muted-foreground">{cfg.label}</span>
      </div>
      {field.required && (
        <span className="text-xs text-destructive font-medium">*</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
};
