import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Check, X, ImageIcon, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { FormTheme, WelcomeScreen } from "@/lib/formTheme";
import { THEME_PALETTES, AVAILABLE_FONTS, DEFAULT_THEME } from "@/lib/formTheme";
import { BackgroundPicker } from "./BackgroundPicker";

interface ThemePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: FormTheme;
  onChange: (theme: FormTheme) => void;
}

export const ThemePanel = ({ open, onOpenChange, theme, onChange }: ThemePanelProps) => {
  const [local, setLocal] = useState<FormTheme>(theme);

  useEffect(() => {
    if (open) setLocal(theme);
  }, [open, theme]);

  const update = (patch: Partial<FormTheme>) => {
    setLocal((prev) => ({ ...prev, ...patch }));
  };

  const updateWelcome = (patch: Partial<WelcomeScreen>) => {
    setLocal((prev) => ({
      ...prev,
      welcome_screen: { ...( prev.welcome_screen || { enabled: false }), ...patch },
    }));
  };

  const applyPalette = (t: FormTheme) => {
    setLocal((prev) => ({
      ...t,
      background_image: prev.background_image,
      background_size: prev.background_size,
      background_overlay: prev.background_overlay,
      welcome_screen: prev.welcome_screen,
    }));
  };

  const save = () => {
    onChange(local);
    onOpenChange(false);
  };

  const isGradientBg = (color: string) => color.includes("gradient");
  const welcome = local.welcome_screen || { enabled: false };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Aparência do Formulário</DialogTitle>
          <DialogDescription>Personalize cores, fontes, fundo e tela de boas-vindas</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="flex flex-col">
          <div className="px-6 pt-3">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="appearance"><ImageIcon className="h-3.5 w-3.5 mr-1" /> Aparência</TabsTrigger>
              <TabsTrigger value="welcome"><Sparkles className="h-3.5 w-3.5 mr-1" /> Boas-vindas</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="max-h-[65vh]">
            {/* ===== APPEARANCE TAB ===== */}
            <TabsContent value="appearance" className="p-6 space-y-6 mt-0">
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
                        <div className="w-5 h-5 rounded-full border" style={{ background: p.theme.background_color }} />
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
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_FONTS.map((f) => (
                          <SelectItem key={f} value={f} style={{ fontFamily: `"${f}", sans-serif` }}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tamanho da fonte ({local.font_size || 16}px)</Label>
                    <Slider value={[local.font_size || 16]} min={12} max={24} step={1} onValueChange={([v]) => update({ font_size: v })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Estilo</Label>
                    <div className="flex gap-2">
                      <Button type="button" variant={local.font_weight === "bold" ? "default" : "outline"} size="sm" className="h-9 w-9 font-bold text-base" onClick={() => update({ font_weight: local.font_weight === "bold" ? "normal" : "bold" })}>B</Button>
                      <Button type="button" variant={local.font_style === "italic" ? "default" : "outline"} size="sm" className="h-9 w-9 italic text-base" onClick={() => update({ font_style: local.font_style === "italic" ? "normal" : "italic" })}>I</Button>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Imagem de fundo */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4" /> Imagem de fundo / Textura
                </Label>
                <BackgroundPicker
                  imageUrl={local.background_image}
                  imageSize={local.background_size}
                  imageOverlay={local.background_overlay ?? 0}
                  backgroundColor={local.background_color}
                  onImageChange={(url) => update({ background_image: url })}
                  onSizeChange={(size) => update({ background_size: size })}
                  onOverlayChange={(overlay) => update({ background_overlay: overlay })}
                  onBackgroundColorChange={(color) => update({ background_color: color })}
                />
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
                  {local.background_image && (local.background_overlay ?? 0) > 0 && (
                    <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${local.background_overlay})` }} />
                  )}
                  <div className="relative z-10 text-center space-y-2">
                    <p style={{ color: local.text_secondary_color }} className="text-xs">1 → 5</p>
                    <p className="font-bold" style={{ fontSize: local.font_size ? `${local.font_size}px` : undefined, fontWeight: local.font_weight || undefined, fontStyle: local.font_style || undefined }}>Como você avalia nosso serviço?</p>
                    <button className="px-4 py-1.5 rounded-md text-sm font-medium" style={{ backgroundColor: local.button_color, color: local.button_text_color }}>OK ✓</button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ===== WELCOME SCREEN TAB ===== */}
            <TabsContent value="welcome" className="p-6 space-y-6 mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Tela de Boas-vindas</Label>
                  <p className="text-xs text-muted-foreground">Exibida antes da primeira pergunta</p>
                </div>
                <Switch
                  checked={welcome.enabled}
                  onCheckedChange={(v) => updateWelcome({ enabled: v })}
                />
              </div>

              {welcome.enabled && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Título</Label>
                    <Input
                      placeholder="Ex: Bem-vindo à nossa pesquisa!"
                      value={welcome.title || ""}
                      onChange={(e) => updateWelcome({ title: e.target.value })}
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição</Label>
                    <Textarea
                      placeholder="Uma breve descrição sobre o formulário..."
                      value={welcome.description || ""}
                      onChange={(e) => updateWelcome({ description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Texto do botão</Label>
                    <Input
                      placeholder="Começar"
                      value={welcome.button_text || ""}
                      onChange={(e) => updateWelcome({ button_text: e.target.value })}
                      className="h-9"
                    />
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4" /> Imagem de fundo da Boas-vindas
                    </Label>
                    <BackgroundPicker
                      imageUrl={welcome.image_url}
                      imageSize={welcome.image_size}
                      imageOverlay={welcome.image_overlay ?? 0}
                      onImageChange={(url) => updateWelcome({ image_url: url })}
                      onSizeChange={(size) => updateWelcome({ image_size: size })}
                      onOverlayChange={(overlay) => updateWelcome({ image_overlay: overlay })}
                    />
                  </div>

                  <Separator />

                  {/* Welcome preview */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Preview da Boas-vindas</Label>
                    <div
                      className="relative rounded-lg border p-6 min-h-[160px] flex flex-col items-center justify-center gap-4 overflow-hidden"
                      style={{
                        ...(isGradientBg(local.background_color)
                          ? { background: local.background_color }
                          : { backgroundColor: local.background_color }),
                        color: local.text_color,
                        fontFamily: `"${local.font_family}", sans-serif`,
                        ...(welcome.image_url
                          ? {
                              backgroundImage: `url(${welcome.image_url})`,
                              backgroundSize: welcome.image_size === "repeat" ? "auto" : (welcome.image_size || "cover"),
                              backgroundRepeat: welcome.image_size === "repeat" ? "repeat" : "no-repeat",
                              backgroundPosition: "center",
                            }
                          : local.background_image
                          ? {
                              backgroundImage: `url(${local.background_image})`,
                              backgroundSize: local.background_size === "repeat" ? "auto" : (local.background_size || "cover"),
                              backgroundRepeat: local.background_size === "repeat" ? "repeat" : "no-repeat",
                              backgroundPosition: "center",
                            }
                          : {}),
                      }}
                    >
                      {((welcome.image_url && (welcome.image_overlay ?? 0) > 0) || (!welcome.image_url && local.background_image && (local.background_overlay ?? 0) > 0)) && (
                        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${welcome.image_url ? welcome.image_overlay : local.background_overlay})` }} />
                      )}
                      <div className="relative z-10 text-center space-y-3">
                        <p className="text-xl font-bold">{welcome.title || "Bem-vindo!"}</p>
                        {welcome.description && <p className="text-sm" style={{ color: local.text_secondary_color }}>{welcome.description}</p>}
                        <button className="px-6 py-2 rounded-md text-sm font-semibold" style={{ backgroundColor: local.button_color, color: local.button_text_color }}>
                          {welcome.button_text || "Começar"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

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
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded border cursor-pointer p-0.5" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-xs font-mono" />
      </div>
    </div>
  );
}
