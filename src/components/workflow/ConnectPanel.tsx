import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plug, Trash2, Loader2, ExternalLink, Zap, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Integration {
  id: string;
  type: string;
  config: { url?: string; name?: string; enabled?: boolean } | null;
}

interface ConnectPanelProps {
  formId: string;
}

const CONNECTORS = [
  {
    type: "n8n",
    name: "n8n",
    icon: Zap,
    description: "Conecte seu workflow n8n",
    instructions: "No n8n, crie um workflow com trigger 'Webhook'. Copie a URL de produção e cole aqui.",
    placeholder: "https://seu-n8n.app/webhook/...",
  },
  {
    type: "zapier",
    name: "Zapier",
    icon: Zap,
    description: "Conecte com Zapier",
    instructions: "No Zapier, crie um Zap com trigger 'Webhooks by Zapier' → 'Catch Hook'. Cole a URL aqui.",
    placeholder: "https://hooks.zapier.com/hooks/catch/...",
  },
  {
    type: "webhook_custom",
    name: "Webhook Genérico",
    icon: Globe,
    description: "Qualquer serviço HTTP",
    instructions: "Cole a URL de qualquer endpoint HTTP POST que receberá os dados do formulário.",
    placeholder: "https://api.exemplo.com/webhook",
  },
];

export const ConnectPanel = ({ formId }: ConnectPanelProps) => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchIntegrations();
  }, [formId]);

  const fetchIntegrations = async () => {
    const { data } = await supabase
      .from("integrations")
      .select("id, type, config")
      .eq("form_id", formId)
      .in("type", ["n8n", "zapier", "webhook_custom"]);
    setIntegrations((data as Integration[] | null) || []);
    setLoading(false);
  };

  const getIntegration = (type: string) => integrations.find((i) => i.type === type);

  const saveConnector = async (type: string) => {
    const url = urls[type]?.trim();
    if (!url) return;
    setSaving(type);

    const existing = getIntegration(type);
    if (existing) {
      await supabase
        .from("integrations")
        .update({ config: { ...((existing.config as any) || {}), url, enabled: true } })
        .eq("id", existing.id);
    } else {
      await supabase.from("integrations").insert({
        form_id: formId,
        type,
        config: { url, enabled: true },
      });
    }

    await fetchIntegrations();
    setUrls((p) => ({ ...p, [type]: "" }));
    setSaving(null);
    toast({ title: "Conexão salva!" });
  };

  const removeConnector = async (id: string) => {
    await supabase.from("integrations").delete().eq("id", id);
    setIntegrations((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Conexão removida" });
  };

  const toggleConnector = async (integration: Integration, enabled: boolean) => {
    await supabase
      .from("integrations")
      .update({ config: { ...((integration.config as any) || {}), enabled } })
      .eq("id", integration.id);
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === integration.id ? { ...i, config: { ...(i.config || {}), enabled } } : i
      )
    );
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin mx-auto my-8" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Integrações</h3>
      </div>

      {CONNECTORS.map((conn) => {
        const integration = getIntegration(conn.type);
        const Icon = conn.icon;
        const isConnected = !!integration;

        return (
          <div key={conn.type} className="border rounded-lg overflow-hidden">
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold flex-1">{conn.name}</span>
                {isConnected && (
                  <Badge variant="default" className="text-[10px]">
                    Conectado
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{conn.description}</p>

              {isConnected ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={(integration.config as any)?.enabled !== false}
                      onCheckedChange={(v) => toggleConnector(integration, v)}
                    />
                    <code className="text-[10px] truncate flex-1 bg-muted px-2 py-1 rounded">
                      {(integration.config as any)?.url}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeConnector(integration.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground italic">{conn.instructions}</p>
                  <Input
                    className="h-7 text-xs"
                    placeholder={conn.placeholder}
                    value={urls[conn.type] || ""}
                    onChange={(e) => setUrls((p) => ({ ...p, [conn.type]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && saveConnector(conn.type)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-7"
                    onClick={() => saveConnector(conn.type)}
                    disabled={saving === conn.type}
                  >
                    {saving === conn.type ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Conectar
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
