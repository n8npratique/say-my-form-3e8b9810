import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Image, Video, PanelBottom, ExternalLink, Trash2 } from "lucide-react";
import { getFieldTypeConfig } from "@/config/fieldTypes";
import type { FormField } from "./FieldItem";
import type { ContactFieldKey } from "@/types/workflow";
import { parseMediaUrl } from "@/lib/mediaUtils";
import { supabase } from "@/integrations/supabase/client";
import { useRef } from "react";
import { AppointmentConfigSection } from "./AppointmentConfigSection";

const COUNTRY_OPTIONS = [
  { code: "", label: "Brasil (padrão)" },
  { code: "BR", label: "🇧🇷 Brasil (+55)" },
  { code: "US", label: "🇺🇸 Estados Unidos (+1)" },
  { code: "AR", label: "🇦🇷 Argentina (+54)" },
  { code: "PT", label: "🇵🇹 Portugal (+351)" },
  { code: "MX", label: "🇲🇽 México (+52)" },
  { code: "GB", label: "🇬🇧 Reino Unido (+44)" },
  { code: "DE", label: "🇩🇪 Alemanha (+49)" },
  { code: "FR", label: "🇫🇷 França (+33)" },
  { code: "ES", label: "🇪🇸 Espanha (+34)" },
  { code: "CO", label: "🇨🇴 Colômbia (+57)" },
];

const OPTION_TYPES = ["multiple_choice", "dropdown", "image_choice", "checkbox", "ranking"];

const ALL_CONTACT_FIELDS: { key: ContactFieldKey; label: string }[] = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Sobrenome" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefone" },
  { key: "cpf", label: "CPF" },
  { key: "cep", label: "CEP" },
  { key: "address", label: "Endereço" },
];

interface FieldConfigPanelProps {
  field: FormField;
  onChange: (updated: FormField) => void;
  onDelete?: () => void;
  workspaceId?: string;
  fields?: FormField[];
}

