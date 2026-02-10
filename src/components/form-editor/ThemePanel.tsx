import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, ImageIcon } from "lucide-react";
import type { FormTheme } from "@/lib/formTheme";
import { THEME_PALETTES, AVAILABLE_FONTS, DEFAULT_THEME } from "@/lib/formTheme";

interface ThemePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: FormTheme;
  onChange: (theme: FormTheme) => void;
}

export const ThemePanel = ({ open, onOpenChange, theme, onChange }: ThemePanelProps) => {
  const [local, setLocal] = useState<FormTheme>(theme);

  const update = (patch: Partial<FormTheme>) => {
    setLocal((prev) => ({ ...prev, ...patch }));
  };

  const applyPalette = (t: FormTheme) => {
    setLocal({ ...t, background_image: local.background_image, background_size: local.background_size, background_overlay: local.background_overlay });
  };

  const save = () => {
    onChange(local);
    onOpenChange(false);
  };

  const isGradientBg = (color: string) => color.includes("gradient");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Aparência do Formulário</DialogTitle>
          <DialogDescription>Personalize cores, fontes e imagem de fundo</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="p-6 space-y-6">
            {/* Paletas */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Paletas pré-definidas</Label>
              <div className="grid grid-cols-4 gap-2">
                {THEME_PALETTES.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => applyPalette(p.theme)}
                    className="group relative rounded-lg border p-3 text-left transition-all hover:border-primary hover:shadow-sm"
                  >
                    <div className="flex gap-1 mb-2">
                      <div
                        className="w-5 h-5 rounded-full border"
                        style={{
                          background: isGradientBg(p.theme.background_color)
                            ? p.theme.background_color
                            : p.theme.background_color,
                        }}
                      />
                      <div className="w-5 h-5 rounded-full" style={{ backgroundColor: p.theme.button_color }} />
                      <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: p.theme.text_color }} />
                    </div>
                    <span className="text-[11px] font-medium">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Cores individuais */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Ajuste fino</Label>
              <div className="grid grid-cols-2 gap-4">
                <ColorField label="Cor de fundo" value={isGradientBg(local.background_color) ? "#7C3AED" : local.background_color} onChange={(v) => update({ background_color: v })} />
                <ColorField label="Cor do texto" value={local.text_color} onChange={(v) => update({ text_color: v })} />
                <ColorField label="Texto secundário" value={local.text_secondary_color} onChange={(v) => update({ text_secondary_color: v })} />
                <ColorField label="Cor do botão" value={local.button_color} onChange={(v) => update({ button_color: v })} />
                <ColorField label="Texto do botão" value={local.button_text_color} onChange={(v) => update({ button_text_color: v })} />
                <div className="space-y-1.5">
                  <Label className="text-xs">Fonte</Label>
                  <Select value={local.font_family} onValueChange={(v) => update({ font_family: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_FONTS.map((f) => (
                        <SelectItem key={f} value={f} style={{ fontFamily: `"${f}", sans-serif` }}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Imagem de fundo */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4" /> Imagem de fundo / Textura
              </Label>
              <Input
                placeholder="Cole a URL da imagem (PNG, JPG, WEBP)..."
                value={local.background_image || ""}
                onChange={(e) => update({ background_image: e.target.value || undefined })}
              />

              {local.background_image && (
                <div className="space-y-3">
                  <div className="relative rounded-lg border overflow-hidden h-32">
                    <img
                      src={local.background_image}
                      alt="Preview fundo"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    {local.background_overlay != null && local.background_overlay > 0 && (
                      <div
                        className="absolute inset-0"
                        style={{ backgroundColor: `rgba(0,0,0,${local.background_overlay})` }}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Modo de exibição</Label>
                      <Select
                        value={local.background_size || "cover"}
                        onValueChange={(v) => update({ background_size: v as any })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cover">Preencher (cover)</SelectItem>
                          <SelectItem value="contain">Conter (contain)</SelectItem>
                          <SelectItem value="repeat">Ladrilho (repeat)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Opacidade do overlay ({Math.round((local.background_overlay || 0) * 100)}%)</Label>
                      <Slider
                        value={[local.background_overlay ?? 0]}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={([v]) => update({ background_overlay: v })}
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => update({ background_image: undefined, background_size: undefined, background_overlay: undefined })}
                  >
                    <X className="h-3 w-3 mr-1" /> Remover imagem
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Mini preview */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Preview</Label>
              <div
                className="relative rounded-lg border p-6 min-h-[120px] flex flex-col items-center justify-center gap-3 overflow-hidden"
                style={{
                  ...(isGradientBg(local.background_color)
                    ? { background: local.background_color }
                    : { backgroundColor: local.background_color }),
                  color: local.text_color,
                  fontFamily: `"${local.font_family}", sans-serif`,
                  ...(local.background_image
                    ? {
                        backgroundImage: `url(${local.background_image})`,
                        backgroundSize: local.background_size === "repeat" ? "auto" : (local.background_size || "cover"),
                        backgroundRepeat: local.background_size === "repeat" ? "repeat" : "no-repeat",
                        backgroundPosition: "center",
                      }
                    : {}),
                }}
              >
                {local.background_image && local.background_overlay != null && local.background_overlay > 0 && (
                  <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${local.background_overlay})` }} />
                )}
                <div className="relative z-10 text-center space-y-2">
                  <p style={{ color: local.text_secondary_color }} className="text-xs">1 → 5</p>
                  <p className="font-bold">Como você avalia nosso serviço?</p>
                  <button
                    className="px-4 py-1.5 rounded-md text-sm font-medium"
                    style={{ backgroundColor: local.button_color, color: local.button_text_color }}
                  >
                    OK ✓
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={save}>
            <Check className="h-4 w-4 mr-1" /> Aplicar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded border cursor-pointer p-0.5"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-xs font-mono"
        />
      </div>
    </div>
  );
}
