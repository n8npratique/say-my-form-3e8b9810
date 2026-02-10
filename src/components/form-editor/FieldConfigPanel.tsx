import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, X, Image, Video } from "lucide-react";
import { getFieldTypeConfig } from "@/config/fieldTypes";
import type { FormField } from "./FieldItem";
import { parseMediaUrl } from "@/lib/mediaUtils";

const OPTION_TYPES = ["multiple_choice", "dropdown", "image_choice", "checkbox", "ranking"];

interface FieldConfigPanelProps {
  field: FormField;
  onChange: (updated: FormField) => void;
}

export const FieldConfigPanel = ({ field, onChange }: FieldConfigPanelProps) => {
  const cfg = getFieldTypeConfig(field.type);
  if (!cfg) return null;
  const Icon = cfg.icon;
  const hasOptions = OPTION_TYPES.includes(field.type);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
          <Icon className={`h-5 w-5 ${cfg.color}`} />
        </div>
        <div>
          <h3 className="font-display font-semibold text-lg">{cfg.label}</h3>
          <p className="text-xs text-muted-foreground">Configure os detalhes deste campo</p>
        </div>
      </div>

      <div className="space-y-4">
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
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </div>
          )}
        </div>

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
      </div>
    </div>
  );
};
