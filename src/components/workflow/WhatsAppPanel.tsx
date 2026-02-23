import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageCircle, Plus, Trash2, ArrowLeft, Send, User, Shield,
  AlertTriangle, CheckCircle2, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FormField } from "@/types/workflow";

interface WhatsAppTemplate {
  id: string;
  name: string;
  enabled: boolean;
  recipient: "respondent" | "owner";
  message: string;
}

interface WhatsAppConfig {
  enabled: boolean;
  templates: WhatsAppTemplate[];
}

/** Field types that don't produce useful variable values */
const NON_VARIABLE_TYPES = ["end_screen", "appointment", "statement", "redirect_url"];

/** Sub-field labels for contact_info */
const CONTACT_SUBFIELD_LABELS: Record<string, string> = {
  first_name: "Nome", last_name: "Sobrenome",
  email: "Email", phone: "Telefone",
  cpf: "CPF", cep: "CEP", address: "Endereço",
};

interface VariableItem {
  key: string;
  label: string;
  group: "system" | "appointment" | "fields";
}

const SYSTEM_VARIABLES: VariableItem[] = [
  { key: "{{form_name}}", label: "Nome do form", group: "system" },
  { key: "{{score}}", label: "Score", group: "system" },
  { key: "{{outcome}}", label: "Outcome", group: "system" },
  { key: "{{tags}}", label: "Tags", group: "system" },
  { key: "{{respondent_email}}", label: "Email respondente", group: "system" },
  { key: "{{answers}}", label: "Respostas", group: "system" },
];

const APPOINTMENT_VARIABLES: VariableItem[] = [
  { key: "{{appointment_datetime}}", label: "Data/hora", group: "appointment" },
  { key: "{{meet_link}}", label: "Link Meet", group: "appointment" },
  { key: "{{cancel_url}}", label: "Link cancelar", group: "appointment" },
];

const emptyTemplate = (): WhatsAppTemplate => ({
  id: crypto.randomUUID(),
  name: "Nova mensagem",
  enabled: true,
  recipient: "respondent",
  message: "Olá! Obrigado por responder ao formulário *{{form_name}}*. 🎉",
});

const DEFAULT_CONFIG: WhatsAppConfig = { enabled: false, templates: [] };

interface WhatsAppPanelProps {
  formId: string;
  fields?: FormField[];
  hasAppointment?: boolean;
}

