import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddFieldDialog } from "@/components/form-editor/AddFieldDialog";
import { FieldItem, type FormField } from "@/components/form-editor/FieldItem";
import { FieldConfigPanel } from "@/components/form-editor/FieldConfigPanel";
import { ShareDialog } from "@/components/form-editor/ShareDialog";
import { ThemePanel } from "@/components/form-editor/ThemePanel";
import { ArrowLeft, Plus, Sparkles, Save, Eye, Share2, Rocket, GitBranch, ClipboardList, Palette } from "lucide-react";
import type { FieldType } from "@/config/fieldTypes";
import type { FormTheme } from "@/lib/formTheme";
import { DEFAULT_THEME } from "@/lib/formTheme";

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
  const [themeOpen, setThemeOpen] = useState(false);
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
    };
    setFields((prev) => [...prev, newField]);
    setSelectedId(newField.id);
  }, []);

  const updateField = useCallback((updated: FormField) => {
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, []);

  const deleteField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

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
    const mergedSchema = { ...existingSchema, fields, theme };

    const { error } = await supabase
      .from("form_versions")
      .update({ schema: mergedSchema as any })
      .eq("id", versionId);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Salvo com sucesso!" });
    }
    setSaving(false);
  };

  const publishForm = async () => {
    if (!versionId || !formId) return;
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
      .update({ schema: { ...existingSchema, fields, theme } as any })
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
    if (slug) {
      window.open(`/f/${slug}`, "_blank");
    } else {
      toast({ title: "Publique o formulário primeiro para gerar o preview.", variant: "destructive" });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm h-14 flex items-center px-4 gap-3 shrink-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/workspace/${workspaceId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-display font-bold text-sm gradient-text">Pratique Forms</span>
        </div>
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
            <GitBranch className="h-4 w-4 mr-1" /> Workflow
          </Button>
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Eye className="h-4 w-4 mr-1" /> Preview
          </Button>
          <Button variant="outline" size="sm" onClick={() => setThemeOpen(true)}>
            <Palette className="h-4 w-4 mr-1" /> Aparência
          </Button>
          {slug && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4 mr-1" /> Compartilhar
            </Button>
          )}
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
      <div className="flex flex-1 overflow-hidden">
        {/* Left: field list */}
        <div className="w-80 border-r flex flex-col bg-card/30">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-display font-semibold text-sm">Campos ({fields.length})</h2>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
          <ScrollArea className="flex-1">
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
              <FieldConfigPanel field={selectedField} onChange={updateField} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              <div className="text-center">
                <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>Selecione um campo ou adicione um novo</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddFieldDialog open={dialogOpen} onOpenChange={setDialogOpen} onAddField={addField} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} formId={formId!} slug={slug} />
      <ThemePanel open={themeOpen} onOpenChange={setThemeOpen} theme={theme} onChange={setTheme} />
    </div>
  );
};

export default FormEditor;
