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
  AlertTriangle, CheckCircle2, Loader2, Bold, Italic, Strikethrough,
  Code, Eye, EyeOff, Sparkles, Copy, Check
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/BrandIcons";
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
const NON_VARIABLE_TYPES = ["end_screen", "appointment", "statement"];

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

// ── Pre-built message templates ──
const PRESET_TEMPLATES: { name: string; emoji: string; message: string }[] = [
  {
    name: "Agradecimento simples",
    emoji: "\u{1F64F}",
    message: "Ol\u00e1! \u{1F44B}\n\nObrigado por responder ao formul\u00e1rio *{{form_name}}*! \u2705\n\nRecebemos suas informa\u00e7\u00f5es com sucesso. Em breve entraremos em contato.\n\nAbra\u00e7os! \u{1F91D}",
  },
  {
    name: "Confirma\u00e7\u00e3o com resumo",
    emoji: "\u{1F4CB}",
    message: "\u2705 *Formul\u00e1rio recebido!*\n\n\u{1F4DD} *Formul\u00e1rio:* {{form_name}}\n\n\u{1F4CA} *Suas respostas:*\n{{answers}}\n\nCaso precise alterar algo, entre em contato conosco.",
  },
  {
    name: "Agendamento confirmado",
    emoji: "\u{1F4C5}",
    message: "\u{1F389} *Agendamento confirmado!*\n\n\u{1F4C5} *Data/Hora:* {{appointment_datetime}}\n\u{1F517} *Link da reuni\u00e3o:* {{meet_link}}\n\n\u274C Precisa cancelar? Acesse: {{cancel_url}}\n\nTe esperamos! \u{1F60A}",
  },
  {
    name: "Alerta para admin",
    emoji: "\u{1F514}",
    message: "\u{1F514} *Nova resposta recebida!*\n\n\u{1F4DD} *Formul\u00e1rio:* {{form_name}}\n\u{1F3C6} *Score:* {{score}}\n\u{1F3F7}\uFE0F *Tags:* {{tags}}\n\u{1F4E7} *Email:* {{respondent_email}}\n\n\u{1F4CA} *Respostas:*\n{{answers}}",
  },
  {
    name: "Boas-vindas lead",
    emoji: "\u{1F680}",
    message: "Ol\u00e1! \u{1F680}\n\nSeja bem-vindo(a)! Acabamos de receber seu cadastro no *{{form_name}}*.\n\n\u{1F3F7}\uFE0F *Seu perfil:* {{outcome}}\n\nUm de nossos consultores entrar\u00e1 em contato em breve para te ajudar com os pr\u00f3ximos passos.\n\nQualquer d\u00favida, estamos \u00e0 disposi\u00e7\u00e3o! \u{1F4AC}",
  },
];

const emptyTemplate = (): WhatsAppTemplate => ({
  id: crypto.randomUUID(),
  name: "Nova mensagem",
  enabled: true,
  recipient: "respondent",
  message: "",
});

const DEFAULT_CONFIG: WhatsAppConfig = { enabled: false, templates: [] };

