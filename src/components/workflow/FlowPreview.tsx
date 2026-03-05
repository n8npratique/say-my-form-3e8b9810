import { useMemo } from "react";
import type { FormField, FieldLogic } from "@/types/workflow";
import { ArrowDown, GitBranch, Ban, SkipForward, CheckCircle2, Play } from "lucide-react";

interface FlowPreviewProps {
  fields: FormField[];
  logic: FieldLogic[];
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
}

interface FlowNode {
  field: FormField;
  index: number;
  branches: {
    label: string;
    targetId: string | "end";
    targetLabel: string;
    isDefault: boolean;
  }[];
}

const TYPE_COLORS: Record<string, string> = {
  welcome_screen: "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  end_screen: "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-400",
  multiple_choice: "bg-blue-500/15 border-blue-500/30",
  dropdown: "bg-blue-500/15 border-blue-500/30",
  checkbox: "bg-blue-500/15 border-blue-500/30",
  yes_no: "bg-amber-500/15 border-amber-500/30",
  contact_info: "bg-purple-500/15 border-purple-500/30",
  short_text: "bg-slate-500/15 border-slate-500/30",
  long_text: "bg-slate-500/15 border-slate-500/30",
  file_upload: "bg-orange-500/15 border-orange-500/30",
  nps: "bg-teal-500/15 border-teal-500/30",
  rating: "bg-yellow-500/15 border-yellow-500/30",
};

const TYPE_LABELS: Record<string, string> = {
  welcome_screen: "Boas-vindas",
  end_screen: "Tela final",
  multiple_choice: "Multipla escolha",
  dropdown: "Dropdown",
  checkbox: "Checkbox",
  yes_no: "Sim/Nao",
  contact_info: "Contato",
  short_text: "Texto curto",
  long_text: "Texto longo",
  file_upload: "Upload",
  nps: "NPS",
  rating: "Avaliacao",
  statement: "Mensagem",
  email: "Email",
  phone: "Telefone",
  number: "Numero",
  date: "Data",
  appointment: "Agendamento",
};

const OP_LABELS: Record<string, string> = {
  equals: "=",
  not_equals: "!=",
  contains: "contem",
  greater_than: ">",
  less_than: "<",
  is_set: "preenchido",
  is_not_set: "vazio",
};

export const FlowPreview = ({ fields, logic, selectedFieldId, onSelectField }: FlowPreviewProps) => {
  const flowNodes = useMemo<FlowNode[]>(() => {
    return fields.map((field, index) => {
      const fieldLogic = logic.find((l) => l.field_id === field.id);
      const branches: FlowNode["branches"] = [];

      if (fieldLogic && fieldLogic.rules.length > 0) {
        for (const rule of fieldLogic.rules) {
          const opLabel = OP_LABELS[rule.condition.op] || rule.condition.op;
          const val = rule.condition.value != null ? String(rule.condition.value) : "";
          const condLabel = ["is_set", "is_not_set"].includes(rule.condition.op)
            ? opLabel
            : `${opLabel} "${val.length > 15 ? val.slice(0, 15) + "..." : val}"`;

          let targetId: string | "end" = "end";
          let targetLabel = "Encerrar";

          if (rule.action.type === "jump_to" && rule.action.target) {
            targetId = rule.action.target;
            const targetField = fields.find((f) => f.id === rule.action.target);
            if (targetField) {
              const tIdx = fields.indexOf(targetField);
              targetLabel = targetField.type === "end_screen"
                ? targetField.label || "Tela final"
                : `Q${tIdx + 1}`;
            }
          } else if (rule.action.type === "next") {
            const nextField = fields[index + 1];
            if (nextField) {
              targetId = nextField.id;
              targetLabel = `Q${index + 2}`;
            }
          }

          branches.push({ label: condLabel, targetId, targetLabel, isDefault: false });
        }

        // Default action
        const da = fieldLogic.default_action;
        let defaultTargetId: string | "end" = "end";
        let defaultTargetLabel = "Encerrar";
        if (da.type === "next") {
          const nextField = fields[index + 1];
          if (nextField) {
            defaultTargetId = nextField.id;
            defaultTargetLabel = `Q${index + 2}`;
          }
        } else if (da.type === "jump_to" && da.target) {
          defaultTargetId = da.target;
          const tf = fields.find((f) => f.id === da.target);
          if (tf) {
            const tIdx = fields.indexOf(tf);
            defaultTargetLabel = tf.type === "end_screen" ? (tf.label || "Tela final") : `Q${tIdx + 1}`;
          }
        }
        branches.push({ label: "senao", targetId: defaultTargetId, targetLabel: defaultTargetLabel, isDefault: true });
      }

      return { field, index, branches };
    });
  }, [fields, logic]);

  const hasAnyLogic = logic.some((l) => l.rules.length > 0);

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        Nenhum campo no formulario.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 mb-3">
        <GitBranch className="h-4 w-4 text-primary" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Fluxo do formulario
        </h4>
      </div>

      <div className="relative">
        {flowNodes.map((node, ni) => {
          const isSelected = node.field.id === selectedFieldId;
          const isWelcome = node.field.type === "welcome_screen";
          const isEnd = node.field.type === "end_screen";
          const colorClass = TYPE_COLORS[node.field.type] || "bg-muted/50 border-border";
          const typeLabel = TYPE_LABELS[node.field.type] || node.field.type;
          const hasBranches = node.branches.length > 0;

          return (
            <div key={node.field.id}>
              {/* Node */}
              <button
                onClick={() => onSelectField(node.field.id)}
                className={`
                  w-full text-left rounded-lg border px-3 py-2 transition-all
                  hover:ring-2 hover:ring-primary/30
                  ${colorClass}
                  ${isSelected ? "ring-2 ring-primary shadow-sm" : ""}
                `}
              >
                <div className="flex items-center gap-2">
                  {isWelcome && <Play className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                  {isEnd && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />}
                  {!isWelcome && !isEnd && (
                    <span className="text-[10px] font-bold text-muted-foreground shrink-0 w-5">
                      Q{node.index + 1}
                    </span>
                  )}
                  <span className="text-xs font-medium truncate flex-1">
                    {node.field.label || typeLabel}
                  </span>
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {typeLabel}
                  </span>
                </div>

                {/* Branch indicators */}
                {hasBranches && (
                  <div className="mt-1.5 space-y-1 pl-5">
                    {node.branches.map((b, bi) => (
                      <div
                        key={bi}
                        className={`flex items-center gap-1.5 text-[10px] ${b.isDefault ? "text-muted-foreground" : ""}`}
                      >
                        {b.targetId === "end" ? (
                          <Ban className="h-3 w-3 shrink-0 text-destructive" />
                        ) : (
                          <SkipForward className="h-3 w-3 shrink-0 text-primary" />
                        )}
                        <span className={`${b.isDefault ? "italic" : "font-medium"}`}>
                          {b.label}
                        </span>
                        <ArrowDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground rotate-[-90deg]" />
                        <span className={`font-semibold ${b.targetId === "end" ? "text-destructive" : "text-primary"}`}>
                          {b.targetLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </button>

              {/* Arrow connector */}
              {ni < flowNodes.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowDown className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {hasAnyLogic && (
        <div className="mt-4 pt-3 border-t space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Legenda</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <SkipForward className="h-3 w-3 text-primary" /> Pular para
            </span>
            <span className="flex items-center gap-1">
              <Ban className="h-3 w-3 text-destructive" /> Encerrar
            </span>
            <span className="flex items-center gap-1 italic">
              senao = acao padrao
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
