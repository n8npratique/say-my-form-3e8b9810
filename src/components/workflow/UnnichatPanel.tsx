import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  User, Hash, Tag, Briefcase, Plus, Trash2, RefreshCw, Loader2,
  AlertTriangle, CheckCircle2, Play, Unlink
} from "lucide-react";
import type { FormField, ScoringConfig, TaggingConfig, OutcomesConfig } from "@/types/workflow";
import { expandFieldOptions } from "@/lib/fieldUtils";

interface UnnichatConfig {
  enabled: boolean;
  phone_id: string; // ID do telefone Unnichat selecionado para este form
  // Section 1 - Contact
  create_contact: boolean;
  contact_name_field_id: string;
  contact_phone_field_id: string;
  contact_email_field_id: string;
  // Section 2 - Custom fields
  send_custom_fields: boolean;
  custom_field_mappings: Array<{ form_field_id: string; unnichat_field_id: string }>;
  // Section 3 - Tags
  add_tags: boolean;
  fixed_tags: string[];
  conditional_tags: Array<{
    condition_type: "outcome" | "score_range" | "form_tag";
    condition_value: string;
    unnichat_tag_id: string;
  }>;
  // Section 4 - CRM
  create_deal: boolean;
  pipeline_id: string;
  column_id: string;
  deal_value_field_id: string; // form field id or empty for fixed
  deal_value_fixed: number;
}

const DEFAULT_CONFIG: UnnichatConfig = {
  enabled: false,
  phone_id: "",
  create_contact: false,
  contact_name_field_id: "",
  contact_phone_field_id: "",
  contact_email_field_id: "",
  send_custom_fields: false,
  custom_field_mappings: [],
  add_tags: false,
  fixed_tags: [],
  conditional_tags: [],
  create_deal: false,
  pipeline_id: "",
  column_id: "",
  deal_value_field_id: "",
  deal_value_fixed: 0,
};

interface UnnichatField {
  id: string;
  name: string;
}

interface UnnichatTag {
  id: string;
  name: string;
}

interface UnnichatPanelProps {
  formId: string;
  fields: FormField[];
  scoring: ScoringConfig | null;
  tagging: TaggingConfig | null;
  outcomes: OutcomesConfig | null;
}

