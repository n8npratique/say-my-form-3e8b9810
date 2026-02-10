import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Plus, Trash2, ArrowLeft, Eye } from "lucide-react";
import { EmailPreview } from "./EmailPreview";
import type { EmailTemplate } from "@/types/workflow";

interface MessagesPanelProps {
  templates: EmailTemplate[];
  onUpdateTemplates: (templates: EmailTemplate[]) => void;
}

const VARIABLES = [
  { key: "{{form_name}}", label: "Nome do form" },
  { key: "{{respondent_email}}", label: "Email" },
  { key: "{{score}}", label: "Score" },
  { key: "{{outcome}}", label: "Outcome" },
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

export const MessagesPanel = ({ templates, onUpdateTemplates }: MessagesPanelProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
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

  // List view
  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Templates de Email</h3>
        </div>
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
                className="flex-1 text-left"
                onClick={() => setEditingId(t.id)}
              >
                <span className="text-xs font-medium block">{t.name || "Sem nome"}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t.recipient === "respondent" ? "→ Respondente" : "→ Dono do form"}
                </span>
              </button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteTemplate(t.id)}>
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
          className="text-xs gap-1"
          onClick={() => setShowPreview(!showPreview)}
        >
          <Eye className="h-3 w-3" /> {showPreview ? "Ocultar" : "Preview"}
        </Button>
      </div>

      {showPreview && (
        <div className="flex justify-center">
          <EmailPreview template={editing} />
        </div>
      )}

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <Switch
          checked={editing.enabled}
          onCheckedChange={(v) => updateTemplate(editing.id, { enabled: v })}
        />
        <Label className="text-xs">Ativo</Label>
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
            <SelectItem value="respondent">Respondente</SelectItem>
            <SelectItem value="owner">Dono do formulário</SelectItem>
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
    </div>
  );
};
