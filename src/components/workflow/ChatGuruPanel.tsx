import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, Loader2, Play, Unlink } from "lucide-react";
import type { FormField } from "@/types/workflow";
import { expandFieldOptions } from "@/lib/fieldUtils";

interface ChatGuruConfig {
  enabled: boolean;
  phone_id: string;
  dialog_id: string;
  text: string;
  chat_number_field_id: string;
  name_field_id: string;
}

const DEFAULT_CONFIG: ChatGuruConfig = {
  enabled: false,
  phone_id: "",
  dialog_id: "",
  text: " ",
  chat_number_field_id: "",
  name_field_id: "",
};

interface ChatGuruPhone {
  telefone: string;
  phone_id: string;
}

interface ChatGuruPanelProps {
  formId: string;
  fields: FormField[];
}

export const ChatGuruPanel = ({ formId, fields }: ChatGuruPanelProps) => {
  const { toast } = useToast();

  const [config, setConfig] = useState<ChatGuruConfig>(DEFAULT_CONFIG);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [workspacePhones, setWorkspacePhones] = useState<ChatGuruPhone[]>([]);
  const [workspaceConfigured, setWorkspaceConfigured] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!formId) return;
    loadData();
  }, [formId]);

  const loadData = async () => {
    // Load integration
    const { data: integ } = await supabase
      .from("integrations")
      .select("*")
      .eq("form_id", formId)
      .eq("type", "chatguru")
      .maybeSingle();

    if (integ) {
      setIntegrationId(integ.id);
      const cfg = integ.config as any;
      setConfig({ ...DEFAULT_CONFIG, ...cfg });
    }

    // Load workspace settings
    const { data: form } = await supabase
      .from("forms")
      .select("workspace_id")
      .eq("id", formId)
      .maybeSingle();

    if (form) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("settings")
        .eq("id", form.workspace_id)
        .maybeSingle();

      if (ws) {
        const s = ws.settings as any;
        if (s?.chatguru?.key && s?.chatguru?.account_id) {
          setWorkspaceConfigured(true);
          setWorkspacePhones(s.chatguru.phones ?? []);
        } else {
          setWorkspaceConfigured(false);
        }
      } else {
        setWorkspaceConfigured(false);
      }
    }
  };

  const update = (partial: Partial<ChatGuruConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (integrationId) {
        await supabase
          .from("integrations")
          .update({ config: config as any })
          .eq("id", integrationId);
      } else {
        const { data } = await supabase
          .from("integrations")
          .insert({ form_id: formId, type: "chatguru", config: config as any })
          .select()
          .single();
        if (data) setIntegrationId(data.id);
      }
      toast({ title: "Configuração ChatGuru salva!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const testIntegration = async () => {
    setTesting(true);
    try {
      const { data: resp } = await supabase
        .from("responses")
        .select("id")
        .eq("form_id", formId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!resp) {
        toast({ title: "Nenhuma resposta completada encontrada", variant: "destructive" });
        return;
      }

      const { error } = await supabase.functions.invoke("sync-chatguru", {
        body: { form_id: formId, response_id: resp.id },
      });

      if (error) throw error;
      toast({ title: "Teste executado!", description: "Verifique o ChatGuru para confirmar." });
    } catch (e: any) {
      toast({ title: "Erro no teste", description: e?.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const removeIntegration = async () => {
    if (!integrationId) return;
    await supabase.from("integrations").delete().eq("id", integrationId);
    setIntegrationId(null);
    setConfig(DEFAULT_CONFIG);
    toast({ title: "Integração removida" });
  };

  // Field helpers
  const phoneOptions = expandFieldOptions(fields, "phone");
  const nameOptions = expandFieldOptions(fields, "name");

  return (
    <div className="space-y-4">
      {/* Header */}
      {workspaceConfigured === false ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <p className="text-xs text-warning">
            Configure a API Key e Account ID do ChatGuru nas <strong>Configurações do Workspace</strong> antes de continuar.
          </p>
        </div>
      ) : workspaceConfigured === true ? (
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="gap-1 text-xs border-success/50 text-success">
            <CheckCircle2 className="h-3 w-3" /> Conectado
          </Badge>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Ativar integração</Label>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
            />
          </div>
        </div>
      ) : null}

      {config.enabled && workspaceConfigured && (
        <div className="space-y-3">
          {/* Phone ID dropdown */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Telefone (phone_id)</Label>
            {workspacePhones.length > 0 ? (
              <Select value={config.phone_id} onValueChange={(v) => update({ phone_id: v })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar telefone..." />
                </SelectTrigger>
                <SelectContent>
                  {workspacePhones.map((p) => (
                    <SelectItem key={p.phone_id} value={p.phone_id}>
                      {p.telefone || p.phone_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum telefone cadastrado. Adicione nas Configurações do Workspace.
              </p>
            )}
          </div>

          {/* Dialog ID */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Dialog ID</Label>
            <Input
              className="h-8 text-xs"
              placeholder="ID do diálogo no ChatGuru..."
              value={config.dialog_id}
              onChange={(e) => update({ dialog_id: e.target.value })}
            />
          </div>

          {/* Text */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Texto inicial</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Mensagem (deixe espaço para vazio)"
              value={config.text}
              onChange={(e) => update({ text: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground">
              Texto enviado ao iniciar o diálogo. Use um espaço &quot; &quot; para vazio.
            </p>
          </div>

          {/* Phone field mapping */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Campo de telefone do respondente</Label>
            <Select value={config.chat_number_field_id} onValueChange={(v) => update({ chat_number_field_id: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar campo..." />
              </SelectTrigger>
              <SelectContent>
                {phoneOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name field mapping */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Campo de nome do respondente</Label>
            <Select value={config.name_field_id} onValueChange={(v) => update({ name_field_id: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar campo..." />
              </SelectTrigger>
              <SelectContent>
                {nameOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex flex-col gap-2 pt-2 border-t">
        <Button size="sm" className="w-full gap-1 h-8" onClick={save} disabled={saving || !workspaceConfigured}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Salvar configuração
        </Button>
        {integrationId && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1 h-8 text-xs"
              onClick={testIntegration}
              disabled={testing}
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Testar com última resposta
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1 h-8 text-xs text-destructive hover:text-destructive"
              onClick={removeIntegration}
            >
              <Unlink className="h-3.5 w-3.5" /> Remover integração
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
