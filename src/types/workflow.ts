import type { FieldType } from "@/config/fieldTypes";
import type { FormTheme } from "@/lib/formTheme";

// ── FormField extended ──
export type ContactFieldKey = "first_name" | "last_name" | "email" | "phone" | "cpf" | "cep" | "address";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  scores?: Record<string, number>;
  tags?: Record<string, string[]>;
  outcome?: Record<string, string>;
  media_url?: string;
  media_type?: "video" | "image";
  contact_fields?: ContactFieldKey[];
}

// ── Logic / Branching ──
export type ConditionOp = "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_set" | "is_not_set";

export interface LogicCondition {
  op: ConditionOp;
  value?: string | number;
}

export interface LogicAction {
  type: "jump_to" | "next" | "end";
  target?: string; // field id or end_screen id
}

export interface LogicRule {
  condition: LogicCondition;
  action: LogicAction;
}

export interface FieldLogic {
  field_id: string;
  rules: LogicRule[];
  default_action: LogicAction;
}

// ── Scoring ──
export interface ScoringRange {
  min: number;
  max: number;
  label?: string;
  end_screen_id?: string;
}

export interface ScoringConfig {
  enabled: boolean;
  field_scores: Record<string, Record<string, number>>; // field_id -> option -> score
  ranges: ScoringRange[];
}

// ── Tagging ──
export interface TaggingConfig {
  enabled: boolean;
  tags: string[];
  field_tags: Record<string, Record<string, string[]>>; // field_id -> option -> tags
}

// ── Outcomes ──
export interface OutcomeDefinition {
  id: string;
  label: string;
  description?: string;
  end_screen_id?: string;
}

export interface OutcomesConfig {
  enabled: boolean;
  definitions: OutcomeDefinition[];
  field_outcomes: Record<string, Record<string, string>>; // field_id -> option -> outcome_id
}

// ── Email Templates ──
export interface EmailTemplate {
  id: string;
  name: string;
  enabled: boolean;
  recipient: "respondent" | "owner";
  subject: string;
  header_image_url?: string;
  body: string;
  cta_text?: string;
  cta_url?: string;
  footer?: string;
}

// ── Full Schema ──
export interface FormSchema {
  fields: FormField[];
  logic?: FieldLogic[];
  scoring?: ScoringConfig;
  tagging?: TaggingConfig;
  outcomes?: OutcomesConfig;
  theme?: FormTheme;
  email_templates?: EmailTemplate[];
}

// ── Helpers ──
export const DEFAULT_SCORING: ScoringConfig = {
  enabled: false,
  field_scores: {},
  ranges: [],
};

export const DEFAULT_TAGGING: TaggingConfig = {
  enabled: false,
  tags: [],
  field_tags: {},
};

export const DEFAULT_OUTCOMES: OutcomesConfig = {
  enabled: false,
  definitions: [],
  field_outcomes: {},
};
