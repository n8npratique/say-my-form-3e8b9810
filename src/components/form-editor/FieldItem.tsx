import { getFieldTypeConfig } from "@/config/fieldTypes";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash2 } from "lucide-react";
import type { FormField } from "@/types/workflow";

export type { FormField };

interface FieldItemProps {
  field: FormField;
  index: number;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  dragOver?: "top" | "bottom" | null;
}

export const FieldItem = ({
  field, index, selected, onClick, onDelete,
  draggable, onDragStart, onDragOver, onDrop, onDragEnd, dragOver,
}: FieldItemProps) => {
  const cfg = getFieldTypeConfig(field.type);
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/30 hover:bg-muted/50"
      } ${dragOver === "top" ? "border-t-2 border-t-primary" : ""} ${dragOver === "bottom" ? "border-b-2 border-b-primary" : ""}`}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 cursor-grab" />
      <div className="flex items-center justify-center h-8 w-8 rounded-md bg-muted shrink-0">
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
        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
};
