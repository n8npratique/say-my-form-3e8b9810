import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Plus, Trash2, ArrowLeft, Eye, Send, User, Shield, CheckCircle, AlertCircle, Calendar, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { EmailTemplate, FormField } from "@/types/workflow";

/** Field types that don't produce useful variable values */
const NON_VARIABLE_TYPES = ["end_screen", "appointment", "statement", "redirect_url"];

/** Sub-field labels for contact_info */
const CONTACT_SUBFIELD_LABELS: Record<string, string> = {
  first_name: "Nome",
  last_name: "Sobrenome",
  email: "Email",
  phone: "Telefone",
  cpf: "CPF",
  cep: "CEP",
  address: "Endereço",
};

interface VariableItem {
  key: string;
  label: string;
  group: "system" | "appointment" | "fields";
}

interface MessagesPanelProps {
  templates: EmailTemplate[];
  onUpdateTemplates: (templates: EmailTemplate[]) => void;
  formId?: string;
  fields?: FormField[];
  hasAppointment?: boolean;
}

const SYSTEM_VARIABLES: VariableItem[] = [
  { key: "{{form_name}}", label: "Nome do form", group: "system" },
  { key: "{{respondent_email}}", label: "Email", group: "system" },
  { key: "{{score}}", label: "Score", group: "system" },
  { key: "{{outcome}}", label: "Outcome", group: "system" },
  { key: "{{tags}}", label: "Tags", group: "system" },
  { key: "{{date}}", label: "Data", group: "system" },
  { key: "{{answers}}", label: "Respostas", group: "system" },
];

const APPOINTMENT_VARIABLES: VariableItem[] = [
  { key: "{{appointment_datetime}}", label: "Data/hora", group: "appointment" },
  { key: "{{calendar_link}}", label: "Link Calendar", group: "appointment" },
  { key: "{{meet_link}}", label: "Link Meet", group: "appointment" },
  { key: "{{cancel_url}}", label: "Link cancelar", group: "appointment" },
  { key: "{{event_links}}", label: "Links do evento", group: "appointment" },
];

const AUTO_APPOINTMENT_ID = "auto_appointment";

function createAutoAppointmentTemplate(
  subject?: string,
  body?: string,
): EmailTemplate {
  return {
    id: AUTO_APPOINTMENT_ID,
    name: "Confirmação de Agendamento",
    enabled: true,
    recipient: "respondent",
    subject: subject || "Confirmação de agendamento - {{form_name}}",
    header_image_url: "",
    body:
      body ||
      "Olá!\n\nSeu agendamento no formulário {{form_name}} foi confirmado com sucesso.\n\nData: {{appointment_datetime}}\n\n{{event_links}}Caso precise cancelar, clique no link abaixo:\n{{cancel_url}}\n\nObrigado!",
    cta_text: "",
    cta_url: "",
    footer: "Enviado automaticamente via TecForms",
  };
}

const emptyTemplate = (): EmailTemplate => ({
  id: crypto.randomUUID(),
  name: "Novo template",
  enabled: true,
  recipient: "respondent",
  subject: "",
  header_image_url: "",
  body: "",
  cta_text: "",
  cta_url: "",
  footer: "",
});

// ── Substituir variáveis com exemplos para preview ──
const PREVIEW_VARS: Record<string, string> = {
  form_name: "Meu Formulário",
  respondent_email: "usuario@exemplo.com",
  score: "85",
  outcome: "Perfil A",
  tags: "lead, qualificado",
  date: new Date().toLocaleDateString("pt-BR"),
  answers:
    "<strong>Pergunta 1:</strong> Resposta exemplo<br><strong>Pergunta 2:</strong> Outra resposta",
  appointment_datetime: "segunda-feira, 24 de fevereiro de 2026 às 14:00",
  calendar_link: "https://calendar.google.com/calendar/event?eid=exemplo",
  meet_link: "https://meet.google.com/abc-defg-hij",
  cancel_url: "https://tecforms.com/cancel/exemplo-token",
  event_links:
    "Ver no Google Calendar: https://calendar.google.com/...\nLink do Google Meet: https://meet.google.com/...\n\n",
};

function replaceVarsForPreview(text: string): string {
  let result = text;
  for (const [key, val] of Object.entries(PREVIEW_VARS)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
  }
  // Replace {{field:...}} with placeholder
  result = result.replace(/\{\{field:([^}]+)\}\}/g, "[Valor do campo]");
  return result;
}

