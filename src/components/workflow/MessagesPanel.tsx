import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Plus, Trash2, ArrowLeft, Eye, Send, User, Shield, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { EmailTemplate } from "@/types/workflow";

interface MessagesPanelProps {
  templates: EmailTemplate[];
  onUpdateTemplates: (templates: EmailTemplate[]) => void;
  formId?: string;
}

const VARIABLES = [
  { key: "{{form_name}}", label: "Nome do form" },
  { key: "{{respondent_email}}", label: "Email" },
  { key: "{{score}}", label: "Score" },
  { key: "{{outcome}}", label: "Outcome" },
  { key: "{{tags}}", label: "Tags" },
  { key: "{{date}}", label: "Data" },
  { key: "{{answers}}", label: "Respostas" },
];

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
  answers: "<strong>Pergunta 1:</strong> Resposta exemplo<br><strong>Pergunta 2:</strong> Outra resposta",
};

function replaceVarsForPreview(text: string): string {
  let result = text;
  for (const [key, val] of Object.entries(PREVIEW_VARS)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
  }
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
  const [emailConfig, setEmailConfig] = useState<any>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!formId) return;
    (async () => {
      const { data: form } = await supabase
        .from("forms")
        .select("workspace_id")
        .eq("id", formId)
        .maybeSingle();
      if (form?.workspace_id) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("settings")
          .eq("id", form.workspace_id)
          .maybeSingle();
        setEmailConfig((ws?.settings as any)?.email || null);
      }
      setChecked(true);
    })();
  }, [formId]);

  if (!checked || !formId) return null;

  if (emailConfig?.provider) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-1.5">
        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
        <span className="text-xs text-green-700 dark:text-green-400">
          Email configurado ({emailConfig.provider === "gmail" ? "Gmail API" : "Resend"})
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1.5">
      <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
      <span className="text-xs text-yellow-700 dark:text-yellow-400">
        Configure o envio de email nas Configurações do Workspace
      </span>
    </div>
  );
}

export const MessagesPanel = ({ templates, onUpdateTemplates, formId }: MessagesPanelProps) => {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const editing = templates.find((t) => t.id === editingId) || null;

  const addTemplate = () => {
    const t = emptyTemplate();
    onUpdateTemplates([...templates, t]);
    setEditingId(t.id);
  };

  const updateTemplate = (id: string, patch: Partial<EmailTemplate>) => {
    onUpdateTemplates(templates.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const deleteTemplate = (id: string) => {
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
          templates.map((t) => (
            <div key={t.id} className="border rounded-lg p-3 flex items-center gap-2">
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
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteTemplate(t.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))
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

      {/* Variables */}
      <div>
        <Label className="text-xs mb-1 block">Variáveis (clique para inserir)</Label>
        <div className="flex flex-wrap gap-1">
          {VARIABLES.map((v) => (
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