export const FieldConfigPanel = ({ field, onChange, onDelete, workspaceId, fields = [] }: FieldConfigPanelProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cfg = getFieldTypeConfig(field.type);
  const hasOptions = OPTION_TYPES.includes(field.type);
  const isEndScreen = field.type === "end_screen";

  if (!cfg) return null;
  const Icon = cfg.icon;

  const handleEndScreenImageUpload = async (file: File) => {
    try {
      const ext = file.name.split(".").pop();
      const path = `end-screens/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("form-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("form-assets").getPublicUrl(path);
      onChange({ ...field, media_url: data.publicUrl, media_type: "image" });
    } catch (e) {
      console.error("Erro ao fazer upload:", e);
    }
  };

  const handleMediaUrlChange = (url: string) => {
    if (!url.trim()) {
      onChange({ ...field, media_url: undefined, media_type: undefined });
      return;
    }
    const info = parseMediaUrl(url);
    onChange({
      ...field,
      media_url: url,
      media_type: info?.type ?? "image",
    });
  };

  const mediaInfo = field.media_url ? parseMediaUrl(field.media_url) : null;

  const toggleContactField = (key: ContactFieldKey) => {
    const current = field.contact_fields || ["first_name", "email"];
    const updated = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key];
    onChange({ ...field, contact_fields: updated });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
          <Icon className={`h-5 w-5 ${cfg.color}`} />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-semibold text-lg">{cfg.label}</h3>
          <p className="text-xs text-muted-foreground">Configure os detalhes deste campo</p>
        </div>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            title="Excluir campo"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {/* ── END SCREEN exclusive config ── */}
        {isEndScreen ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={field.label}
                onChange={(e) => onChange({ ...field, label: e.target.value })}
                placeholder="Obrigado!"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={field.placeholder || ""}
                onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                placeholder="Suas respostas foram enviadas com sucesso."
                rows={3}
              />
            </div>

            {/* Image */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-1">
                <Image className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm">Imagem (opcional)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={field.media_url || ""}
                  onChange={(e) => onChange({ ...field, media_url: e.target.value || undefined, media_type: e.target.value ? "image" : undefined })}
                  placeholder="URL da imagem..."
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload
                </Button>
                {field.media_url && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onChange({ ...field, media_url: undefined, media_type: undefined })}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEndScreenImageUpload(f); }}
              />
              {field.media_url && (
                <img src={field.media_url} alt="Preview" className="w-full max-h-32 object-contain rounded-md border mt-2 bg-muted" />
              )}
            </div>

            {/* Button */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-1">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm">Botão (opcional)</Label>
              </div>
              <Input
                value={(field as any).button_text || ""}
                onChange={(e) => onChange({ ...field, ...(e.target.value ? { button_text: e.target.value } : { button_text: undefined }) } as any)}
                placeholder="Texto do botão, ex: Responder novamente"
                className="mb-2"
              />
              <Input
                value={(field as any).button_url || ""}
                onChange={(e) => onChange({ ...field, ...(e.target.value ? { button_url: e.target.value } : { button_url: undefined }) } as any)}
                placeholder="URL do botão, ex: https://..."
              />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Título da pergunta</Label>
              <Input
                value={field.label}
                onChange={(e) => onChange({ ...field, label: e.target.value })}
                placeholder="Digite sua pergunta aqui..."
              />
            </div>

            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                value={field.placeholder || ""}
                onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                placeholder="Texto de exemplo..."
              />
            </div>

            {/* Contact Info Fields Selector */}
            {field.type === "contact_info" && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-sm font-medium">Campos visíveis</Label>
                <p className="text-xs text-muted-foreground mb-2">Escolha quais campos exibir nesta pergunta</p>
                <div className="space-y-2">
                  {ALL_CONTACT_FIELDS.map(({ key, label }) => {
                    const active = (field.contact_fields || ["first_name", "email"]).includes(key);
                    return (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={active} onCheckedChange={() => toggleContactField(key)} />
                        <span className="text-sm">{label}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="space-y-1.5 pt-2 border-t">
                    <Label className="text-sm">País do contato</Label>
                    <p className="text-xs text-muted-foreground">Define o padrão de telefone, CEP e documento</p>
                    <Select
                      value={field.default_country || ""}
                      onValueChange={(v) => onChange({ ...field, default_country: v === "__default__" ? undefined : v || undefined })}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Brasil (padrão)" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.code} value={opt.code || "__default__"}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
              </div>
            )}

            {/* Appointment Config */}
            {field.type === "appointment" && workspaceId && (
              <AppointmentConfigSection field={field} onChange={onChange} workspaceId={workspaceId} fields={fields} />
            )}

            {hasOptions && (
              <div className="space-y-2">
                <Label>Opções</Label>
                <div className="space-y-2">
                  {(field.options || []).map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...(field.options || [])];
                          newOpts[i] = e.target.value;
                          onChange({ ...field, options: newOpts });
                        }}
                        placeholder={`Opção ${i + 1}`}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          const newOpts = (field.options || []).filter((_, idx) => idx !== i);
                          onChange({ ...field, options: newOpts });
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onChange({ ...field, options: [...(field.options || []), ""] })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar opção
                  </Button>
                </div>
              </div>
            )}

            {/* Media Section */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                {field.media_type === "video" ? (
                  <Video className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Image className="h-4 w-4 text-muted-foreground" />
                )}
                <Label className="text-sm">Mídia</Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={field.media_url || ""}
                  onChange={(e) => handleMediaUrlChange(e.target.value)}
                  placeholder="Cole a URL do YouTube, Vimeo ou imagem..."
                  className="flex-1"
                />
                {field.media_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => onChange({ ...field, media_url: undefined, media_type: undefined })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {mediaInfo && (
                <div className="mt-2 rounded-md overflow-hidden border">
                  {mediaInfo.type === "video" ? (
                    <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                      <iframe
                        src={mediaInfo.embedUrl}
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Preview de vídeo"
                      />
                    </div>
                  ) : (
                    <img
                      src={mediaInfo.embedUrl}
                      alt="Preview de mídia"
                      className="w-full max-h-48 object-contain bg-muted"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* ── REDIRECT URL config ── */}
            {field.type === "redirect_url" && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">URL de redirecionamento</Label>
                </div>
                <Input
                  value={(field as any).redirect_url || ""}
                  onChange={(e) => onChange({ ...field, redirect_url: e.target.value } as any)}
                  placeholder="https://exemplo.com"
                />
                <p className="text-xs text-muted-foreground">
                  O respondente será redirecionado para esta URL ao chegar neste campo.
                </p>
              </div>
            )}

            {/* ── FILE UPLOAD config ── */}
            {field.type === "file_upload" && (
              <div className="space-y-3 rounded-lg border p-3">
                <div>
                  <Label className="text-sm font-medium">Tipos de arquivo aceitos</Label>
                  <p className="text-xs text-muted-foreground mb-2">Selecione quais formatos o respondente pode enviar</p>
                </div>
                {[
                  { ext: ".pdf", label: "PDF", desc: "Documentos" },
                  { ext: ".png", label: "PNG", desc: "Imagem" },
                  { ext: ".jpg", label: "JPG", desc: "Imagem" },
                  { ext: ".jpeg", label: "JPEG", desc: "Imagem" },
                  { ext: ".webp", label: "WebP", desc: "Imagem" },
                  { ext: ".doc", label: "DOC", desc: "Word" },
                  { ext: ".docx", label: "DOCX", desc: "Word" },
                  { ext: ".xls", label: "XLS", desc: "Excel" },
                  { ext: ".xlsx", label: "XLSX", desc: "Excel" },
                  { ext: ".csv", label: "CSV", desc: "Planilha" },
                  { ext: ".zip", label: "ZIP", desc: "Compactado" },
                  { ext: ".mp4", label: "MP4", desc: "Vídeo" },
                  { ext: ".mp3", label: "MP3", desc: "Áudio" },
                ].map(({ ext, label, desc }) => {
                  const accepted = field.accepted_file_types || [];
                  const isChecked = accepted.includes(ext);
                  return (
                    <label key={ext} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          const updated = checked
                            ? [...accepted, ext]
                            : accepted.filter((t) => t !== ext);
                          onChange({ ...field, accepted_file_types: updated });
                        }}
                      />
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">({desc})</span>
                    </label>
                  );
                })}
                {(field.accepted_file_types || []).length === 0 && (
                  <p className="text-xs text-amber-600">Nenhum tipo selecionado = todos os tipos aceitos</p>
                )}
                <div className="pt-2 border-t">
                  <Label className="text-sm">Tamanho máximo (MB)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={field.max_file_size_mb || 10}
                    onChange={(e) => onChange({ ...field, max_file_size_mb: Number(e.target.value) || 10 })}
                    className="mt-1 w-24"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Obrigatório</Label>
                <p className="text-xs text-muted-foreground">O respondente deve preencher este campo</p>
              </div>
              <Switch
                checked={field.required}
                onCheckedChange={(checked) => onChange({ ...field, required: checked })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

