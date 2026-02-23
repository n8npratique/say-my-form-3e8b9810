import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Webhook, Loader2, Copy, Check, Play, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface WebhookRow {
  id: string;
  url: string;
  is_enabled: boolean;
  secret: string | null;
  events: string[];
}

interface WebhookManagerProps {
  formId: string;
}

const AVAILABLE_EVENTS = [
  { value: "response.completed", label: "Resposta completa" },
  { value: "response.started", label: "Resposta iniciada" },
];

export const WebhookManager = ({ formId }: WebhookManagerProps) => {
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchWebhooks();
  }, [formId]);

  const fetchWebhooks = async () => {
    const { data } = await supabase
      .from("webhooks")
      .select("id, url, is_enabled, secret, events")
      .eq("form_id", formId);
    setWebhooks(
      (data || []).map((w) => ({
        ...w,
        events: Array.isArray(w.events) ? (w.events as string[]) : ["response.completed"],
      }))
    );
    setLoading(false);
  };

  const addWebhook = async () => {
    if (!newUrl.trim()) return;
    const secret = crypto.randomUUID();
    const { error } = await supabase.from("webhooks").insert({
      form_id: formId,
      url: newUrl.trim(),
      secret,
      events: ["response.completed"],
    });
    if (error) {
      toast({ title: "Erro ao adicionar webhook", variant: "destructive" });
    } else {
      setNewUrl("");
      setNewLabel("");
      fetchWebhooks();
    }
  };

  const toggleWebhook = async (id: string, enabled: boolean) => {
    await supabase.from("webhooks").update({ is_enabled: enabled }).eq("id", id);
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, is_enabled: enabled } : w)));
  };

  const toggleEvent = async (id: string, event: string) => {
    const wh = webhooks.find((w) => w.id === id);
    if (!wh) return;
    const events = wh.events.includes(event)
      ? wh.events.filter((e) => e !== event)
      : [...wh.events, event];
    if (events.length === 0) return;
    await supabase.from("webhooks").update({ events }).eq("id", id);
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, events } : w)));
  };

  const deleteWebhook = async (id: string) => {
    await supabase.from("webhooks").delete().eq("id", id);
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  const copySecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedId(id);
    toast({ title: "Secret copiado!" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const testWebhook = async (wh: WebhookRow) => {
    setTestingId(wh.id);
    try {
      await fetch(wh.url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "test",
          form_id: formId,
          timestamp: new Date().toISOString(),
          data: {
            response_id: "test-000",
            answers: { example_field: "Valor de teste" },
          },
        }),
      });
      toast({ title: "Teste enviado!", description: "Verifique o recebimento no destino." });
    } catch {
      toast({ title: "Erro ao testar", variant: "destructive" });
    }
    setTestingId(null);
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin mx-auto my-8" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Webhook className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Webhooks</h3>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 flex gap-2 items-start">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Compatível com <strong>n8n</strong>, <strong>Zapier</strong>, <strong>Make</strong> e qualquer serviço que aceite webhooks HTTP POST. Cole a URL do webhook aqui.
        </p>
      </div>

      {webhooks.map((wh) => (
        <Collapsible key={wh.id}>
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 p-2">
              <Switch checked={wh.is_enabled} onCheckedChange={(v) => toggleWebhook(wh.id, v)} />
              <CollapsibleTrigger asChild>
                <button className="text-xs flex-1 truncate font-mono text-left hover:underline">
                  {wh.url}
                </button>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => testWebhook(wh)}
                disabled={testingId === wh.id}
                title="Testar webhook"
              >
                {testingId === wh.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3 text-primary" />
                )}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteWebhook(wh.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>

            <CollapsibleContent>
              <div className="border-t p-3 space-y-3 bg-muted/20">
                {/* Events */}
                <div>
                  <span className="text-xs font-medium text-muted-foreground mb-1 block">Eventos</span>
                  <div className="flex flex-wrap gap-1">
                    {AVAILABLE_EVENTS.map((ev) => (
                      <Badge
                        key={ev.value}
                        variant={wh.events.includes(ev.value) ? "default" : "outline"}
                        className="cursor-pointer text-[10px]"
                        onClick={() => toggleEvent(wh.id, ev.value)}
                      >
                        {ev.label}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Secret */}
                {wh.secret && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground mb-1 block">
                      Secret (HMAC)
                    </span>
                    <div className="flex gap-1 items-center">
                      <code className="text-[10px] bg-muted px-2 py-1 rounded flex-1 truncate">
                        {wh.secret}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copySecret(wh.id, wh.secret!)}
                      >
                        {copiedId === wh.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}

      <div className="space-y-2">
        <Input
          className="h-8 text-xs"
          placeholder="https://seu-n8n.app/webhook/..."
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addWebhook()}
        />
        <Button variant="outline" size="sm" className="w-full" onClick={addWebhook}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar Webhook
        </Button>
      </div>
    </div>
  );
};
