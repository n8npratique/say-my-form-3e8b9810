import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { FormField, AppointmentConfig } from "@/types/workflow";

const DEFAULT_APPOINTMENT_CONFIG: AppointmentConfig = {
  google_connection_id: "",
  calendar_id: "primary",
  available_days: [1, 2, 3, 4, 5],
  start_time: "08:00",
  end_time: "18:00",
  slot_duration: 60,
  horizon_days: 14,
  buffer_minutes: 0,
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
}

export const AppointmentConfigSection = ({ field, onChange, workspaceId }: AppointmentConfigSectionProps) => {
  const [oauthConnections, setOauthConnections] = useState<{ id: string; google_email: string }[]>([]);
  const [loading, setLoading] = useState(true);

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

  const toggleDay = (day: number) => {
    const current = config.available_days;
    const updated = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    update({ available_days: updated });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando contas...
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <Label className="text-sm font-medium">Configuração do Agendamento</Label>

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

      {/* Calendar ID */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Calendar ID</Label>
        <Input
          value={config.calendar_id}
          onChange={(e) => update({ calendar_id: e.target.value || "primary" })}
          placeholder="primary"
          className="h-8 text-xs"
        />
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
    </div>
  );
};
