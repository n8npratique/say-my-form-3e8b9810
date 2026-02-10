import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Search, X, Image as ImageIcon, Palette, Droplets } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  BACKGROUND_CATEGORIES,
  PRESET_GRADIENTS,
  PRESET_SOLID_COLORS,
} from "@/lib/backgroundImages";
import { useToast } from "@/hooks/use-toast";

interface BackgroundPickerProps {
  imageUrl?: string;
  imageSize?: "cover" | "contain" | "repeat";
  imageOverlay?: number;
  backgroundColor?: string;
  onImageChange: (url: string | undefined) => void;
  onSizeChange: (size: "cover" | "contain" | "repeat") => void;
  onOverlayChange: (overlay: number) => void;
  onBackgroundColorChange?: (color: string) => void;
}

export const BackgroundPicker = ({
  imageUrl,
  imageSize = "cover",
  imageOverlay = 0,
  backgroundColor,
  onImageChange,
  onSizeChange,
  onOverlayChange,
  onBackgroundColorChange,
}: BackgroundPickerProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const filteredCategories = searchQuery.trim()
    ? BACKGROUND_CATEGORIES.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : BACKGROUND_CATEGORIES;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem deve ter no máximo 5MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `backgrounds/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("form-assets").upload(path, file);
    if (error) {
      toast({ title: "Erro ao enviar imagem", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("form-assets").getPublicUrl(path);
    onImageChange(urlData.publicUrl);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="gallery">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="gallery" className="text-xs"><ImageIcon className="h-3 w-3 mr-1" />Galeria</TabsTrigger>
          <TabsTrigger value="upload" className="text-xs"><Upload className="h-3 w-3 mr-1" />Upload</TabsTrigger>
          <TabsTrigger value="color" className="text-xs"><Palette className="h-3 w-3 mr-1" />Cor</TabsTrigger>
          <TabsTrigger value="gradient" className="text-xs"><Droplets className="h-3 w-3 mr-1" />Degradê</TabsTrigger>
        </TabsList>

        <TabsContent value="gallery" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar categoria (ex: natureza, abstrato)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <ScrollArea className="h-[200px]">
            <div className="space-y-4">
              {filteredCategories.map((cat) => (
                <div key={cat.name}>
                  <p className="text-xs font-semibold mb-1.5">{cat.emoji} {cat.name}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {cat.images.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => onImageChange(url)}
                        className={`relative h-16 rounded-md overflow-hidden border-2 transition-all hover:opacity-90 ${
                          imageUrl === url ? "border-primary ring-1 ring-primary" : "border-transparent"
                        }`}
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <Input
            placeholder="Ou cole uma URL de imagem..."
            value={imageUrl?.startsWith("http") && !BACKGROUND_CATEGORIES.some(c => c.images.includes(imageUrl)) ? imageUrl : ""}
            onChange={(e) => onImageChange(e.target.value || undefined)}
            className="h-9 text-xs"
          />
        </TabsContent>

        <TabsContent value="upload" className="space-y-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">{uploading ? "Enviando..." : "Clique para enviar uma imagem"}</p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP (máx 5MB)</p>
          </div>
          {imageUrl && (
            <div className="relative rounded-lg border overflow-hidden h-24">
              <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="color" className="space-y-3">
          <Label className="text-xs">Cores sólidas</Label>
          <div className="grid grid-cols-8 gap-1.5">
            {PRESET_SOLID_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onImageChange(undefined);
                  onBackgroundColorChange?.(color);
                }}
                className={`h-8 w-full rounded-md border transition-all ${
                  backgroundColor === color && !imageUrl ? "ring-2 ring-primary ring-offset-1" : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={backgroundColor?.startsWith("#") ? backgroundColor : "#ffffff"}
              onChange={(e) => {
                onImageChange(undefined);
                onBackgroundColorChange?.(e.target.value);
              }}
              className="w-9 h-9 rounded border cursor-pointer p-0.5"
            />
            <Input
              placeholder="Cor personalizada (#hex)"
              value={backgroundColor?.startsWith("#") ? backgroundColor : ""}
              onChange={(e) => {
                onImageChange(undefined);
                onBackgroundColorChange?.(e.target.value);
              }}
              className="h-9 text-xs font-mono"
            />
          </div>
        </TabsContent>

        <TabsContent value="gradient" className="space-y-3">
          <Label className="text-xs">Degradês predefinidos</Label>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_GRADIENTS.map((g) => (
              <button
                key={g.name}
                onClick={() => {
                  onImageChange(undefined);
                  onBackgroundColorChange?.(g.value);
                }}
                className={`h-12 rounded-md border transition-all ${
                  backgroundColor === g.value ? "ring-2 ring-primary ring-offset-1" : ""
                }`}
                style={{ background: g.value }}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Selecione um degradê para usar como fundo</p>
        </TabsContent>
      </Tabs>

      {/* Image controls */}
      {imageUrl && (
        <div className="space-y-3 pt-2 border-t">
          <div className="relative rounded-lg border overflow-hidden h-24">
            <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
            {imageOverlay > 0 && (
              <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${imageOverlay})` }} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Modo de exibição</Label>
              <Select value={imageSize} onValueChange={(v) => onSizeChange(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Preencher</SelectItem>
                  <SelectItem value="contain">Conter</SelectItem>
                  <SelectItem value="repeat">Ladrilho</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Overlay ({Math.round(imageOverlay * 100)}%)</Label>
              <Slider value={[imageOverlay]} min={0} max={1} step={0.05} onValueChange={([v]) => onOverlayChange(v)} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onImageChange(undefined)}>
            <X className="h-3 w-3 mr-1" /> Remover imagem
          </Button>
        </div>
      )}
    </div>
  );
};
