import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { BranchingPanel } from "@/components/workflow/BranchingPanel";
import { ScoringPanel } from "@/components/workflow/ScoringPanel";
import { TaggingPanel } from "@/components/workflow/TaggingPanel";
import { OutcomePanel } from "@/components/workflow/OutcomePanel";
import { ActionsPanel } from "@/components/workflow/ActionsPanel";
import { ArrowLeft, Sparkles, Save, GitBranch, Award, Tag, Trophy } from "lucide-react";
import type { FormField, FieldLogic, ScoringConfig, TaggingConfig, OutcomesConfig, FormSchema } from "@/types/workflow";
import { DEFAULT_SCORING, DEFAULT_TAGGING, DEFAULT_OUTCOMES } from "@/types/workflow";

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
  const [versionId, setVersionId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("branching");

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

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
    };

    const { error } = await supabase
      .from("form_versions")
      .update({ schema: updatedSchema as any })
      .eq("id", versionId);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Workflow salvo!" });
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
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-display font-bold text-sm gradient-text">Pratique Forms</span>
        </div>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-sm truncate max-w-[200px]">{formName}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-primary font-medium">Workflow</span>
        <div className="ml-auto">
          <Button
            size="sm"
            className="gradient-primary text-primary-foreground"
            onClick={saveWorkflow}
            disabled={saving}
          >
            <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar Workflow"}
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Canvas */}
          <div className="border-b bg-muted/20">
            <WorkflowCanvas
              fields={fields}
              logic={logic}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
            />
          </div>

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

              <ScrollArea className="flex-1">
                <div className="max-w-lg mx-auto p-6">
                  <TabsContent value="branching" className="mt-0">
                    {selectedField ? (
                      <BranchingPanel
                        field={selectedField}
                        fields={fields}
                        logic={logic}
                        onUpdateLogic={setLogic}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Selecione um campo no pipeline acima.
                      </p>
                    )}
                  </TabsContent>
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

        {/* Actions sidebar */}
        <ActionsPanel formId={formId!} />
      </div>
    </div>
  );
};

export default FormWorkflow;
