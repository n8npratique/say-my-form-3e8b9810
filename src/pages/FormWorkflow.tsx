import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { BranchingPanel } from "@/components/workflow/BranchingPanel";
import { FlowPreview } from "@/components/workflow/FlowPreview";
import { ScoringPanel } from "@/components/workflow/ScoringPanel";
import { TaggingPanel } from "@/components/workflow/TaggingPanel";
import { OutcomePanel } from "@/components/workflow/OutcomePanel";
import { ActionsPanel } from "@/components/workflow/ActionsPanel";
import { AddFieldDialog } from "@/components/form-editor/AddFieldDialog";
import { ArrowLeft, Save, GitBranch, Award, Tag, Trophy, RefreshCw, Smartphone, Monitor } from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";
import type { FormField, FieldLogic, ScoringConfig, TaggingConfig, OutcomesConfig, FormSchema, EmailTemplate } from "@/types/workflow";
import { DEFAULT_SCORING, DEFAULT_TAGGING, DEFAULT_OUTCOMES } from "@/types/workflow";
import type { FieldType } from "@/config/fieldTypes";

const FormWorkflow = () => {
  const { workspaceId, formId } = useParams<{ workspaceId: string; formId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [logic, setLogic] = useState<FieldLogic[]>([]);
  const [scoring, setScoring] = useState<ScoringConfig>(DEFAULT_SCORING);
  const [tagging, setTagging] = useState<TaggingConfig>(DEFAULT_TAGGING);
  const [outcomes, setOutcomes] = useState<OutcomesConfig>(DEFAULT_OUTCOMES);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("branching");
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewSize, setPreviewSize] = useState<"mobile" | "desktop">("mobile");

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  const handleInsertField = (afterIndex: number) => {
    setInsertAfterIndex(afterIndex);
    setInsertDialogOpen(true);
  };

  const handleAddFieldAtIndex = async (type: FieldType) => {
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

    const insertAt = insertAfterIndex != null ? insertAfterIndex + 1 : fields.length;
    const updatedFields = [...fields];
    updatedFields.splice(insertAt, 0, newField);
    setFields(updatedFields);
    setSelectedFieldId(newField.id);
    setInsertDialogOpen(false);
    setInsertAfterIndex(null);

    // Persist to database
    if (versionId) {
      const { data: current } = await supabase
        .from("form_versions")
        .select("schema")
        .eq("id", versionId)
        .maybeSingle();

      const currentSchema = (current?.schema as any) || {};
      const existingFields: FormField[] = currentSchema.fields || [];
      existingFields.splice(insertAt, 0, newField);

      await supabase
        .from("form_versions")
        .update({ schema: { ...currentSchema, fields: existingFields } as any })
        .eq("id", versionId);

      toast({ title: "Campo inserido no fluxo!" });
    }
  };

  useEffect(() => {
    if (formId) fetchData();
  }, [formId]);

  const fetchData = async () => {
    const { data: form } = await supabase
      .from("forms")
      .select("name")
      .eq("id", formId!)
      .maybeSingle();
    if (form) setFormName(form.name);

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
      if (schema?.fields) setFields(schema.fields);
      if (schema?.logic) setLogic(schema.logic);
      if (schema?.scoring) setScoring({ ...DEFAULT_SCORING, ...schema.scoring });
      if (schema?.tagging) setTagging({ ...DEFAULT_TAGGING, ...schema.tagging });
      if (schema?.outcomes) setOutcomes({ ...DEFAULT_OUTCOMES, ...schema.outcomes });
      if (schema?.email_templates) setEmailTemplates(schema.email_templates);
      if (schema?.fields?.length > 0) setSelectedFieldId(schema.fields[0].id);
    }
  };

  const saveWorkflow = async () => {
    if (!versionId) return;
    setSaving(true);

    // Read current schema to preserve fields
    const { data: current } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("id", versionId)
      .maybeSingle();

    const currentSchema = (current?.schema as any) || {};
    const updatedSchema: FormSchema = {
      ...currentSchema,
      fields: currentSchema.fields || fields,
      logic,
      scoring,
      tagging,
      outcomes,
      email_templates: emailTemplates,
    };

    const { error } = await supabase
      .from("form_versions")
      .update({ schema: updatedSchema as any })
      .eq("id", versionId);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Integrações salvas!" });
      setPreviewKey((k) => k + 1); // refresh preview
    }
    setSaving(false);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm h-14 flex items-center px-4 gap-3 shrink-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/workspace/${workspaceId}/form/${formId}/edit`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 hover:opacity-80 transition">
          <img src={logoPratique} alt="TecForms" className="h-6 w-6 rounded-full" />
          <span className="font-display font-bold text-sm gradient-text">TecForms</span>
        </button>
        <span className="text-muted-foreground">/</span>
        <button onClick={() => navigate(`/workspace/${workspaceId}/form/${formId}/edit`)} className="font-medium text-sm truncate max-w-[200px] hover:text-primary transition cursor-pointer">{formName}</button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-primary font-medium">Integrações</span>
        <div className="ml-auto">
          <Button
            size="sm"
            className="gradient-primary text-primary-foreground"
            onClick={saveWorkflow}
            disabled={saving}
          >
            <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar Integrações"}
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Canvas - hidden on branching tab to maximize preview height */}
          {activeTab !== "branching" && (
            <WorkflowCanvas
              fields={fields}
              logic={logic}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
              onInsertField={handleInsertField}
            />
          )}

          {/* Config panels */}
          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="border-b px-4">
                <TabsList className="bg-transparent">
                  <TabsTrigger value="branching" className="gap-1.5 text-xs">
                    <GitBranch className="h-3.5 w-3.5" /> Branching
                  </TabsTrigger>
                  <TabsTrigger value="scoring" className="gap-1.5 text-xs">
                    <Award className="h-3.5 w-3.5" /> Scoring
                  </TabsTrigger>
                  <TabsTrigger value="tagging" className="gap-1.5 text-xs">
                    <Tag className="h-3.5 w-3.5" /> Tagging
                  </TabsTrigger>
                  <TabsTrigger value="outcomes" className="gap-1.5 text-xs">
                    <Trophy className="h-3.5 w-3.5" /> Outcome Quiz
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="branching" className="mt-0 flex-1 overflow-hidden">
                <div className="flex h-full">
                  {/* Flow Preview - left side */}
                  <ScrollArea className="w-72 shrink-0 border-r">
                    <div className="p-4">
                      <FlowPreview
                        fields={fields}
                        logic={logic}
                        selectedFieldId={selectedFieldId}
                        onSelectField={setSelectedFieldId}
                      />
                    </div>
                  </ScrollArea>
                  {/* Branching config - center */}
                  <ScrollArea className="w-[360px] shrink-0 border-r">
                    <div className="p-4">
                      {selectedField ? (
                        <BranchingPanel
                          field={selectedField}
                          fields={fields}
                          logic={logic}
                          onUpdateLogic={setLogic}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          Selecione um campo no pipeline acima ou no fluxo ao lado.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                  {/* Live form preview - right side */}
                  <div className="flex-1 flex flex-col bg-muted/30" style={{ height: "calc(100vh - 100px)" }}>
                    <div className="flex items-center justify-between px-3 py-2 border-b bg-card/50">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={previewSize === "mobile" ? "secondary" : "ghost"}
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setPreviewSize("mobile")}
                          title="Mobile"
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant={previewSize === "desktop" ? "secondary" : "ghost"}
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setPreviewSize("desktop")}
                          title="Desktop"
                        >
                          <Monitor className="h-3.5 w-3.5" />
                        </Button>
                        <div className="w-px h-4 bg-border mx-0.5" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setPreviewKey((k) => k + 1)}
                          title="Recarregar preview"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 flex items-stretch justify-center p-2 overflow-hidden" style={{ minHeight: 0 }}>
                      <div
                        className={`bg-background rounded-xl shadow-lg border overflow-hidden ${
                          previewSize === "mobile" ? "w-[480px]" : "w-full"
                        }`}
                        style={{ height: "calc(100vh - 100px)" }}
                      >
                        <iframe
                          key={previewKey}
                          src={`/form/${formId}/preview`}
                          className="w-full h-full border-0"
                          title="Form Preview"
                        />
                      </div>
                    </div>
                    <div className="px-3 py-1.5 border-t bg-card/50">
                      <p className="text-[10px] text-muted-foreground text-center">
                        Salve para atualizar o preview | Clique em recarregar para reiniciar
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
              <ScrollArea className="flex-1">
                <div className="max-w-lg mx-auto p-6">
                  <TabsContent value="scoring" className="mt-0">
                    <ScoringPanel fields={fields} scoring={scoring} onUpdateScoring={setScoring} />
                  </TabsContent>
                  <TabsContent value="tagging" className="mt-0">
                    <TaggingPanel fields={fields} tagging={tagging} onUpdateTagging={setTagging} />
                  </TabsContent>
                  <TabsContent value="outcomes" className="mt-0">
                    <OutcomePanel fields={fields} outcomes={outcomes} onUpdateOutcomes={setOutcomes} />
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>
          </div>
        </div>

        {/* Actions sidebar - hidden on branching tab to give preview more space */}
        {activeTab !== "branching" && (
          <ActionsPanel
            formId={formId!}
            emailTemplates={emailTemplates}
            onUpdateEmailTemplates={setEmailTemplates}
            fields={fields}
            scoring={scoring}
            tagging={tagging}
            outcomes={outcomes}
          />
        )}
      </div>

      <AddFieldDialog
        open={insertDialogOpen}
        onOpenChange={setInsertDialogOpen}
        onAddField={handleAddFieldAtIndex}
      />
    </div>
  );
};

export default FormWorkflow;