export const UnnichatPanel = ({ formId, fields, scoring, tagging, outcomes }: UnnichatPanelProps) => {
  const { toast } = useToast();

  const [config, setConfig] = useState<UnnichatConfig>(DEFAULT_CONFIG);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [workspaceConfig, setWorkspaceConfig] = useState<{ url: string; phones: Array<{ label: string; phone_id: string; token: string }> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [unnichatFields, setUnnichatFields] = useState<UnnichatField[]>([]);
  const [unnichatTags, setUnnichatTags] = useState<UnnichatTag[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);

  // Load integration config and workspace settings
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
      .eq("type", "unnichat")
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
        if (s?.unnichat?.url && s?.unnichat?.phones?.length) {
          setWorkspaceConfig({ url: s.unnichat.url, phones: s.unnichat.phones });
        } else if (s?.unnichat?.url && s?.unnichat?.token) {
          // backwards compat: legacy single token
          setWorkspaceConfig({ url: s.unnichat.url, phones: [{ label: "Principal", phone_id: "", token: s.unnichat.token }] });
        }
      }
    }
  };

  const update = (partial: Partial<UnnichatConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  // Resolve the active phone's token based on selected phone_id
  const activePhone = workspaceConfig?.phones.find(p => p.phone_id === config.phone_id) || workspaceConfig?.phones[0];
  const activeToken = activePhone?.token || "";

  const loadUnnichatFields = async () => {
    if (!workspaceConfig || !activeToken) return;
    setLoadingFields(true);
    try {
      const res = await fetch(`${workspaceConfig.url}/customFields/search`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${activeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      const list = json?.data ?? json?.customFields ?? [];
      setUnnichatFields(list.map((f: any) => ({ id: f.id, name: f.name || f.title || f.id })));
      toast({ title: `${list.length} campos carregados` });
    } catch {
      toast({ title: "Erro ao carregar campos", variant: "destructive" });
    } finally {
      setLoadingFields(false);
    }
  };

  const loadUnnichatTags = async () => {
    if (!workspaceConfig || !activeToken) return;
    setLoadingTags(true);
    try {
      const res = await fetch(`${workspaceConfig.url}/tags/search`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${activeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "contact" }),
      });
      const json = await res.json();
      const list = json?.data ?? json?.tags ?? [];
      setUnnichatTags(list.map((t: any) => ({ id: t.id, name: t.name || t.title || t.id })));
      toast({ title: `${list.length} tags carregadas` });
    } catch {
      toast({ title: "Erro ao carregar tags", variant: "destructive" });
    } finally {
      setLoadingTags(false);
    }
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
          .insert({ form_id: formId, type: "unnichat", config: config as any })
          .select()
          .single();
        if (data) setIntegrationId(data.id);
      }
      toast({ title: "Configuração salva com sucesso!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const testIntegration = async () => {
    setTesting(true);
    try {
      // Get last completed response
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

      const { error } = await supabase.functions.invoke("sync-unnichat", {
        body: { form_id: formId, response_id: resp.id },
      });

      if (error) throw error;
      toast({ title: "Teste executado com sucesso!", description: "Verifique o Unnichat para confirmar." });
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
  const allOptions = expandFieldOptions(fields, "all");
  const nameOptions = expandFieldOptions(fields, "name");
  const phoneOptions = expandFieldOptions(fields, "phone");
  const emailOptions = expandFieldOptions(fields, "email");
  const numberFields = fields.filter((f) => f.type === "number");

  // Conditional tag options
  const conditionOptions: { type: "outcome" | "score_range" | "form_tag"; value: string; label: string }[] = [
    ...(outcomes?.enabled ? outcomes.definitions.map((d) => ({ type: "outcome" as const, value: d.label, label: `Outcome: ${d.label}` })) : []),
    ...(scoring?.enabled ? scoring.ranges.map((r) => ({ type: "score_range" as const, value: r.label || `${r.min}-${r.max}`, label: `Faixa: ${r.label || `${r.min}-${r.max}`}` })) : []),
    ...(tagging?.enabled ? tagging.tags.map((t) => ({ type: "form_tag" as const, value: t, label: `Tag: ${t}` })) : []),
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      {!workspaceConfig ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <p className="text-xs text-warning">
            Configure a URL e os telefones do Unnichat nas <strong>Configurações do Workspace</strong> antes de continuar.
          </p>
        </div>
      ) : (
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
      )}

      {config.enabled && workspaceConfig && (
        <>
        {/* Phone selector */}
        {workspaceConfig.phones.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Telefone Unnichat</Label>
            <Select
              value={config.phone_id || workspaceConfig.phones[0]?.phone_id || ""}
              onValueChange={(v) => update({ phone_id: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar telefone..." />
              </SelectTrigger>
              <SelectContent>
                {workspaceConfig.phones.map((p) => (
                  <SelectItem key={p.phone_id} value={p.phone_id}>
                    {p.label || p.phone_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cada formulário pode usar um telefone diferente do Unnichat.
            </p>
          </div>
        )}

        <Accordion type="multiple" className="space-y-2">
          {/* Section 1 — Create Contact */}
          <AccordionItem value="contact" className="border rounded-lg px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-primary" />
                Criar contato
                {config.create_contact && <Badge className="text-[10px] h-4 px-1.5 ml-1">Ativo</Badge>}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.create_contact}
                  onCheckedChange={(v) => update({ create_contact: v })}
                />
                <Label className="text-xs">Criar contato automaticamente</Label>
              </div>
              {config.create_contact && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Campo do nome</Label>
                    <Select value={config.contact_name_field_id} onValueChange={(v) => update({ contact_name_field_id: v })}>
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
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Campo do telefone</Label>
                    <Select value={config.contact_phone_field_id} onValueChange={(v) => update({ contact_phone_field_id: v })}>
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
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Campo do email <span className="font-normal">(opcional)</span></Label>
                    <Select value={config.contact_email_field_id || "__none__"} onValueChange={(v) => update({ contact_email_field_id: v === "__none__" ? "" : v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum</SelectItem>
                        {emailOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Section 2 — Custom Fields */}
          <AccordionItem value="fields" className="border rounded-lg px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Hash className="h-4 w-4 text-primary" />
                Campos personalizados
                {config.send_custom_fields && (
                  <Badge className="text-[10px] h-4 px-1.5 ml-1">{config.custom_field_mappings.length}</Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.send_custom_fields}
                  onCheckedChange={(v) => update({ send_custom_fields: v })}
                />
                <Label className="text-xs">Enviar campos personalizados</Label>
              </div>
              {config.send_custom_fields && (
                <div className="space-y-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs gap-1"
                    onClick={loadUnnichatFields}
                    disabled={loadingFields}
                  >
                    {loadingFields ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Carregar campos do Unnichat
                  </Button>

                  {config.custom_field_mappings.map((m, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Select
                        value={m.form_field_id}
                        onValueChange={(v) => {
                          const mappings = [...config.custom_field_mappings];
                          mappings[i] = { ...m, form_field_id: v };
                          update({ custom_field_mappings: mappings });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Campo do form" />
                        </SelectTrigger>
                        <SelectContent>
                          {allOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground text-xs">→</span>
                      <Select
                        value={m.unnichat_field_id}
                        onValueChange={(v) => {
                          const mappings = [...config.custom_field_mappings];
                          mappings[i] = { ...m, unnichat_field_id: v };
                          update({ custom_field_mappings: mappings });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Campo Unnichat" />
                        </SelectTrigger>
                        <SelectContent>
                          {unnichatFields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => {
                          const mappings = config.custom_field_mappings.filter((_, idx) => idx !== i);
                          update({ custom_field_mappings: mappings });
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs gap-1"
                    onClick={() => update({
                      custom_field_mappings: [...config.custom_field_mappings, { form_field_id: "", unnichat_field_id: "" }]
                    })}
                  >
                    <Plus className="h-3 w-3" /> Adicionar mapeamento
                  </Button>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Section 3 — Tags */}
          <AccordionItem value="tags" className="border rounded-lg px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Tag className="h-4 w-4 text-primary" />
                Tags
                {config.add_tags && (
                  <Badge className="text-[10px] h-4 px-1.5 ml-1">
                    {config.fixed_tags.length + config.conditional_tags.length}
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.add_tags}
                  onCheckedChange={(v) => update({ add_tags: v })}
                />
                <Label className="text-xs">Adicionar tags</Label>
              </div>
              {config.add_tags && (
                <div className="space-y-3 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs gap-1"
                    onClick={loadUnnichatTags}
                    disabled={loadingTags}
                  >
                    {loadingTags ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Carregar tags do Unnichat
                  </Button>

                  {/* Fixed tags */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase">Tags fixas</Label>
                    {config.fixed_tags.map((tagId, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Select
                          value={tagId}
                          onValueChange={(v) => {
                            const tags = [...config.fixed_tags];
                            tags[i] = v;
                            update({ fixed_tags: tags });
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs flex-1">
                            <SelectValue placeholder="Selecionar tag..." />
                          </SelectTrigger>
                          <SelectContent>
                            {unnichatTags.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => update({ fixed_tags: config.fixed_tags.filter((_, idx) => idx !== i) })}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs gap-1"
                      onClick={() => update({ fixed_tags: [...config.fixed_tags, ""] })}
                    >
                      <Plus className="h-3 w-3" /> Adicionar tag fixa
                    </Button>
                  </div>

                  {/* Conditional tags */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase">Tags condicionais</Label>
                    {config.conditional_tags.map((ct, i) => (
                      <div key={i} className="border rounded p-2 space-y-1.5">
                        <div className="flex items-center gap-1">
                          <Select
                            value={ct.condition_type === "outcome" ? `outcome:${ct.condition_value}` : ct.condition_type === "score_range" ? `score_range:${ct.condition_value}` : `form_tag:${ct.condition_value}`}
                            onValueChange={(v) => {
                              const [type, ...rest] = v.split(":");
                              const value = rest.join(":");
                              const tags = [...config.conditional_tags];
                              tags[i] = { ...ct, condition_type: type as any, condition_value: value };
                              update({ conditional_tags: tags });
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue placeholder="Condição..." />
                            </SelectTrigger>
                            <SelectContent>
                              {conditionOptions.map((opt) => (
                                <SelectItem key={`${opt.type}:${opt.value}`} value={`${opt.type}:${opt.value}`}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => update({ conditional_tags: config.conditional_tags.filter((_, idx) => idx !== i) })}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                        <Select
                          value={ct.unnichat_tag_id}
                          onValueChange={(v) => {
                            const tags = [...config.conditional_tags];
                            tags[i] = { ...ct, unnichat_tag_id: v };
                            update({ conditional_tags: tags });
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Tag Unnichat a adicionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            {unnichatTags.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs gap-1"
                      onClick={() => update({
                        conditional_tags: [...config.conditional_tags, { condition_type: "outcome", condition_value: "", unnichat_tag_id: "" }]
                      })}
                    >
                      <Plus className="h-3 w-3" /> Adicionar regra condicional
                    </Button>
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Section 4 — CRM Deal */}
          <AccordionItem value="crm" className="border rounded-lg px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Briefcase className="h-4 w-4 text-primary" />
                CRM / Pipeline
                {config.create_deal && <Badge className="text-[10px] h-4 px-1.5 ml-1">Ativo</Badge>}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.create_deal}
                  onCheckedChange={(v) => update({ create_deal: v })}
                />
                <Label className="text-xs">Criar negócio no pipeline</Label>
              </div>
              {config.create_deal && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Pipeline ID</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="uuid do pipeline..."
                      value={config.pipeline_id}
                      onChange={(e) => update({ pipeline_id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Coluna ID (etapa inicial)</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="uuid da coluna..."
                      value={config.column_id}
                      onChange={(e) => update({ column_id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Campo do valor (número) — ou valor fixo</Label>
                    <div className="flex gap-1.5">
                      <Select value={config.deal_value_field_id || "__fixed__"} onValueChange={(v) => update({ deal_value_field_id: v === "__fixed__" ? "" : v })}>
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__fixed__">Valor fixo</SelectItem>
                          {numberFields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>{f.label || f.type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!config.deal_value_field_id && (
                        <Input
                          type="number"
                          className="h-8 text-xs w-24"
                          placeholder="0"
                          value={config.deal_value_fixed}
                          onChange={(e) => update({ deal_value_fixed: Number(e.target.value) })}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        </>
      )}

      {/* Footer actions */}
      <div className="flex flex-col gap-2 pt-2 border-t">
        <Button size="sm" className="w-full gap-1 h-8" onClick={save} disabled={saving || !workspaceConfig}>
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