// ── WhatsApp markdown → safe preview text ──
// Sanitizes HTML entities FIRST, then applies WA formatting.
// The input is always the user's own template text from the editor (trusted).
const waToPreviewHtml = (text: string): string => {
  // 1. Escape HTML entities to prevent any injection
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // 2. Apply WhatsApp formatting on the escaped text
  html = html.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  html = html.replace(/~([^~]+)~/g, '<del>$1</del>');
  html = html.replace(/```([^`]+)```/g, '<code style="background:rgba(0,0,0,0.06);padding:2px 4px;border-radius:3px;font-size:12px">$1</code>');
  // 3. Highlight {{variables}}
  html = html.replace(/\{\{([^}]+)\}\}/g, '<span style="background:#25D36622;color:#128C7E;padding:1px 4px;border-radius:3px;font-size:11px">{{$1}}</span>');
  // 4. Newlines
  html = html.replace(/\n/g, '<br/>');
  return html;
};

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
  const [wahaConfigured, setWahaConfigured] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [copied, setCopied] = useState(false);

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
    setShowPresets(true);
  };

  const deleteTemplate = (id: string) => {
    setConfig((prev) => ({ ...prev, templates: prev.templates.filter((t) => t.id !== id) }));
    if (editingId === id) setEditingId(null);
  };

  const saveTemplates = async () => {
    await saveConfig(config);
  };

  // ── Insert text at cursor ──
  const insertAtCursor = (textToInsert: string) => {
    if (!editing || !textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const msg = editing.message || "";
    const newMsg = msg.substring(0, start) + textToInsert + msg.substring(end);
    updateTemplate(editing.id, { message: newMsg });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    }, 0);
  };

  // ── Wrap selected text with formatting ──
  const wrapSelection = (before: string, after: string) => {
    if (!editing || !textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const msg = editing.message || "";
    const selected = msg.substring(start, end);

    if (selected) {
      const newMsg = msg.substring(0, start) + before + selected + after + msg.substring(end);
      updateTemplate(editing.id, { message: newMsg });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + before.length, end + before.length);
      }, 0);
    } else {
      const placeholder = "texto";
      const newMsg = msg.substring(0, start) + before + placeholder + after + msg.substring(end);
      updateTemplate(editing.id, { message: newMsg });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + before.length, start + before.length + placeholder.length);
      }, 0);
    }
  };

  const sendTest = async () => {
    if (!editing) return;
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { form_id: formId, test_mode: true, test_template: editing },
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

  const applyPreset = (preset: typeof PRESET_TEMPLATES[number]) => {
    if (!editing) return;
    updateTemplate(editing.id, { name: preset.name, message: preset.message });
    setShowPresets(false);
  };

  const copyMessage = () => {
    if (!editing) return;
    navigator.clipboard.writeText(editing.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Not activated yet ──
  if (!integrationId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <WhatsAppIcon size={22} />
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
          <div className="w-14 h-14 rounded-full bg-[#25D366]/10 flex items-center justify-center mx-auto">
            <WhatsAppIcon size={28} />
          </div>
          <div>
            <p className="text-sm font-medium">WhatsApp via WAHA</p>
            <p className="text-xs text-muted-foreground mt-1">Envie mensagens personalizadas automaticamente ao completar o formulário.</p>
          </div>
          <Button size="sm" className="gap-1.5 bg-[#25D366] hover:bg-[#1da851] text-white" onClick={activate} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Ativar WhatsApp
          </Button>
        </div>
      </div>
    );
  }

  // ── Preset picker (shown when creating new template) ──
  if (showPresets && editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPresets(false)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h3 className="font-semibold text-sm flex-1">Escolha um modelo</h3>
        </div>

        <p className="text-xs text-muted-foreground">
          Comece com um modelo pronto ou crie do zero.
        </p>

        <div className="space-y-2">
          {PRESET_TEMPLATES.map((preset, i) => (
            <button
              key={i}
              className="w-full text-left border rounded-lg p-3 hover:border-[#25D366]/50 hover:bg-[#25D366]/5 transition-colors group"
              onClick={() => applyPreset(preset)}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">{preset.emoji}</span>
                <span className="text-xs font-medium group-hover:text-[#128C7E] transition-colors">{preset.name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                {preset.message.replace(/\*/g, "").replace(/\n/g, " ").substring(0, 100)}...
              </p>
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => setShowPresets(false)}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Criar do zero
        </Button>
      </div>
    );
  }

  // ── Template editor ──
  if (editing) {
    const previewHtml = waToPreviewHtml(editing.message || "_Mensagem vazia..._");

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <WhatsAppIcon size={18} />
          <h3 className="font-semibold text-sm flex-1 truncate">{editing.name || "Editar Mensagem"}</h3>
        </div>

        {/* Active + Name row */}
        <div className="flex items-center gap-2">
          <Switch
            checked={editing.enabled}
            onCheckedChange={(v) => updateTemplate(editing.id, { enabled: v })}
          />
          <Input
            className="h-7 text-xs flex-1"
            placeholder="Nome da mensagem"
            value={editing.name}
            onChange={(e) => updateTemplate(editing.id, { name: e.target.value })}
          />
          <Badge variant={editing.enabled ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 h-4 shrink-0">
            {editing.enabled ? "ON" : "OFF"}
          </Badge>
        </div>

        {/* Recipient */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Destinatário</Label>
          <Select
            value={editing.recipient}
            onValueChange={(v) => updateTemplate(editing.id, { recipient: v as "respondent" | "owner" })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="respondent">
                <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Respondente</div>
              </SelectItem>
              <SelectItem value="owner">
                <div className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Admin (WAHA)</div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Variables — collapsible groups */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Variáveis</Label>

          {/* Sistema */}
          <div className="flex flex-wrap gap-1">
            {systemVars.map((v) => (
              <Badge
                key={v.key}
                variant="secondary"
                className="cursor-pointer text-[10px] hover:bg-[#25D366] hover:text-white transition-colors"
                onClick={() => insertAtCursor(v.key)}
              >
                {v.label}
              </Badge>
            ))}
          </div>

          {/* Agendamento */}
          {appointmentVars.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {appointmentVars.map((v) => (
                <Badge
                  key={v.key}
                  variant="secondary"
                  className="cursor-pointer text-[10px] hover:bg-[#25D366] hover:text-white transition-colors border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
                  onClick={() => insertAtCursor(v.key)}
                >
                  {v.label}
                </Badge>
              ))}
            </div>
          )}

          {/* Campos */}
          {fieldVars.length > 0 && (
            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
              {fieldVars.map((v) => (
                <Badge
                  key={v.key}
                  variant="outline"
                  className="cursor-pointer text-[10px] hover:bg-[#25D366] hover:text-white transition-colors"
                  onClick={() => insertAtCursor(v.key)}
                >
                  {v.label}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Formatting toolbar */}
        <div className="flex items-center gap-1 border rounded-md p-1 bg-muted/30">
          <button
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-background transition-colors"
            title="Negrito *texto*"
            onClick={() => wrapSelection("*", "*")}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-background transition-colors"
            title="Itálico _texto_"
            onClick={() => wrapSelection("_", "_")}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-background transition-colors"
            title="Tachado ~texto~"
            onClick={() => wrapSelection("~", "~")}
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
          <button
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-background transition-colors"
            title="Código ```texto```"
            onClick={() => wrapSelection("```", "```")}
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <div className="flex-1" />
          <button
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-background transition-colors"
            title="Copiar mensagem"
            onClick={copyMessage}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${showPreview ? "bg-[#25D366]/20 text-[#128C7E]" : "hover:bg-background"}`}
            title="Pré-visualizar"
            onClick={() => setShowPreview((p) => !p)}
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-background transition-colors"
            title="Usar modelo pronto"
            onClick={() => setShowPresets(true)}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          </button>
        </div>

        {/* Message editor OR Preview */}
        {showPreview ? (
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
              <Eye className="h-3 w-3" /> Pré-visualização
            </Label>
            {/* WhatsApp chat bubble */}
            <div className="rounded-xl p-3 min-h-[100px]" style={{ background: "#e5ddd5" }}>
              <div
                className="relative rounded-lg px-3 py-2 max-w-[95%] ml-auto shadow-sm"
                style={{ background: "#dcf8c6", borderTopRightRadius: 0 }}
              >
                <div
                  className="text-xs leading-relaxed"
                  style={{ color: "#111b21" }}
                >
                  {/* Render sanitized preview using React elements instead of innerHTML */}
                  <WhatsAppPreview text={editing.message || "_Mensagem vazia..._"} />
                </div>
                <div className="text-right mt-1">
                  <span style={{ fontSize: 10, color: "#667781" }}>
                    {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span style={{ fontSize: 10, color: "#53bdeb", marginLeft: 4 }}>✓✓</span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs gap-1"
              onClick={() => setShowPreview(false)}
            >
              <EyeOff className="h-3 w-3" /> Voltar ao editor
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <Textarea
              ref={textareaRef}
              className="text-xs min-h-[120px] font-mono leading-relaxed resize-y"
              placeholder={"Olá! 👋\n\nObrigado por responder *{{form_name}}*! ✅\n\nSuas respostas:\n{{answers}}"}
              value={editing.message}
              onChange={(e) => updateTemplate(editing.id, { message: e.target.value })}
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                *negrito* · _itálico_ · ~tachado~ · ```código```
              </p>
              <span className="text-[10px] text-muted-foreground">
                {editing.message.length} chars
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-2 border-t">
          <Button
            size="sm"
            className="w-full h-8 gap-1.5 text-xs bg-[#25D366] hover:bg-[#1da851] text-white"
            onClick={saveTemplates}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Salvar mensagem
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 gap-1.5 text-xs"
            onClick={sendTest}
            disabled={sendingTest}
          >
            {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar teste
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
          <WhatsAppIcon size={22} />
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
          <span className="text-xs text-green-700 dark:text-green-400">WAHA conectado</span>
        </div>
      ) : null}

      {config.enabled && (
        <>
          <p className="text-xs text-muted-foreground">
            {config.templates.length === 0
              ? "Crie mensagens personalizadas enviadas ao completar o formulário."
              : `${config.templates.filter((t) => t.enabled).length} de ${config.templates.length} mensagens ativas.`}
          </p>

          {config.templates.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <div className="w-12 h-12 rounded-full bg-[#25D366]/10 flex items-center justify-center mx-auto">
                <MessageCircle className="h-6 w-6 text-[#25D366]/40" />
              </div>
              <p className="text-xs text-muted-foreground">Nenhuma mensagem configurada.</p>
              <p className="text-[10px] text-muted-foreground">Comece com um modelo pronto ou crie do zero.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {config.templates.map((t) => (
                <div
                  key={t.id}
                  className="border rounded-lg overflow-hidden hover:border-[#25D366]/30 transition-colors"
                >
                  <div className={`h-0.5 w-full ${t.enabled ? "bg-[#25D366]" : "bg-muted"}`} />
                  <div className="p-3 flex items-center gap-2">
                    <Switch
                      checked={t.enabled}
                      onCheckedChange={(v) => updateTemplate(t.id, { enabled: v })}
                    />
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => setEditingId(t.id)}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium">{t.name || "Sem nome"}</span>
                        <Badge
                          variant={t.enabled ? "default" : "secondary"}
                          className={`text-[9px] px-1 py-0 h-4 ${t.enabled ? "bg-[#25D366] hover:bg-[#1da851]" : ""}`}
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
                        <span className="mx-1">·</span>
                        <span>{t.message.length} chars</span>
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
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 border-[#25D366]/30 text-[#128C7E] hover:bg-[#25D366]/10 hover:text-[#128C7E]"
              onClick={addTemplate}
            >
              <Plus className="h-3.5 w-3.5" /> Nova mensagem
            </Button>
            {config.templates.length > 0 && (
              <Button
                size="sm"
                className="w-full h-8 gap-1.5 text-xs bg-[#25D366] hover:bg-[#1da851] text-white"
                onClick={saveTemplates}
                disabled={saving}
              >
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

// ── Safe WhatsApp preview component (no dangerouslySetInnerHTML) ──
function WhatsAppPreview({ text }: { text: string }) {
  // Parse WhatsApp markdown into React elements safely
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, lineIdx) => (
        <span key={lineIdx}>
          {lineIdx > 0 && <br />}
          <WhatsAppLine text={line} />
        </span>
      ))}
    </>
  );
}

function WhatsAppLine({ text }: { text: string }) {
  // Simple parser: split by formatting markers and {{variables}}
  const parts: { type: "text" | "bold" | "italic" | "strike" | "code" | "variable"; content: string }[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Find the earliest match
    const patterns = [
      { regex: /\*([^*]+)\*/, type: "bold" as const },
      { regex: /_([^_]+)_/, type: "italic" as const },
      { regex: /~([^~]+)~/, type: "strike" as const },
      { regex: /```([^`]+)```/, type: "code" as const },
      { regex: /\{\{([^}]+)\}\}/, type: "variable" as const },
    ];

    let earliest: { index: number; length: number; content: string; type: typeof patterns[number]["type"] } | null = null;

    for (const p of patterns) {
      const match = remaining.match(p.regex);
      if (match && match.index !== undefined) {
        if (!earliest || match.index < earliest.index) {
          earliest = {
            index: match.index,
            length: match[0].length,
            content: match[1],
            type: p.type,
          };
        }
      }
    }

    if (!earliest) {
      parts.push({ type: "text", content: remaining });
      break;
    }

    if (earliest.index > 0) {
      parts.push({ type: "text", content: remaining.substring(0, earliest.index) });
    }
    parts.push({ type: earliest.type, content: earliest.content });
    remaining = remaining.substring(earliest.index + earliest.length);
  }

  return (
    <>
      {parts.map((part, i) => {
        switch (part.type) {
          case "bold":
            return <strong key={i}>{part.content}</strong>;
          case "italic":
            return <em key={i}>{part.content}</em>;
          case "strike":
            return <del key={i}>{part.content}</del>;
          case "code":
            return (
              <code key={i} className="bg-black/5 px-1 rounded text-[11px]">
                {part.content}
              </code>
            );
          case "variable":
            return (
              <span
                key={i}
                className="bg-[#25D366]/15 text-[#128C7E] px-1 rounded text-[11px]"
              >
                {`{{${part.content}}}`}
              </span>
            );
          default:
            return <span key={i}>{part.content}</span>;
        }
      })}
    </>
  );
}
