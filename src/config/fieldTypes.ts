import {
  Type, AlignLeft, Globe, Hash, Calendar,
  ListChecks, ChevronDown, Image, ToggleLeft, Scale, Star, ThumbsUp,
  MessageSquare, FileUp, CheckSquare, Users, Sparkles, LayoutList,
  SplitSquareVertical, Grid3X3, Award, BarChart3, ListOrdered,
  Milestone, PanelBottom, ExternalLink, CircleDot, CalendarClock
} from "lucide-react";

export type FieldType =
  | "short_text" | "long_text" | "email" | "phone" | "address" | "website"
  | "number" | "date" | "multiple_choice" | "dropdown" | "image_choice"
  | "yes_no" | "legal" | "checkbox" | "nps" | "opinion_scale" | "rating"
  | "ranking" | "matrix" | "file_upload" | "statement" | "welcome_screen"
  | "end_screen" | "question_group" | "redirect_url" | "contact_info"
  | "appointment";

export interface FieldTypeConfig {
  type: FieldType;
  label: string;
  icon: typeof Type;
  category: string;
  color: string;
}

export const FIELD_CATEGORIES = [
  "Informações de contato",
  "Texto",
  "Escolha",
  "Classificação e avaliação",
  "Outro",
] as const;

export const FIELD_TYPES: FieldTypeConfig[] = [
  // Informações de contato
  { type: "contact_info", label: "Informações de contato", icon: Users, category: "Informações de contato", color: "text-primary" },
  { type: "website", label: "Site", icon: Globe, category: "Informações de contato", color: "text-secondary" },

  // Texto
  { type: "long_text", label: "Texto longo", icon: AlignLeft, category: "Texto", color: "text-primary" },
  { type: "short_text", label: "Texto curto", icon: Type, category: "Texto", color: "text-secondary" },
  { type: "statement", label: "Declaração", icon: MessageSquare, category: "Texto", color: "text-accent" },

  // Escolha
  { type: "multiple_choice", label: "Múltipla escolha", icon: ListChecks, category: "Escolha", color: "text-primary" },
  { type: "dropdown", label: "Suspenso", icon: ChevronDown, category: "Escolha", color: "text-accent" },
  { type: "image_choice", label: "Escolha da imagem", icon: Image, category: "Escolha", color: "text-success" },
  { type: "yes_no", label: "Sim/Não", icon: ToggleLeft, category: "Escolha", color: "text-secondary" },
  { type: "legal", label: "Jurídico", icon: Scale, category: "Escolha", color: "text-warning" },
  { type: "checkbox", label: "Caixa de seleção", icon: CheckSquare, category: "Escolha", color: "text-primary" },

  // Classificação e avaliação
  { type: "nps", label: "Net Promoter Score®", icon: ThumbsUp, category: "Classificação e avaliação", color: "text-success" },
  { type: "opinion_scale", label: "Escala de Opinião", icon: BarChart3, category: "Classificação e avaliação", color: "text-primary" },
  { type: "rating", label: "Avaliação", icon: Star, category: "Classificação e avaliação", color: "text-warning" },
  { type: "ranking", label: "Classificação", icon: ListOrdered, category: "Classificação e avaliação", color: "text-accent" },
  { type: "matrix", label: "Matriz", icon: Grid3X3, category: "Classificação e avaliação", color: "text-secondary" },

  // Outro
  { type: "number", label: "Número", icon: Hash, category: "Outro", color: "text-primary" },
  { type: "date", label: "Data", icon: Calendar, category: "Outro", color: "text-success" },
  { type: "file_upload", label: "Envio de arquivo", icon: FileUp, category: "Outro", color: "text-accent" },
  { type: "end_screen", label: "Tela final", icon: PanelBottom, category: "Outro", color: "text-secondary" },
  { type: "question_group", label: "Grupo de perguntas", icon: LayoutList, category: "Outro", color: "text-primary" },
  { type: "redirect_url", label: "Redirecionar para URL", icon: ExternalLink, category: "Outro", color: "text-accent" },
  { type: "appointment", label: "Agendamento", icon: CalendarClock, category: "Outro", color: "text-success" },
];

export function getFieldTypeConfig(type: FieldType): FieldTypeConfig | undefined {
  return FIELD_TYPES.find((f) => f.type === type);
}
