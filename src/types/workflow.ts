import type { FieldType } from "@/config/fieldTypes";
import type { FormTheme } from "@/lib/formTheme";
import type { Locale } from "@/lib/i18n";

// ── FormField extended ──
export type ContactFieldKey = "first_name" | "last_name" | "email" | "phone" | "cpf" | "cep" | "address";

export interface DaySchedule {
  enabled: boolean;
  start: string;  // "08:00"
  end: string;    // "18:00"
}

export interface AppointmentConfig {
  google_connection_id: string;
  calendar_id: string;
  available_days: number[];      // 0=dom, 1=seg, ..., 6=sab (legacy, kept for retrocompat)
  start_time: string;            // "08:00" (legacy, kept for retrocompat)
  end_time: string;              // "18:00" (legacy, kept for retrocompat)
  day_schedules?: Record<number, DaySchedule>; // NEW: per-day schedule {0: {enabled, start, end}, ...}
  slot_duration: number;         // minutos (30, 60, etc)
  horizon_days: number;          // quantos dias a frente (7, 14, 30)
  buffer_minutes: number;        // intervalo entre slots (0, 15, etc)
  event_title: string;           // suporta {{form_name}} e {{field:LABEL}}
  event_description: string;     // suporta {{form_name}} e {{field:LABEL}}
  add_respondent: boolean;       // adicionar respondente como participante
  add_meet: boolean;             // gerar link Google Meet
  timezone: string;              // IANA timezone (ex: "America/Sao_Paulo")
  confirmation_email_enabled: boolean;   // enviar email ao respondente (default: true)
  confirmation_email_subject: string;    // default: "Confirmação de agendamento - {{form_name}}"
  confirmation_email_body: string;       // mensagem extra do usuario (default: "")
}

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
  appointment_config?: AppointmentConfig;
  accepted_file_types?: string[];
  max_file_size_mb?: number;
  default_country?: string; // ISO code: "BR", "US", "AR" — affects phone, CEP, CPF
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

// ── Field Translation (AI) ──
export interface FieldTranslation {
  label?: string;
  placeholder?: string;
  options?: string[];
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
  locale?: Locale;
  field_translations?: Record<string, Record<string, FieldTranslation>>; // locale -> fieldId -> translation
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
