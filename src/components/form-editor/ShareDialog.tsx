import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Copy, Check, Globe, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  slug: string | null;
}

export const ShareDialog = ({ open, onOpenChange, formId, slug }: ShareDialogProps) => {
  const { toast } = useToast();
  const [accessMode, setAccessMode] = useState<"public" | "email_required">("public");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && formId) {
      supabase
        .from("forms")
        .select("settings")
        .eq("id", formId)
        .maybeSingle()
        .then(({ data }) => {
          const settings = data?.settings as any;
          if (settings?.access_mode) setAccessMode(settings.access_mode);
        });
    }
  }, [open, formId]);

  const publicUrl = slug ? `${window.location.origin}/f/${slug}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleAccessMode = async (emailRequired: boolean) => {
    const newMode = emailRequired ? "email_required" : "public";
    setAccessMode(newMode);
    setSaving(true);

    const { data: form } = await supabase
      .from("forms")
      .select("settings")
      .eq("id", formId)
      .maybeSingle();

    const currentSettings = (form?.settings as any) || {};
    const { error } = await supabase
      .from("forms")
      .update({ settings: { ...currentSettings, access_mode: newMode } as any })
      .eq("id", formId);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar formulário</DialogTitle>
          <DialogDescription>Configure o acesso e copie o link público.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Access mode toggle */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Modo de acesso</Label>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">Público</p>
                <p className="text-xs text-muted-foreground">Qualquer pessoa com o link</p>
              </div>
              {accessMode === "public" && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </div>
            <div
              className="flex items-center gap-3 p-3 rounded-lg border bg-card cursor-pointer"
              onClick={() => toggleAccessMode(accessMode !== "email_required")}
            >
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">Requer e-mail</p>
                <p className="text-xs text-muted-foreground">Coleta o e-mail antes de iniciar</p>
              </div>
              <Switch
                checked={accessMode === "email_required"}
                onCheckedChange={(checked) => toggleAccessMode(checked)}
                disabled={saving}
              />
            </div>
          </div>

          {/* Copy link */}
          {slug && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Link do formulário</Label>
              <div className="flex gap-2">
                <Input value={publicUrl} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