export const WhatsAppPanel = ({ formId, fields = [], hasAppointment = false }: WhatsAppPanelProps) => {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [config, setConfig] = useState<WhatsAppConfig>(DEFAULT_CONFIG);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [wahaConfigured, setWahaConfigured] = useState<boolean | null>(null); // null = loading
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const editing = config.templates.find((t) => t.id === editingId) || null;

  // ── Build dynamic variables list ──
  const variables = useMemo((): VariableItem[] => {
    const result: VariableItem[] = [...SYSTEM_VARIABLES];
    if (hasAppointment) result.push(...APPOINTMENT_VARIABLES);
    for (const f of fields) {
      if (NON_VARIABLE_TYPES.includes(f.type) || !f.label?.trim()) continue;
      if (f.type === "contact_info") {
        const subFields = f.contact_fields || ["first_name", "email"];
        for (const key of subFields) {
          result.push({
            key: `{{field:${f.label}.${CONTACT_SUBFIELD_LABELS[key] || key}}}`,
            label: `${f.label}.${CONTACT_SUBFIELD_LABELS[key] || key}`,
            group: "fields",
          });
        }
      } else {
        result.push({ key: `{{field:${f.label}}}`, label: f.label, group: "fields" });
      }
    }
    return result;
  }, [fields, hasAppointment]);

  const systemVars = variables.filter((v) => v.group === "system");
  const appointmentVars = variables.filter((v) => v.group === "appointment");
  const fieldVars = variables.filter((v) => v.group === "fields");

  useEffect(() => {
    if (!formId) return;
    loadData();
  }, [formId]);

  const loadData = async () => {
    // Load integration
    const { data: integ } = await supabase
      .from("integrations")
      .select("*")
      .eq("form_id", formId)
      .eq("type", "whatsapp")
      .maybeSingle();

    if (integ) {
      setIntegrationId(integ.id);
      const cfg = integ.config as any;
      setConfig({ ...DEFAULT_CONFIG, ...cfg });
    }

    // Check WAHA config
    const { data: form } = await supabase
      .from("forms")
      .select("workspace_id")
      .eq("id", formId)
      .maybeSingle();

    if (form) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("settings")
        .eq("id", form.workspace_id)
        .maybeSingle();
      const s = ws?.settings as any;
      setWahaConfigured(!!(s?.waha?.url && s?.waha?.session));
    } else {
      setWahaConfigured(false);
    }
  };

  const saveConfig = async (newConfig: WhatsAppConfig) => {
    setSaving(true);
    try {
      if (integrationId) {
        await supabase
          .from("integrations")
          .update({ config: newConfig as any })
          .eq("id", integrationId);
      } else {
        const { data } = await supabase
          .from("integrations")
          .insert({ form_id: formId, type: "whatsapp", config: newConfig as any })
          .select()
          .single();
        if (data) setIntegrationId(data.id);
      }
      setConfig(newConfig);
      toast({ title: "Configuração salva!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const activate = async () => {
    const newConfig: WhatsAppConfig = { enabled: true, templates: [] };
    await saveConfig(newConfig);
  };

  const toggleEnabled = async (v: boolean) => {
    const newConfig = { ...config, enabled: v };
    await saveConfig(newConfig);
  };

  const updateTemplate = (id: string, patch: Partial<WhatsAppTemplate>) => {
    setConfig((prev) => ({
      ...prev,
      templates: prev.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  };

  const addTemplate = () => {
    const t = emptyTemplate();
    setConfig((prev) => ({ ...prev, templates: [...prev.templates, t] }));
    setEditingId(t.id);
  };

  const deleteTemplate = (id: string) => {
    setConfig((prev) => ({ ...prev, templates: prev.templates.filter((t) => t.id !== id) }));
    if (editingId === id) setEditingId(null);
  };

  const saveTemplates = async () => {
    await saveConfig(config);
  };

  const insertVariable = (varKey: string) => {
    if (!editing || !textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const msg = editing.message || "";
    const newMsg = msg.substring(0, start) + varKey + msg.substring(end);
    updateTemplate(editing.id, { message: newMsg });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + varKey.length, start + varKey.length);
    }, 0);
  };

  const sendTest = async () => {
    if (!editing) return;
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          form_id: formId,
          test_mode: true,
          test_template: editing,
        },
      });
      if (error) throw error;
      if (data?.sent === false) throw new Error(data.reason || "Falha ao enviar");
      toast({ title: "Mensagem de teste enviada!", description: "Verifique o WhatsApp do número padrão." });
    } catch (err: any) {
      toast({ title: "Erro ao enviar teste", description: err.message, variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  // ── Not activated yet ──
  if (!integrationId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">WhatsApp</h3>
        </div>

        {wahaConfigured === false && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-warning">
              Configure o WAHA nas <strong>Configurações do Workspace</strong> primeiro.
            </p>
          </div>
        )}

        <div className="text-center py-6 space-y-3">
          <MessageCircle className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Envie mensagens WhatsApp automáticas ao completar o formulário.</p>
          <Button size="sm" className="gap-1.5" onClick={activate} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Ativar WhatsApp
          </Button>
        </div>
      </div>
    );
  }

  // ── Template editor ──
  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-semibold text-sm flex-1">Editar Mensagem</h3>
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-2">
          <Switch
            checked={editing.enabled}
            onCheckedChange={(v) => updateTemplate(editing.id, { enabled: v })}
          />
          <Label className="text-xs">Ativo</Label>
          <Badge variant={editing.enabled ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 h-4 ml-auto">
            {editing.enabled ? "Ativo" : "Desativado"}
          </Badge>
        </div>

        {/* Name */}
        <div>
          <Label className="text-xs">Nome</Label>
          <Input
            className="h-8 text-xs mt-1"
            value={editing.name}
            onChange={(e) => updateTemplate(editing.id, { name: e.target.value })}
          />
        </div>

        {/* Recipient */}
        <div>
          <Label className="text-xs">Destinatário</Label>
          <Select
            value={editing.recipient}
            onValueChange={(v) => updateTemplate(editing.id, { recipient: v as "respondent" | "owner" })}
          >
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="respondent">
                <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Respondente — número do formulário</div>
              </SelectItem>
              <SelectItem value="owner">
                <div className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Admin — número padrão do WAHA</div>
              </SelectItem>
            </SelectContent>
          </Select>
          {editing.recipient === "respondent" && (
            <p className="text-[10px] text-muted-foreground mt-1">
              O formulário precisa ter um campo de telefone preenchido pelo respondente.
            </p>
          )}
        </div>

        {/* Variables — grouped */}
        <div className="space-y-2">
          <Label className="text-xs mb-1 block">Variáveis (clique para inserir)</Label>

          {/* Sistema */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sistema</span>
            <div className="flex flex-wrap gap-1">
              {systemVars.map((v) => (
                <Badge key={v.key} variant="secondary" className="cursor-pointer text-[10px] hover:bg-primary hover:text-primary-foreground transition-colors" onClick={() => insertVariable(v.key)}>
                  {v.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Agendamento */}
          {appointmentVars.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Agendamento</span>
              <div className="flex flex-wrap gap-1">
                {appointmentVars.map((v) => (
                  <Badge key={v.key} variant="secondary" className="cursor-pointer text-[10px] hover:bg-green-600 hover:text-white transition-colors border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400" onClick={() => insertVariable(v.key)}>
                    {v.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Campos */}
          {fieldVars.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Campos</span>
              <div className="flex flex-wrap gap-1">
                {fieldVars.map((v) => (
                  <Badge key={v.key} variant="outline" className="cursor-pointer text-[10px] hover:bg-primary hover:text-primary-foreground transition-colors" onClick={() => insertVariable(v.key)}>
                    {v.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Message */}
        <div>
          <Label className="text-xs">Mensagem</Label>
          <Textarea
            ref={textareaRef}
            className="text-xs mt-1 min-h-[120px] font-mono"
            placeholder="Olá! Obrigado por responder ao formulário *{{form_name}}*. Seu score foi {{score}}. 🎉"
            value={editing.message}
            onChange={(e) => updateTemplate(editing.id, { message: e.target.value })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Use *texto* para negrito no WhatsApp.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2 border-t">
          <Button size="sm" className="w-full h-8 gap-1.5 text-xs" onClick={saveTemplates} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Salvar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 gap-1.5 text-xs"
            onClick={sendTest}
            disabled={sendingTest}
          >
            {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar teste para número padrão
          </Button>
        </div>
      </div>
    );
  }

  // ── Template list ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">WhatsApp</h3>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={toggleEnabled}
          disabled={saving}
        />
      </div>

      {/* WAHA status */}
      {wahaConfigured === false ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <p className="text-xs text-warning">
            Configure o WAHA nas <strong>Configurações do Workspace</strong> para enviar mensagens.
          </p>
        </div>
      ) : wahaConfigured === true ? (
        <div className="flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          <span className="text-xs text-green-700 dark:text-green-400">WAHA configurado</span>
        </div>
      ) : null}

      {config.enabled && (
        <>
          <p className="text-xs text-muted-foreground">
            {config.templates.length === 0
              ? "Adicione mensagens automáticas enviadas ao completar o formulário."
              : `${config.templates.filter((t) => t.enabled).length} de ${config.templates.length} mensagens ativas.`}
          </p>

          {config.templates.length === 0 ? (
            <div className="text-center py-4">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs text-muted-foreground">Nenhuma mensagem configurada.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {config.templates.map((t) => (
                <div key={t.id} className="border rounded-lg p-3 flex items-center gap-2">
                  <Switch
                    checked={t.enabled}
                    onCheckedChange={(v) => {
                      updateTemplate(t.id, { enabled: v });
                    }}
                  />
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => setEditingId(t.id)}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium">{t.name || "Sem nome"}</span>
                      <Badge
                        variant={t.enabled ? "default" : "secondary"}
                        className="text-[9px] px-1 py-0 h-4"
                      >
                        {t.enabled ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                      {t.recipient === "respondent" ? (
                        <><User className="h-3 w-3" /> Respondente</>
                      ) : (
                        <><Shield className="h-3 w-3" /> Admin</>
                      )}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => deleteTemplate(t.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full gap-1" onClick={addTemplate}>
              <Plus className="h-4 w-4" /> Adicionar mensagem
            </Button>
            {config.templates.length > 0 && (
              <Button size="sm" className="w-full h-8 gap-1.5 text-xs" onClick={saveTemplates} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Salvar configuração
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
