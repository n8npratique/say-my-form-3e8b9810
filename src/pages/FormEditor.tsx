import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, invokeEdgeFunction } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddFieldDialog } from "@/components/form-editor/AddFieldDialog";
import { FieldItem, type FormField } from "@/components/form-editor/FieldItem";
import { FieldConfigPanel } from "@/components/form-editor/FieldConfigPanel";
import { ShareDialog } from "@/components/form-editor/ShareDialog";
import { ThemePanel } from "@/components/form-editor/ThemePanel";
import { ArrowLeft, Plus, Save, Eye, Share2, Rocket, Plug, ClipboardList, Palette, Globe, Languages, Loader2, Clock, MoreHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import logoPratique from "@/assets/logo-pratique.png";
import type { FieldTranslation } from "@/types/workflow";
import type { FieldType } from "@/config/fieldTypes";
import type { FormTheme } from "@/lib/formTheme";
import { DEFAULT_THEME } from "@/lib/formTheme";
import type { Locale } from "@/lib/i18n";
import { LOCALE_OPTIONS, defaultTimezoneForLocale } from "@/lib/i18n";

const generateSlug = (name: string) => {
  const base = name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
};

// FormEditor v2
const FormEditor = () => {
  const { workspaceId, formId } = useParams<{ workspaceId: string; formId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"top" | "bottom" | null>(null);
  const [theme, setTheme] = useState<FormTheme>(DEFAULT_THEME);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  const [themeOpen, setThemeOpen] = useState(false);
  const [fieldTranslations, setFieldTranslations] = useState<Record<string, Record<string, FieldTranslation>>>({});
  const [translating, setTranslating] = useState(false);
  const [opensAt, setOpensAt] = useState<string>("");
  const [closesAt, setClosesAt] = useState<string>("");
  const selectedField = fields.find((f) => f.id === selectedId) || null;

  useEffect(() => {
    if (formId) fetchForm();
  }, [formId]);

  const fetchForm = async () => {
    const { data: form } = await supabase
      .from("forms")
      .select("name, slug")
      .eq("id", formId!)
      .maybeSingle();
    if (form) {
      setFormName(form.name);
      setSlug(form.slug || null);
    }
    // Load deadline from settings
    const { data: formSettings } = await supabase
      .from("forms")
      .select("settings")
      .eq("id", formId!)
      .maybeSingle();
    const settings = (formSettings?.settings as any) || {};
    if (settings.opens_at) setOpensAt(settings.opens_at);
    if (settings.closes_at) setClosesAt(settings.closes_at);

    const { data: version } = await supabase
      .from("form_versions")
      .select("*")
      .eq("form_id", formId!)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (version) {
      setVersionId(version.id);
      const schema = version.schema as any;
      if (schema?.fields && Array.isArray(schema.fields)) {
        setFields(schema.fields);
        if (schema.fields.length > 0) setSelectedId(schema.fields[0].id);
      }
      if (schema?.theme) setTheme(schema.theme);
      if (schema?.locale) setLocale(schema.locale);
      if (schema?.field_translations) setFieldTranslations(schema.field_translations);
    }
  };

  const addField = useCallback((type: FieldType) => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: "",
      required: false,
      options: ["multiple_choice", "dropdown", "image_choice", "checkbox", "ranking"].includes(type)
        ? ["Opção 1", "Opção 2"]
        : undefined,
      contact_fields: type === "contact_info" ? ["first_name", "last_name", "email", "phone"] : undefined,
    };
    setFields((prev) => [...prev, newField]);
    setSelectedId(newField.id);
  }, []);

  const updateField = useCallback((updated: FormField) => {
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, []);

  const duplicateField = useCallback((id: string) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const original = prev[idx];
      const clone: FormField = {
        ...original,
        id: crypto.randomUUID(),
        label: `${original.label} (cópia)`,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      setSelectedId(clone.id);
      return next;
    });
  }, []);

  const [deletedField, setDeletedField] = useState<{ field: FormField; index: number } | null>(null);

  const deleteField = useCallback((id: string) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx >= 0) {
        setDeletedField({ field: prev[idx], index: idx });
      }
      return prev.filter((f) => f.id !== id);
    });
    setSelectedId((prev) => (prev === id ? null : prev));
    // Show undo toast
    toast({
      title: "Campo excluído",
      description: "Clique em Desfazer para restaurar.",
      action: (
        <ToastAction
          altText="Desfazer exclusão"
          onClick={() => {
            setDeletedField((prev) => {
              if (prev) {
                setFields((fields) => {
                  const copy = [...fields];
                  copy.splice(Math.min(prev.index, copy.length), 0, prev.field);
                  return copy;
                });
                setSelectedId(prev.field.id);
              }
              return null;
            });
          }}
        >
          Desfazer
        </ToastAction>
      ),
    });
  }, [toast]);

  const saveSchema = async () => {
    if (!versionId) return;
    setSaving(true);

    // Merge with existing schema to preserve workflow data
    const { data: current } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("id", versionId)
      .maybeSingle();

    const existingSchema = (current?.schema as any) || {};
    const mergedSchema = { ...existingSchema, fields, theme, locale, field_translations: fieldTranslations };

    const { error } = await supabase
      .from("form_versions")
      .update({ schema: mergedSchema as any })
      .eq("id", versionId);

    // Also save deadline settings to forms.settings
    if (formId) {
      const { data: formData } = await supabase
        .from("forms")
        .select("settings")
        .eq("id", formId)
        .maybeSingle();
      const currentSettings = (formData?.settings as any) || {};
      currentSettings.opens_at = opensAt || null;
      currentSettings.closes_at = closesAt || null;
      await supabase.from("forms").update({ settings: currentSettings as any }).eq("id", formId);
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Salvo com sucesso!" });
    }
    setSaving(false);
  };

  const publishForm = async () => {
    if (!versionId || !formId) return;

    // Validate: appointment field requires an email field
    const hasAppointment = fields.some((f: any) => f.type === "appointment");
    const hasEmailField = fields.some((f: any) => {
      const ft = (f.type || "").toLowerCase();
      return ft === "email" || ft === "email_input" || ft === "contact_info";
    });
    if (hasAppointment && !hasEmailField) {
      toast({
        title: "Campo de e-mail obrigatório",
        description: "Formulários com agendamento precisam de um campo de e-mail para enviar a confirmação e link de cancelamento ao respondente.",
        variant: "destructive",
      });
      return;
    }

    setPublishing(true);

    // Save schema first (merge with existing to preserve workflow data)
    const { data: currentVersion } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("id", versionId)
      .maybeSingle();

    const existingSchema = (currentVersion?.schema as any) || {};

    await supabase
      .from("form_versions")
      .update({ schema: { ...existingSchema, fields, theme, locale, field_translations: fieldTranslations } as any })
      .eq("id", versionId);

    // Generate slug if needed
    let currentSlug = slug;
    if (!currentSlug) {
      currentSlug = generateSlug(formName);
      // Check uniqueness
      const { data: existing } = await supabase
        .from("forms")
        .select("id")
        .eq("slug", currentSlug)
        .maybeSingle();
      if (existing) {
        currentSlug = generateSlug(formName); // retry with new random
      }
    }

    // Update form
    const { data: currentForm } = await supabase
      .from("forms")
      .select("settings")
      .eq("id", formId)
      .maybeSingle();

    const currentSettings = (currentForm?.settings as any) || {};
    if (!currentSettings.access_mode) {
      currentSettings.access_mode = "public";
    }
    // Save deadline settings
    currentSettings.opens_at = opensAt || null;
    currentSettings.closes_at = closesAt || null;

    const { error } = await supabase
      .from("forms")
      .update({
        status: "published",
        slug: currentSlug,
        published_version_id: versionId,
        settings: currentSettings as any,
      })
      .eq("id", formId);

    if (error) {
      toast({ title: "Erro ao publicar", description: error.message, variant: "destructive" });
    } else {
      setSlug(currentSlug);
      toast({ title: "Publicado com sucesso!" });
      setShareOpen(true);
    }
    setPublishing(false);
  };

  const handlePreview = () => {
    window.open(`/form/${formId}/preview`, "_blank");
  };

  const translateWithAI = async () => {
    if (locale === "pt-BR" || fields.length === 0) return;
    setTranslating(true);
    try {
      const payload = {
        fields: fields
          .filter((f) => f.type !== "end_screen" && f.type !== "welcome_screen")
          .map((f) => ({
            id: f.id,
            label: f.label,
            placeholder: f.placeholder,
            options: f.options,
          })),
        source_locale: "pt-BR",
        target_locale: locale,
      };

      const { data, error } = await invokeEdgeFunction("translate-form", payload);

      if (error || !data?.translations) {
        toast({ title: "Erro na tradução", description: error?.message || "Sem resposta da IA", variant: "destructive" });
        return;
      }

      setFieldTranslations((prev) => ({
        ...prev,
        [locale]: data.translations,
      }));
      toast({ title: "Traduzido!", description: `Campos traduzidos para ${LOCALE_OPTIONS.find((o) => o.value === locale)?.label || locale}. Salve para persistir.` });
    } catch (err: any) {
      toast({ title: "Erro na tradução", description: err.message, variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm h-14 flex items-center px-4 gap-3 shrink-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/workspace/${workspaceId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 hover:opacity-80 transition">
          <img src={logoPratique} alt="TecForms" className="h-6 w-6 rounded-full" />
          <span className="font-display font-bold text-sm gradient-text">TecForms</span>
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-sm truncate max-w-[200px]">{formName}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/workspace/${workspaceId}/form/${formId}/responses`)}
          >
            <ClipboardList className="h-4 w-4 mr-1" /> Respostas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/workspace/${workspaceId}/form/${formId}/workflow`)}
          >
            <Plug className="h-4 w-4 mr-1" /> Integrações
          </Button>
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Eye className="h-4 w-4 mr-1" /> Preview
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setThemeOpen(true)}>
                <Palette className="h-4 w-4 mr-2" />
                Aparência
                <span className="ml-auto flex gap-0.5">
                  <span className="w-2.5 h-2.5 rounded-full border border-border" style={{ background: theme.background_color }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.button_color }} />
                </span>
              </DropdownMenuItem>
              {slug && (
                <DropdownMenuItem onClick={() => setShareOpen(true)}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Compartilhar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Idioma
                </p>
                <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="mr-1.5">{opt.flag}</span>{opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {locale !== "pt-BR" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-1.5"
                    onClick={translateWithAI}
                    disabled={translating || fields.length === 0}
                  >
                    {translating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Languages className="h-4 w-4 mr-1" />}
                    {translating ? "Traduzindo..." : "Traduzir com IA"}
                  </Button>
                )}
              </div>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Prazo
                  {(opensAt || closesAt) && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                </p>
                <div className="space-y-1.5">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Abre em</Label>
                    <Input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="h-7 text-xs" />
                    {opensAt && (
                      <button onClick={() => setOpensAt("")} className="text-[10px] text-muted-foreground hover:text-destructive">Limpar</button>
                    )}
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Fecha em</Label>
                    <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="h-7 text-xs" />
                    {closesAt && (
                      <button onClick={() => setClosesAt("")} className="text-[10px] text-muted-foreground hover:text-destructive">Limpar</button>
                    )}
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={publishForm}
            disabled={publishing}
          >
            <Rocket className="h-4 w-4 mr-1" /> {publishing ? "Publicando..." : "Publicar"}
          </Button>
          <Button
            size="sm"
            className="gradient-primary text-primary-foreground"
            onClick={saveSchema}
            disabled={saving}
          >
            <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: field list */}
        <div style={{ width: 340, minWidth: 340, flexShrink: 0 }} className="border-r flex flex-col bg-card/30 overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-display font-semibold text-sm">Campos ({fields.length})</h2>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-2">
              {fields.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Plus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Nenhum campo adicionado.</p>
                  <Button variant="link" size="sm" className="mt-2" onClick={() => setDialogOpen(true)}>
                    Adicionar primeiro campo
                  </Button>
                </div>
              ) : (
                fields.map((field, i) => (
                  <FieldItem
                    key={field.id}
                    field={field}
                    index={i}
                    selected={selectedId === field.id}
                    onClick={() => setSelectedId(field.id)}
                    onDelete={() => deleteField(field.id)}
                    onDuplicate={() => duplicateField(field.id)}
                    draggable
                    onDragStart={(e) => {
                      dragIndexRef.current = i;
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const mid = rect.top + rect.height / 2;
                      setDragOverIndex(i);
                      setDragOverPosition(e.clientY < mid ? "top" : "bottom");
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragIndexRef.current;
                      if (from == null || from === i) return;
                      setFields((prev) => {
                        const copy = [...prev];
                        const [moved] = copy.splice(from, 1);
                        const to = e.clientY < (e.currentTarget as HTMLElement).getBoundingClientRect().top + (e.currentTarget as HTMLElement).getBoundingClientRect().height / 2
                          ? (from < i ? i - 1 : i)
                          : (from < i ? i : i + 1);
                        copy.splice(to, 0, moved);
                        return copy;
                      });
                      dragIndexRef.current = null;
                      setDragOverIndex(null);
                      setDragOverPosition(null);
                    }}
                    onDragEnd={() => {
                      dragIndexRef.current = null;
                      setDragOverIndex(null);
                      setDragOverPosition(null);
                    }}
                    dragOver={dragOverIndex === i ? dragOverPosition : null}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: config panel */}
        <div className="flex-1 overflow-auto">
          {selectedField ? (
            <div className="max-w-lg mx-auto p-8">
              <FieldConfigPanel field={selectedField} onChange={updateField} onDelete={() => deleteField(selectedField.id)} workspaceId={workspaceId} fields={fields} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              <div className="text-center">
                <img src={logoPratique} alt="" className="h-10 w-10 mx-auto mb-3 opacity-20 rounded-full" />
                <p>Selecione um campo ou adicione um novo</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddFieldDialog open={dialogOpen} onOpenChange={setDialogOpen} onAddField={addField} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} formId={formId!} slug={slug} />
      <ThemePanel open={themeOpen} onOpenChange={setThemeOpen} theme={theme} onChange={(t) => {
        setTheme(t);
        toast({ title: "Tema atualizado!", description: "Clique em Salvar para persistir as mudanças." });
      }} />
    </div>
  );
};

export default FormEditor;
