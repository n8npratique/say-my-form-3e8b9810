import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, AlertTriangle, Plus, Trash2, Loader2, RefreshCw, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { FormField } from "@/types/workflow";

interface CalendarConfig {
  enabled: boolean;
  calendar_id: string;
  event_title: string;
  event_description: string;
  date_field_id: string;
  time_field_id: string;
  duration_minutes: number;
  add_respondent: boolean;
  google_connection_id?: string;
}

const DEFAULT_CONFIG: CalendarConfig = {
  enabled: true,
  calendar_id: "primary",
  event_title: "{{form_name}}",
  event_description: "",
  date_field_id: "",
  time_field_id: "",
  duration_minutes: 60,
  add_respondent: true,
  google_connection_id: "",
};

const DURATION_OPTIONS = [
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30min" },
  { value: 120, label: "2 horas" },
];

interface CalendarPanelProps {
  formId: string;
  fields: FormField[];
}

export const CalendarPanel = ({ formId, fields }: CalendarPanelProps) => {
  const { toast } = useToast();
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [activeField, setActiveField] = useState<"title" | "desc">("title");

  const [integration, setIntegration] = useState<any>(null);
  const [config, setConfig] = useState<CalendarConfig>(DEFAULT_CONFIG);
  const [hasServiceAccount, setHasServiceAccount] = useState<boolean | null>(null);
  const [oauthConnections, setOauthConnections] = useState<{ id: string; google_email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!formId) return;
    loadData();
  }, [formId]);

  const loadData = async () => {
    setLoading(true);

    const { data: integ } = await supabase
      .from("integrations")
      .select("*")
      .eq("form_id", formId)
      .eq("type", "google_calendar")
      .maybeSingle();

    if (integ) {
      setIntegration(integ);
      setConfig({ ...DEFAULT_CONFIG, ...(integ.config as any) });
    }

    // Check service account + OAuth connections
    const { data: form } = await supabase
      .from("forms")
      .select("workspace_id")
      .eq("id", formId)
      .maybeSingle();

    if (form?.workspace_id) {
      const { data: sa } = await supabase
        .from("google_service_accounts")
        .select("id")
        .eq("workspace_id", form.workspace_id)
        .maybeSingle();
      setHasServiceAccount(!!sa);

      // Fetch OAuth connections
      try {
        const { data } = await supabase.functions.invoke("google-oauth", {
          body: { action: "status", workspace_id: form.workspace_id },
        });
        if (data?.connections) {
          setOauthConnections(data.connections);
        }
      } catch {
        // OAuth might not be deployed
      }
    }

    setLoading(false);
  };

  const activate = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("integrations")
      .insert({ form_id: formId, type: "google_calendar", config: DEFAULT_CONFIG as any })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao ativar", description: error.message, variant: "destructive" });
    } else {
      setIntegration(data);
      setConfig(DEFAULT_CONFIG);
      toast({ title: "Google Calendar ativado!" });
    }
    setSaving(false);
  };

  const saveConfig = async () => {
    if (!integration) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("integrations")
      .update({ config: config as any })
      .eq("id", integration.id)
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      setIntegration(data);
      toast({ title: "Configuração salva!" });
    }
    setSaving(false);
  };

  const removeIntegration = async () => {
    if (!integration) return;
    setSaving(true);
    await supabase.from("integrations").delete().eq("id", integration.id);
    setIntegration(null);
    setConfig(DEFAULT_CONFIG);
    toast({ title: "Integração removida" });
    setSaving(false);
  };

  const update = (patch: Partial<CalendarConfig>) => setConfig((p) => ({ ...p, ...patch }));

  // Variable insertion
  const insertVar = (varKey: string) => {
    if (activeField === "title" && titleRef.current) {
      const el = titleRef.current;
      const s = el.selectionStart || 0;
      const e = el.selectionEnd || 0;
      const newVal = config.event_title.substring(0, s) + varKey + config.event_title.substring(e);
      update({ event_title: newVal });
      setTimeout(() => { el.focus(); el.setSelectionRange(s + varKey.length, s + varKey.length); }, 0);
    } else if (activeField === "desc" && descRef.current) {
      const el = descRef.current;
      const s = el.selectionStart || 0;
      const e = el.selectionEnd || 0;
      const newVal = config.event_description.substring(0, s) + varKey + config.event_description.substring(e);
      update({ event_description: newVal });
      setTimeout(() => { el.focus(); el.setSelectionRange(s + varKey.length, s + varKey.length); }, 0);
    }
  };

  // Field-based variables
  const fieldVars = fields
    .filter((f) => !["welcome_screen", "end_screen", "statement"].includes(f.type) && f.label)
    .map((f) => ({ key: `{{field:${f.label}}}`, label: f.label }));

  const staticVars = [{ key: "{{form_name}}", label: "Nome do form" }];
  const allVars = [...staticVars, ...fieldVars];

  // Field type filters
  const dateFields = fields.filter((f) => f.type === "date");
  const timeFields = fields.filter((f) => ["dropdown", "short_text"].includes(f.type));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Google Calendar</h3>
      </div>

      {/* Credential warning */}
      {hasServiceAccount === false && oauthConnections.length === 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            Conecte uma <strong>conta Google</strong> ou configure uma <strong>Service Account</strong> nas Configurações do Workspace.
          </p>
        </div>
      )}

      {/* Not activated */}
      {!integration && (
        <div className="text-center py-6 space-y-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Calendar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Google Calendar</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crie eventos automaticamente no calendário ao receber uma resposta.
            </p>
          </div>
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={activate}
            disabled={saving || (hasServiceAccount === false && oauthConnections.length === 0)}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Ativar Google Calendar
          </Button>
        </div>
      )}

      {/* Configured */}
      {integration && (
        <div className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Criação de eventos</p>
              <p className="text-xs text-muted-foreground">
                {config.enabled ? "Ativo — eventos serão criados" : "Pausado"}
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
              disabled={saving}
            />
          </div>

          {config.enabled && (
            <div className="space-y-3">
              {/* Google account selector */}
              {oauthConnections.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label className="text-xs">Conta Google</Label>
                  </div>
                  <Select
                    value={config.google_connection_id || "__none__"}
                    onValueChange={(v) => update({ google_connection_id: v === "__none__" ? "" : v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Escolher conta..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        {hasServiceAccount ? "Service Account (padrão)" : "Selecione uma conta"}
                      </SelectItem>
                      {oauthConnections.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id}>{conn.google_email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Calendar ID */}
              <div className="space-y-1">
                <Label className="text-xs">Calendar ID</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="primary"
                  value={config.calendar_id}
                  onChange={(e) => update({ calendar_id: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground">
                  Use "primary" para o calendário principal ou o ID completo de outro calendário.
                </p>
              </div>

              {/* Variables chips */}
              <div className="space-y-1">
                <Label className="text-xs">Variáveis (clique para inserir)</Label>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {allVars.map((v) => (
                    <Badge
                      key={v.key}
                      variant="secondary"
                      className="cursor-pointer text-[10px] hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => insertVar(v.key)}
                    >
                      {v.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Event title */}
              <div className="space-y-1">
                <Label className="text-xs">Título do evento</Label>
                <Input
                  ref={titleRef}
                  className="h-8 text-xs"
                  placeholder="Agendamento — {{form_name}}"
                  value={config.event_title}
                  onChange={(e) => update({ event_title: e.target.value })}
                  onFocus={() => setActiveField("title")}
                />
              </div>

              {/* Date field */}
              <div className="space-y-1">
                <Label className="text-xs">Campo de data</Label>
                <Select
                  value={config.date_field_id || "__none__"}
                  onValueChange={(v) => update({ date_field_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecionar campo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não configurado</SelectItem>
                    {dateFields.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.label || "Campo de data"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dateFields.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">Adicione um campo do tipo "Data" ao formulário.</p>
                )}
              </div>

              {/* Time field */}
              <div className="space-y-1">
                <Label className="text-xs">Campo de horário (opcional)</Label>
                <Select
                  value={config.time_field_id || "__none__"}
                  onValueChange={(v) => update({ time_field_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Não configurado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não configurado (usa 09:00)</SelectItem>
                    {timeFields.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.label || f.type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Duration */}
              <div className="space-y-1">
                <Label className="text-xs">Duração</Label>
                <Select
                  value={String(config.duration_minutes)}
                  onValueChange={(v) => update({ duration_minutes: Number(v) })}
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

              {/* Description */}
              <div className="space-y-1">
                <Label className="text-xs">Descrição do evento</Label>
                <Textarea
                  ref={descRef}
                  className="text-xs min-h-[80px]"
                  placeholder="Agendamento realizado via {{form_name}}"
                  value={config.event_description}
                  onChange={(e) => update({ event_description: e.target.value })}
                  onFocus={() => setActiveField("desc")}
                />
              </div>

              {/* Add respondent */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.add_respondent}
                  onCheckedChange={(v) => update({ add_respondent: v })}
                />
                <Label className="text-xs">Adicionar respondente como participante</Label>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2 border-t">
            <Button size="sm" className="w-full h-8 gap-1.5 text-xs" onClick={saveConfig} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Salvar configuração
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              onClick={removeIntegration}
              disabled={saving}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover integração
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
