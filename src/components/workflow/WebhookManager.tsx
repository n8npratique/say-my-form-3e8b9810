import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Webhook, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WebhookRow {
  id: string;
  url: string;
  is_enabled: boolean;
  secret: string | null;
}

interface WebhookManagerProps {
  formId: string;
}

export const WebhookManager = ({ formId }: WebhookManagerProps) => {
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchWebhooks();
  }, [formId]);

  const fetchWebhooks = async () => {
    const { data } = await supabase
      .from("webhooks")
      .select("id, url, is_enabled, secret")
      .eq("form_id", formId);
    setWebhooks(data || []);
    setLoading(false);
  };

  const addWebhook = async () => {
    if (!newUrl.trim()) return;
    const secret = crypto.randomUUID();
    const { error } = await supabase.from("webhooks").insert({
      form_id: formId,
      url: newUrl.trim(),
      secret,
    });
    if (error) {
      toast({ title: "Erro ao adicionar webhook", variant: "destructive" });
    } else {
      setNewUrl("");
      fetchWebhooks();
    }
  };

  const toggleWebhook = async (id: string, enabled: boolean) => {
    await supabase.from("webhooks").update({ is_enabled: enabled }).eq("id", id);
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, is_enabled: enabled } : w)));
  };

  const deleteWebhook = async (id: string) => {
    await supabase.from("webhooks").delete().eq("id", id);
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin mx-auto my-8" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Webhook className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Webhooks</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Receba notificações HTTP quando um formulário for completado.
      </p>

      {webhooks.map((wh) => (
        <div key={wh.id} className="flex items-center gap-2 border rounded-lg p-2">
          <Switch checked={wh.is_enabled} onCheckedChange={(v) => toggleWebhook(wh.id, v)} />
          <span className="text-xs flex-1 truncate font-mono">{wh.url}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteWebhook(wh.id)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          className="h-8 text-xs flex-1"
          placeholder="https://exemplo.com/webhook"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addWebhook()}
        />
        <Button variant="outline" size="sm" onClick={addWebhook}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
