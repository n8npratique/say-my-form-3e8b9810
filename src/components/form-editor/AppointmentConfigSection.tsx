import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Video, Calendar } from "lucide-react";
import type { FormField, AppointmentConfig } from "@/types/workflow";

/** Field types that don't produce useful variable values */
const NON_VARIABLE_TYPES = ["end_screen", "appointment", "statement"];

/** Sub-field labels for contact_info — maps key to Portuguese display name */
const CONTACT_SUBFIELD_LABELS: Record<string, string> = {
  first_name: "Nome",
  last_name: "Sobrenome",
  email: "Email",
  phone: "Telefone",
  cpf: "CPF",
  cep: "CEP",
  address: "Endereço",
};

const DEFAULT_APPOINTMENT_CONFIG: AppointmentConfig = {
  google_connection_id: "",
  calendar_id: "primary",
  available_days: [1, 2, 3, 4, 5],
  start_time: "08:00",
  end_time: "18:00",
  slot_duration: 60,
  horizon_days: 14,
  buffer_minutes: 0,
  event_title: "{{form_name}}",
  event_description: "",
  add_respondent: true,
  add_meet: false,
  timezone: "America/Sao_Paulo",
};

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30min" },
  { value: 120, label: "2 horas" },
];

const HORIZON_OPTIONS = [
  { value: 7, label: "7 dias" },
  { value: 14, label: "14 dias" },
  { value: 30, label: "30 dias" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "Brasil (Brasília)" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { value: "America/New_York", label: "EUA Leste (Miami / Nova York)" },
  { value: "America/Chicago", label: "EUA Centro (Chicago)" },
  { value: "America/Los_Angeles", label: "EUA Pacífico (Los Angeles)" },
  { value: "Europe/Lisbon", label: "Portugal (Lisboa)" },
];

const BUFFER_OPTIONS = [
  { value: 0, label: "Sem intervalo" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
];

interface AppointmentConfigSectionProps {
  field: FormField;
  onChange: (updated: FormField) => void;
  workspaceId: string;
  fields?: FormField[];
}

export const AppointmentConfigSection = ({ field, onChange, workspaceId, fields = [] }: AppointmentConfigSectionProps) => {
  const [oauthConnections, setOauthConnections] = useState<{ id: string; google_email: string }[]>([]);
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary: boolean }[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeField, setActiveField] = useState<"title" | "desc">("title");
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const config: AppointmentConfig = { ...DEFAULT_APPOINTMENT_CONFIG, ...field.appointment_config };

  const update = (partial: Partial<AppointmentConfig>) => {
    onChange({ ...field, appointment_config: { ...config, ...partial } });
  };

  useEffect(() => {
    if (!workspaceId) return;
    const fetchConnections = async () => {
      try {
        const { data } = await supabase.functions.invoke("google-oauth", {
          body: { action: "status", workspace_id: workspaceId },
        });
        if (data?.connections) {
          setOauthConnections(data.connections);
        }
      } catch {
        // OAuth might not be deployed
      }
      setLoading(false);
    };
    fetchConnections();
  }, [workspaceId]);

  // Fetch calendars when google_connection_id changes
  useEffect(() => {
    if (!config.google_connection_id) {
      setCalendars([]);
      setCalendarError("");
      return;
    }
    const fetchCalendars = async () => {
      setLoadingCalendars(true);
      setCalendarError("");
      try {
        const { data, error } = await supabase.functions.invoke("check-availability", {
          body: { action: "list_calendars", google_connection_id: config.google_connection_id },
        });
        if (error) {
          setCalendarError(typeof error === "object" ? JSON.stringify(error) : String(error));
        } else if (data?.calendars) {
          setCalendars(data.calendars);
        } else if (data?.error) {
          setCalendarError(data.error);
        }
      } catch (err: any) {
        setCalendarError(err.message || "Erro ao buscar agendas");
      }
      setLoadingCalendars(false);
    };
    fetchCalendars();
  }, [config.google_connection_id]);

  const toggleDay = (day: number) => {
    const current = config.available_days;
    const updated = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    update({ available_days: updated });
  };

  const insertVariable = (varValue: string) => {
    const ref = activeField === "title" ? titleRef.current : descRef.current;
    if (!ref) return;
    const start = ref.selectionStart ?? ref.value.length;
    const end = ref.selectionEnd ?? start;
    const before = ref.value.slice(0, start);
    const after = ref.value.slice(end);
    const newVal = before + varValue + after;
    if (activeField === "title") {
      update({ event_title: newVal });
    } else {
      update({ event_description: newVal });
    }
    setTimeout(() => {
      ref.focus();
      const cursor = start + varValue.length;
      ref.setSelectionRange(cursor, cursor);
    }, 0);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando contas...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── BOX 1: Disponibilidade ── */}
      <div className="space-y-4 rounded-lg border p-3">
        <Label className="text-sm font-medium">Disponibilidade</Label>

        {/* Google Account */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Conta Google</Label>
          {oauthConnections.length > 0 ? (
            <Select
              value={config.google_connection_id || "__none__"}
              onValueChange={(v) => update({ google_connection_id: v === "__none__" ? "" : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Escolher conta..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Selecione uma conta</SelectItem>
                {oauthConnections.map((conn) => (
                  <SelectItem key={conn.id} value={conn.id}>{conn.google_email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Conecte uma conta Google em Configurações do Workspace.</span>
            </div>
          )}
        </div>

        {/* Calendar */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Agenda</Label>
          {calendarError ? (
            <div className="text-xs text-red-500 bg-red-50 rounded p-2 break-all">
              Erro: {calendarError}
            </div>
          ) : loadingCalendars ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando agendas...
            </div>
          ) : calendars.length > 0 ? (
            <Select
              value={config.calendar_id || "primary"}
              onValueChange={(v) => update({ calendar_id: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar agenda..." />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((cal) => (
                  <SelectItem key={cal.id} value={cal.id}>
                    {cal.summary}{cal.primary ? " (principal)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={config.calendar_id}
              onChange={(e) => update({ calendar_id: e.target.value || "primary" })}
              placeholder="primary"
              className="h-8 text-xs"
            />
          )}
        </div>

        {/* Available Days */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Dias disponíveis</Label>
          <div className="flex gap-1">
            {WEEKDAYS.map(({ value, label }) => {
              const active = config.available_days.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDay(value)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Range */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Início</Label>
            <Input
              type="time"
              value={config.start_time}
              onChange={(e) => update({ start_time: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fim</Label>
            <Input
              type="time"
              value={config.end_time}
              onChange={(e) => update({ end_time: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Slot Duration */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Duração do slot</Label>
          <Select
            value={String(config.slot_duration)}
            onValueChange={(v) => update({ slot_duration: Number(v) })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Horizon */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mostrar horários até</Label>
          <Select
            value={String(config.horizon_days)}
            onValueChange={(v) => update({ horizon_days: Number(v) })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORIZON_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Buffer */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Intervalo entre slots</Label>
          <Select
            value={String(config.buffer_minutes)}
            onValueChange={(v) => update({ buffer_minutes: Number(v) })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUFFER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Timezone */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Fuso horário</Label>
          <Select
            value={config.timezone || "America/Sao_Paulo"}
            onValueChange={(v) => update({ timezone: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── BOX 2: Evento no Calendar ── */}
      <div className="space-y-4 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Evento no Calendar</Label>
        </div>

        {/* Event Title */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Título do evento</Label>
          <Input
            ref={titleRef}
            value={config.event_title}
            onChange={(e) => update({ event_title: e.target.value })}
            onFocus={() => setActiveField("title")}
            placeholder="{{form_name}}"
            className="h-8 text-xs"
          />
        </div>

        {/* Event Description */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Descrição do evento</Label>
          <Textarea
            ref={descRef}
            value={config.event_description}
            onChange={(e) => update({ event_description: e.target.value })}
            onFocus={() => setActiveField("desc")}
            placeholder="Detalhes do agendamento..."
            className="text-xs min-h-[60px] resize-none"
            rows={3}
          />
        </div>

        {/* Variable Badges — grouped */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Variáveis disponíveis</Label>
          <p className="text-[10px] text-muted-foreground">Clique para inserir no {activeField === "title" ? "título" : "descrição"}</p>

          {/* System variables */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sistema</span>
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary" className="text-[10px] cursor-pointer hover:bg-primary/10" onClick={() => insertVariable("{{form_name}}")}>
                Nome do form
              </Badge>
            </div>
          </div>

          {/* Field variables — dynamically generated */}
          {fields.filter((f) => f.id !== field.id && !NON_VARIABLE_TYPES.includes(f.type) && f.label.trim()).length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Campos</span>
              <div className="flex flex-wrap gap-1">
                {fields
                  .filter((f) => f.id !== field.id && !NON_VARIABLE_TYPES.includes(f.type) && f.label.trim())
                  .flatMap((f) => {
                    if (f.type === "contact_info") {
                      // Expand contact_info into individual sub-field badges
                      const subFields = f.contact_fields || ["first_name", "email"];
                      return subFields.map((key) => (
                        <Badge
                          key={`${f.id}-${key}`}
                          variant="outline"
                          className="text-[10px] cursor-pointer hover:bg-primary/10"
                          onClick={() => insertVariable(`{{field:${f.label}.${CONTACT_SUBFIELD_LABELS[key] || key}}}`)}
                        >
                          {f.label}.{CONTACT_SUBFIELD_LABELS[key] || key}
                        </Badge>
                      ));
                    }
                    return (
                      <Badge
                        key={f.id}
                        variant="outline"
                        className="text-[10px] cursor-pointer hover:bg-primary/10"
                        onClick={() => insertVariable(`{{field:${f.label}}}`)}
                      >
                        {f.label}
                      </Badge>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Add Respondent */}
        <div className="flex items-center justify-between rounded-md bg-muted/50 p-2">
          <div>
            <Label className="text-xs">Adicionar respondente</Label>
            <p className="text-[10px] text-muted-foreground">Convida o e-mail do respondente</p>
          </div>
          <Switch
            checked={config.add_respondent}
            onCheckedChange={(v) => update({ add_respondent: v })}
          />
        </div>

        {/* Google Meet */}
        <div className="flex items-center justify-between rounded-md bg-muted/50 p-2">
          <div className="flex items-center gap-1.5">
            <Video className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <div>
              <Label className="text-xs">Google Meet</Label>
              <p className="text-[10px] text-muted-foreground">Gera link de videochamada no evento</p>
            </div>
          </div>
          <Switch
            checked={config.add_meet}
            onCheckedChange={(v) => update({ add_meet: v })}
          />
        </div>
      </div>
    </div>
  );
};