function buildPreviewHtml(template: EmailTemplate): string {
  const subject = replaceVarsForPreview(template.subject || "Assunto do email");
  const body = replaceVarsForPreview(template.body || "Corpo do email...").replace(/\n/g, "<br>");
  const footer = replaceVarsForPreview(template.footer || "");
  const ctaText = replaceVarsForPreview(template.cta_text || "");
  const ctaUrl = replaceVarsForPreview(template.cta_url || "#");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{margin:0;padding:16px;background:#f5f5f5;font-family:Arial,sans-serif;}
  .container{background:#fff;border-radius:8px;overflow:hidden;max-width:480px;margin:0 auto;}
  .body{padding:24px;}
  h1{margin:0 0 12px;font-size:18px;color:#111;}
  p{margin:0;font-size:14px;color:#444;line-height:1.6;}
  .cta{text-align:center;margin-top:20px;}
  .cta a{display:inline-block;background:#3B72D9;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;}
  .footer{padding:12px 24px;border-top:1px solid #eee;}
  .footer p{font-size:11px;color:#999;margin:0;}
</style></head>
<body>
  <div class="container">
    ${template.header_image_url ? `<img src="${template.header_image_url}" style="width:100%;display:block;max-height:160px;object-fit:cover;" onerror="this.style.display='none'">` : ""}
    <div class="body">
      <h1>${subject}</h1>
      <p>${body}</p>
      ${ctaText ? `<div class="cta"><a href="${ctaUrl}">${ctaText}</a></div>` : ""}
    </div>
    ${footer ? `<div class="footer"><p>${footer}</p></div>` : ""}
  </div>
</body>
</html>`;
}

// ── Status badge do email config ──
function EmailConfigBadge({ formId }: { formId?: string }) {
  const [status, setStatus] = useState<"loading" | "provider" | "oauth" | "none">("loading");
  const [providerName, setProviderName] = useState("");

  useEffect(() => {
    if (!formId) return;
    (async () => {
      const { data: form } = await supabase
        .from("forms")
        .select("workspace_id")
        .eq("id", formId)
        .maybeSingle();
      if (!form?.workspace_id) { setStatus("none"); return; }

      const { data: ws } = await supabase
        .from("workspaces")
        .select("settings")
        .eq("id", form.workspace_id)
        .maybeSingle();
      const emailCfg = (ws?.settings as any)?.email;
      if (emailCfg?.provider) {
        setProviderName(emailCfg.provider === "google_oauth" ? "Gmail API" : "Resend");
        setStatus("provider");
        return;
      }

      // google_oauth_connections table doesn't exist yet; skip OAuth check
      // const { data: connections } = await supabase
      //   .from("google_oauth_connections")
      //   .select("id, google_email")
      //   .eq("workspace_id", form.workspace_id)
      //   .limit(1);
      // if (connections && connections.length > 0) {
      //   setProviderName(`Gmail (${connections[0].google_email})`);
      //   setStatus("oauth");
      //   return;
      // }

      setStatus("none");
    })();
  }, [formId]);

  if (status === "loading" || !formId) return null;

  if (status === "provider" || status === "oauth") {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-1.5">
        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
        <span className="text-xs text-green-700 dark:text-green-400">
          Email configurado ({providerName})
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1.5">
      <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
      <span className="text-xs text-yellow-700 dark:text-yellow-400">
        Conecte uma conta Google nas Configurações do Workspace
      </span>
    </div>
  );
}

export const MessagesPanel = ({
  templates,
  onUpdateTemplates,
  formId,
  fields = [],
  hasAppointment = false,
}: MessagesPanelProps) => {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  // ── Auto-create appointment template if needed ──
  useEffect(() => {
    if (!hasAppointment) return;
    const hasAutoTemplate = templates.some((t) => t.id === AUTO_APPOINTMENT_ID);
    if (hasAutoTemplate) return;

    // Try to migrate from appointment_config confirmation_email fields
    const appointmentField = fields.find((f) => f.type === "appointment");
    const cfg = appointmentField?.appointment_config;
    const migratedSubject = cfg?.confirmation_email_subject || undefined;
    const migratedBody = cfg?.confirmation_email_body || undefined;

    const autoTemplate = createAutoAppointmentTemplate(migratedSubject, migratedBody);
    onUpdateTemplates([autoTemplate, ...templates]);
  }, [hasAppointment]); // Only run when hasAppointment changes (initial render)

  // ── Build dynamic variables list ──
  const variables = useMemo((): VariableItem[] => {
    const result: VariableItem[] = [...SYSTEM_VARIABLES];

    if (hasAppointment) {
      result.push(...APPOINTMENT_VARIABLES);
    }

    // Field variables
    for (const f of fields) {
      if (NON_VARIABLE_TYPES.includes(f.type) || !f.label.trim()) continue;
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
        result.push({
          key: `{{field:${f.label}}}`,
          label: f.label,
          group: "fields",
        });
      }
    }

    return result;
  }, [fields, hasAppointment]);

  const editing = templates.find((t) => t.id === editingId) || null;
  const isAutoAppointment = editing?.id === AUTO_APPOINTMENT_ID;

  const addTemplate = () => {
    const t = emptyTemplate();
    onUpdateTemplates([...templates, t]);
    setEditingId(t.id);
  };

  const updateTemplate = (id: string, patch: Partial<EmailTemplate>) => {
    onUpdateTemplates(templates.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const deleteTemplate = (id: string) => {
    if (id === AUTO_APPOINTMENT_ID) return; // Can't delete auto template
    onUpdateTemplates(templates.filter((t) => t.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const insertVariable = (varKey: string) => {
    if (activeField === "body" && bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = editing?.body || "";
      const newVal = val.substring(0, start) + varKey + val.substring(end);
      updateTemplate(editingId!, { body: newVal });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + varKey.length, start + varKey.length);
      }, 0);
    } else if (activeField === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = editing?.subject || "";
      const newVal = val.substring(0, start) + varKey + val.substring(end);
      updateTemplate(editingId!, { subject: newVal });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + varKey.length, start + varKey.length);
      }, 0);
    }
  };

  const sendTestEmail = async () => {
    if (!editing || !formId) return;
    setSendingTest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          form_id: formId,
          test_mode: true,
          test_email: user.email,
          test_template: editing,
        },
      });

      if (error) throw error;
      if (data?.sent === false) throw new Error(data.reason || "Não foi possível enviar");

      toast({ title: "Email de teste enviado!", description: `Enviado para ${user.email}` });
    } catch (err: any) {
      toast({ title: "Erro ao enviar teste", description: err.message, variant: "destructive" });
    }
    setSendingTest(false);
  };

  // ── Group variables for rendering ──
  const systemVars = variables.filter((v) => v.group === "system");
  const appointmentVars = variables.filter((v) => v.group === "appointment");
  const fieldVars = variables.filter((v) => v.group === "fields");

  // List view
  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Templates de Email</h3>
        </div>

        <EmailConfigBadge formId={formId} />

        <p className="text-xs text-muted-foreground">
          Configure emails automáticos enviados ao completar o formulário.
        </p>

        {templates.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Nenhum template configurado.</p>
          </div>
        ) : (
          templates.map((t) => {
            const isAuto = t.id === AUTO_APPOINTMENT_ID;
            return (
              <div key={t.id} className={`border rounded-lg p-3 flex items-center gap-2 ${isAuto ? "border-blue-500/30 bg-blue-500/5" : ""}`}>
                <Switch
                  checked={t.enabled}
                  onCheckedChange={(v) => updateTemplate(t.id, { enabled: v })}
                />
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => setEditingId(t.id)}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isAuto && <Calendar className="h-3 w-3 text-blue-600 shrink-0" />}
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
                      <><Shield className="h-3 w-3" /> Proprietário</>
                    )}
                  </div>
                </button>
                {isAuto ? (
                  <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteTemplate(t.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            );
          })
        )}

        <Button variant="outline" size="sm" className="w-full" onClick={addTemplate}>
          <Plus className="h-4 w-4 mr-1" /> Novo template
        </Button>
      </div>
    );
  }

  // Editor view
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-semibold text-sm flex-1">Editar Template</h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1 px-2"
          onClick={() => setShowPreview(!showPreview)}
        >
          <Eye className="h-3 w-3" /> {showPreview ? "Fechar" : "Preview"}
        </Button>
      </div>

      {/* Auto-appointment badge */}
      {isAutoAppointment && (
        <div className="flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5">
          <Calendar className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-xs text-blue-700 dark:text-blue-400">
            Template de agendamento (não pode ser excluído)
          </span>
        </div>
      )}

      {/* Preview em iframe isolado */}
      {showPreview && (
        <div className="rounded-lg border overflow-hidden bg-muted/20" style={{ height: 360 }}>
          <iframe
            title="Email Preview"
            srcDoc={buildPreviewHtml(editing)}
            className="w-full h-full border-0"
            sandbox="allow-same-origin"
          />
        </div>
      )}

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <Switch
          checked={editing.enabled}
          onCheckedChange={(v) => updateTemplate(editing.id, { enabled: v })}
        />
        <Label className="text-xs">Ativo</Label>
        <Badge
          variant={editing.enabled ? "default" : "secondary"}
          className="text-[9px] px-1.5 py-0 h-4 ml-auto"
        >
          {editing.enabled ? "Ativo" : "Desativado"}
        </Badge>
      </div>

      {/* Name */}
      <div>
        <Label className="text-xs">Nome do template</Label>
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
              <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Respondente</div>
            </SelectItem>
            <SelectItem value="owner">
              <div className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Dono do formulário</div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Variables — grouped */}
      <div className="space-y-2">
        <Label className="text-xs mb-1 block">Variáveis (clique para inserir)</Label>

        {/* Sistema */}
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sistema</span>
          <div className="flex flex-wrap gap-1">
            {systemVars.map((v) => (
              <Badge
                key={v.key}
                variant="secondary"
                className="cursor-pointer text-[10px] hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={() => insertVariable(v.key)}
              >
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
                <Badge
                  key={v.key}
                  variant="secondary"
                  className="cursor-pointer text-[10px] hover:bg-blue-600 hover:text-white transition-colors border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                  onClick={() => insertVariable(v.key)}
                >
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
                <Badge
                  key={v.key}
                  variant="outline"
                  className="cursor-pointer text-[10px] hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => insertVariable(v.key)}
                >
                  {v.label}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Subject */}
      <div>
        <Label className="text-xs">Assunto</Label>
        <Input
          ref={subjectRef}
          className="h-8 text-xs mt-1"
          placeholder="Ex: Obrigado por responder {{form_name}}"
          value={editing.subject}
          onChange={(e) => updateTemplate(editing.id, { subject: e.target.value })}
          onFocus={() => setActiveField("subject")}
        />
      </div>

      {/* Header image */}
      <div>
        <Label className="text-xs">Imagem de topo (URL)</Label>
        <Input
          className="h-8 text-xs mt-1"
          placeholder="https://exemplo.com/banner.png"
          value={editing.header_image_url || ""}
          onChange={(e) => updateTemplate(editing.id, { header_image_url: e.target.value })}
        />
        {editing.header_image_url && (
          <img
            src={editing.header_image_url}
            alt="Preview"
            className="w-full h-16 object-cover rounded mt-1"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>

      {/* Body */}
      <div>
        <Label className="text-xs">Corpo do email</Label>
        <Textarea
          ref={bodyRef}
          className="text-xs mt-1 min-h-[100px]"
          placeholder="Olá! Obrigado por responder ao formulário {{form_name}}. Seu score foi {{score}}."
          value={editing.body}
          onChange={(e) => updateTemplate(editing.id, { body: e.target.value })}
          onFocus={() => setActiveField("body")}
        />
      </div>

      {/* CTA */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Texto do botão (CTA)</Label>
          <Input
            className="h-8 text-xs mt-1"
            placeholder="Ver resultados"
            value={editing.cta_text || ""}
            onChange={(e) => updateTemplate(editing.id, { cta_text: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">URL do botão</Label>
          <Input
            className="h-8 text-xs mt-1"
            placeholder="https://..."
            value={editing.cta_url || ""}
            onChange={(e) => updateTemplate(editing.id, { cta_url: e.target.value })}
          />
        </div>
      </div>

      {/* Footer */}
      <div>
        <Label className="text-xs">Rodapé</Label>
        <Textarea
          className="text-xs mt-1 min-h-[60px]"
          placeholder="© 2025 Sua Empresa. Todos os direitos reservados."
          value={editing.footer || ""}
          onChange={(e) => updateTemplate(editing.id, { footer: e.target.value })}
        />
      </div>

      {/* Botão de teste */}
      {formId && (
        <div className="pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5"
            onClick={sendTestEmail}
            disabled={sendingTest}
          >
            <Send className="h-3.5 w-3.5" />
            {sendingTest ? "Enviando..." : "Enviar email de teste"}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-1">
            Será enviado para seu email cadastrado
          </p>
        </div>
      )}
    </div>
  );
};
