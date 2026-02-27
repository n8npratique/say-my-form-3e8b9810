import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { useRealtimeResponses } from "@/hooks/useRealtimeResponses";
import {
  Plus, ArrowLeft, FileText, MoreHorizontal,
  Eye, Pencil, Trash2, Globe, Settings, Users, Copy, ArchiveRestore,
  Star, ThumbsUp, GraduationCap, UserPlus, MessageSquare, CalendarDays, CalendarClock, Check,
  Sparkles, Mic, MicOff, Loader2, Send, BarChart3,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import logoPratique from "@/assets/logo-pratique.png";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FORM_TEMPLATES, type FormTemplate } from "@/config/formTemplates";

interface Form {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Sub-componente isolado para badge de novas respostas (cada form tem seu próprio canal Realtime)
function FormNewBadge({ formId, isPublished }: { formId: string; isPublished: boolean }) {
  const { newCount } = useRealtimeResponses({ formId: isPublished ? formId : undefined });
  if (!isPublished || newCount === 0) return null;
  return (
    <Badge
      variant="destructive"
      className="animate-pulse h-5 min-w-5 px-1.5 text-[10px] flex items-center justify-center absolute -top-1.5 -right-1.5"
    >
      {newCount}
    </Badge>
  );
}

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Star, ThumbsUp, GraduationCap, UserPlus, MessageSquare, CalendarDays, CalendarClock,
};

const WorkspaceForms = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const [forms, setForms] = useState<Form[]>([]);
  const [trashedForms, setTrashedForms] = useState<Form[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(true);
  const [newFormName, setNewFormName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"blank" | "template" | "ai">("blank");
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [activeTab, setActiveTab] = useState("active");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<{ name: string; fields: any[]; logic?: any[] } | null>(null);
  const [listening, setListening] = useState(false);
  const [responseCounts, setResponseCounts] = useState<Record<string, number>>({});
  const recognitionRef = useRef<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (workspaceId) {
      fetchWorkspace();
      fetchForms();
      fetchTrashedForms();
    }
  }, [workspaceId]);

  const fetchWorkspace = async () => {
    const { data } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId!)
      .maybeSingle();
    if (data) setWorkspaceName(data.name);
  };

  const fetchForms = async () => {
    const { data, error } = await supabase
      .from("forms")
      .select("*")
      .eq("workspace_id", workspaceId!)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setForms(data || []);
      if (data && data.length > 0) fetchResponseCounts(data.map(f => f.id));
    }
    setLoading(false);
  };

  const fetchTrashedForms = async () => {
    const { data } = await supabase
      .from("forms")
      .select("*")
      .eq("workspace_id", workspaceId!)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    setTrashedForms(data || []);
  };

  const fetchResponseCounts = async (formIds: string[]) => {
    if (formIds.length === 0) return;
    const { data } = await supabase
      .from("responses")
      .select("form_id")
      .in("form_id", formIds);
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((r) => { counts[r.form_id] = (counts[r.form_id] || 0) + 1; });
      setResponseCounts(counts);
    }
  };

  const createForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFormName.trim()) return;

    const slug =
      newFormName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
      "-" + Math.random().toString(36).substring(2, 8);

    const { data, error } = await supabase
      .from("forms")
      .insert({ name: newFormName.trim(), workspace_id: workspaceId!, slug })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    // Build schema: blank, template, or AI-generated
    const schema = aiResult
      ? { fields: aiResult.fields, ...(aiResult.logic?.length ? { logic: aiResult.logic } : {}) }
      : selectedTemplate
        ? selectedTemplate.buildSchema()
        : { fields: [] };

    await supabase.from("form_versions").insert({
      form_id: data.id,
      version_number: 1,
      schema: schema as any,
    });

    toast({ title: "Formulário criado!" });
    setNewFormName("");
    setDialogOpen(false);
    setSelectedTemplate(null);
    setDialogMode("blank");
    setAiResult(null);
    setAiPrompt("");
    fetchForms();

    // Navigate straight to editor
    navigate(`/workspace/${workspaceId}/form/${data.id}/edit`);
  };

  const softDeleteForm = async (formId: string) => {
    const { error } = await supabase
      .from("forms")
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", formId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Formulário movido para a lixeira" });
      fetchForms();
      fetchTrashedForms();
    }
  };

  const restoreForm = async (formId: string) => {
    const { error } = await supabase
      .from("forms")
      .update({ deleted_at: null } as any)
      .eq("id", formId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Formulário restaurado!" });
      fetchForms();
      fetchTrashedForms();
    }
  };

  const permanentDeleteForm = async (formId: string) => {
    const { error } = await supabase.from("forms").delete().eq("id", formId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Formulário excluído permanentemente" });
      fetchTrashedForms();
    }
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-form", {
        body: { description: aiPrompt },
      });
      if (error) throw error;
      if (data?.fields) {
        const logicCount = data.logic?.length || 0;
        setAiResult({ name: data.name || "Formulário IA", fields: data.fields, logic: data.logic || [] });
        setNewFormName(data.name || "Formulário IA");
        const desc = logicCount > 0
          ? `${data.fields.length} campos e ${logicCount} regras de lógica criados pela IA.`
          : `${data.fields.length} campos criados pela IA.`;
        toast({ title: "Formulário gerado!", description: desc });
      }
    } catch (err: any) {
      toast({ title: "Erro na geração", description: err.message, variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const [interimText, setInterimText] = useState("");

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setInterimText("");
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: "Navegador não suporta reconhecimento de voz", description: "Use Chrome ou Edge.", variant: "destructive" });
      return;
    }
    const recognition = new SR();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) {
        setAiPrompt((prev) => prev ? prev + " " + final : final);
        setInterimText("");
      } else {
        setInterimText(interim);
      }
    };
    recognition.onerror = (e: any) => {
      setListening(false);
      setInterimText("");
      const messages: Record<string, string> = {
        "not-allowed": "Permissão de microfone negada. Permita o acesso nas configurações do navegador.",
        "no-speech": "Nenhuma fala detectada. Tente novamente.",
        "audio-capture": "Nenhum microfone encontrado.",
        "network": "Erro de rede. Verifique sua conexão.",
      };
      toast({
        title: "Erro no microfone",
        description: messages[e.error] || `Erro: ${e.error}`,
        variant: "destructive",
      });
    };
    recognition.onend = () => {
      setListening(false);
      setInterimText("");
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch (err: any) {
      toast({ title: "Erro ao iniciar microfone", description: err.message, variant: "destructive" });
    }
  };

  const duplicateForm = async (form: Form) => {
    // Get latest version schema
    const { data: versions } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("form_id", form.id)
      .order("version_number", { ascending: false })
      .limit(1);

    const schema = versions?.[0]?.schema || { fields: [] };

    const newSlug = form.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) + "-" + Math.random().toString(36).substring(2, 8);

    const { data: newForm, error } = await supabase.from("forms").insert({
      name: `${form.name} (cópia)`,
      workspace_id: workspaceId!,
      slug: newSlug,
    }).select().single();

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("form_versions").insert({
      form_id: newForm.id,
      version_number: 1,
      schema: schema as any,
    });

    toast({ title: "Formulário duplicado!" });
    fetchForms();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 hover:opacity-80 transition">
              <img src={logoPratique} alt="TecForms" className="h-7 w-7 rounded-full" />
              <span className="font-display font-bold gradient-text">TecForms</span>
            </button>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">{workspaceName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled title="Em breve">
              <Users className="h-4 w-4 mr-2" />
              Equipe
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/workspace/${workspaceId}/settings`)}>
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="text-3xl font-display font-bold">Formulários</h1>
            <p className="text-muted-foreground mt-1">Gerencie os formulários deste workspace</p>
          </motion.div>

          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) { setDialogMode("blank"); setSelectedTemplate(null); setNewFormName(""); setAiResult(null); setAiPrompt(""); }
          }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground btn-lift shadow-elevation-2">
                <Plus className="h-4 w-4 mr-2" />
                Novo Formulário
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Criar Formulário</DialogTitle>
              </DialogHeader>

              {/* Mode toggle */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant={dialogMode === "blank" ? "default" : "outline"}
                  size="sm"
                  className={dialogMode === "blank" ? "gradient-primary text-primary-foreground" : ""}
                  onClick={() => { setDialogMode("blank"); setSelectedTemplate(null); setAiResult(null); }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Em branco
                </Button>
                <Button
                  variant={dialogMode === "template" ? "default" : "outline"}
                  size="sm"
                  className={dialogMode === "template" ? "gradient-primary text-primary-foreground" : ""}
                  onClick={() => { setDialogMode("template"); setAiResult(null); }}
                >
                  <Star className="h-4 w-4 mr-2" />
                  Usar template
                </Button>
                <Button
                  variant={dialogMode === "ai" ? "default" : "outline"}
                  size="sm"
                  className={dialogMode === "ai" ? "gradient-primary text-primary-foreground" : ""}
                  onClick={() => { setDialogMode("ai"); setSelectedTemplate(null); }}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Criar com IA
                </Button>
              </div>

              {/* AI generation */}
              {dialogMode === "ai" && (
                <div className="space-y-4 mb-4">
                  <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Descreva o formulário que deseja criar. Seja específico sobre os campos, tipo de perguntas e objetivo.
                    </p>
                    <div className="flex gap-2">
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Ex: Quero um formulário de pesquisa de satisfação para academia com avaliação do atendimento, das instalações, pergunta NPS e campo de sugestões..."
                        className="flex-1 min-h-[80px] rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && !aiGenerating) {
                            e.preventDefault();
                            generateWithAI();
                          }
                        }}
                      />
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={toggleVoice}
                          className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
                            listening
                              ? "bg-red-500 text-white animate-pulse"
                              : "bg-muted hover:bg-muted/80 text-muted-foreground"
                          }`}
                          title={listening ? "Parar" : "Falar"}
                        >
                          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        </button>
                        <Button
                          size="icon"
                          className="h-10 w-10 rounded-full gradient-primary"
                          onClick={generateWithAI}
                          disabled={aiGenerating || !aiPrompt.trim()}
                        >
                          {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    {listening && (
                      <div className="space-y-1">
                        <p className="text-xs text-red-500 animate-pulse flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                          Ouvindo... fale agora
                        </p>
                        {interimText && (
                          <p className="text-xs text-muted-foreground italic bg-muted/30 rounded px-2 py-1">
                            {interimText}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {aiResult && (
                    <div className="rounded-xl border bg-green-50 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-green-600" />
                        <p className="text-sm font-medium text-green-800">
                          Formulário gerado: {aiResult.fields.length} campos{aiResult.logic?.length ? ` + ${aiResult.logic.length} regras de lógica` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {aiResult.fields.map((f: any, i: number) => (
                          <span key={i} className="text-xs bg-white rounded px-2 py-0.5 border text-muted-foreground">
                            {f.label || f.type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Template gallery */}
              {dialogMode === "template" && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {FORM_TEMPLATES.map((tpl) => {
                    const Icon = TEMPLATE_ICONS[tpl.icon] ?? FileText;
                    const isSelected = selectedTemplate?.id === tpl.id;
                    return (
                      <motion.div
                        key={tpl.id}
                        whileHover={{ y: -2 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Card
                          className={`cursor-pointer transition-all relative ${
                            isSelected
                              ? "border-primary shadow-lg ring-2 ring-primary/30"
                              : "hover:shadow-lg hover:border-primary/30"
                          }`}
                          onClick={() => {
                            setSelectedTemplate(tpl);
                            setNewFormName(tpl.name);
                          }}
                        >
                          {isSelected && (
                            <span className="absolute top-2 right-2 h-5 w-5 rounded-full gradient-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </span>
                          )}
                          <CardHeader className="p-4 space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                              <CardTitle className="text-sm font-semibold leading-tight">{tpl.name}</CardTitle>
                            </div>
                            <CardDescription className="text-xs leading-relaxed">{tpl.description}</CardDescription>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{tpl.category}</Badge>
                              <div className="flex gap-1 ml-auto">
                                {tpl.themeColors.map((c, i) => (
                                  <span key={i} className="h-3 w-3 rounded-full border border-border/50" style={{ background: c }} />
                                ))}
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Name + submit */}
              <form onSubmit={createForm} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="form-name">Nome do formulário</Label>
                  <Input
                    id="form-name"
                    placeholder="Pesquisa de Satisfação"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gradient-primary text-primary-foreground"
                  disabled={(dialogMode === "template" && !selectedTemplate) || (dialogMode === "ai" && !aiResult)}
                >
                  {dialogMode === "ai" && aiResult
                    ? `Criar formulário com IA (${aiResult.fields.length} campos)`
                    : dialogMode === "template" && selectedTemplate
                      ? `Criar com template "${selectedTemplate.name}"`
                      : "Criar formulário em branco"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="active">Ativos ({forms.length})</TabsTrigger>
            <TabsTrigger value="trash">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Lixeira ({trashedForms.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <img src={logoPratique} alt="Carregando" className="h-8 w-8 rounded-full animate-pulse" />
              </div>
            ) : forms.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-20"
              >
                <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <h2 className="text-xl font-display font-semibold mb-2">Nenhum formulário ainda</h2>
                <p className="text-muted-foreground mb-6">Crie seu primeiro formulário conversacional.</p>
                <Button className="gradient-primary text-primary-foreground" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar primeiro formulário
                </Button>
              </motion.div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {forms.map((form, i) => (
                  <motion.div
                    key={form.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, type: "spring", stiffness: 260, damping: 20 }}
                  >
                    <Card className="card-hover-glow group relative overflow-hidden">
                      <FormNewBadge formId={form.id} isPublished={form.status === "published"} />
                      {/* Gradient top strip */}
                      <div className={`h-1 w-full ${form.status === "published" ? "gradient-primary" : "bg-muted"}`} />
                      <CardHeader className="pt-4 pb-3 flex flex-row items-start justify-between space-y-0">
                        <div
                          className="flex-1 cursor-pointer min-w-0"
                          onClick={() => navigate(`/workspace/${workspaceId}/form/${form.id}/edit`)}
                        >
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${form.status === "published" ? "gradient-primary" : "bg-muted"}`}>
                              <FileText className={`h-4.5 w-4.5 ${form.status === "published" ? "text-primary-foreground" : "text-muted-foreground"}`} />
                            </div>
                            <CardTitle className="text-base font-display group-hover:text-primary transition-colors truncate">
                              {form.name}
                            </CardTitle>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={form.status === "published" ? "default" : "secondary"}
                              className={`text-[10px] h-5 ${form.status === "published" ? "gradient-primary text-primary-foreground border-0" : ""}`}
                            >
                              {form.status === "published" ? "Publicado" : "Rascunho"}
                            </Badge>
                            {(responseCounts[form.id] ?? 0) > 0 && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <BarChart3 className="h-3 w-3" />
                                {responseCounts[form.id]} {responseCounts[form.id] === 1 ? "resposta" : "respostas"}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Atualizado {formatDistanceToNow(new Date(form.updated_at), { locale: ptBR, addSuffix: true })}
                          </p>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/workspace/${workspaceId}/form/${form.id}/edit`)}>
                              <Pencil className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            {form.slug && (
                              <DropdownMenuItem onClick={() => window.open(`/f/${form.slug}`, "_blank")}>
                                <Globe className="h-4 w-4 mr-2" /> Abrir público
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => navigate(`/workspace/${workspaceId}/form/${form.id}/responses`)}>
                              <Eye className="h-4 w-4 mr-2" /> Respostas
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicateForm(form)}>
                              <Copy className="h-4 w-4 mr-2" /> Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => softDeleteForm(form.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Mover para lixeira
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </CardHeader>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="trash" className="mt-6">
            {trashedForms.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-20"
              >
                <Trash2 className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <h2 className="text-xl font-display font-semibold mb-2">Lixeira vazia</h2>
                <p className="text-muted-foreground">Formulários excluídos aparecerão aqui.</p>
              </motion.div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {trashedForms.map((form, i) => (
                  <motion.div
                    key={form.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="opacity-70 hover:opacity-100 transition-all">
                      <CardHeader className="flex flex-row items-start justify-between space-y-0">
                        <div className="flex-1">
                          <CardTitle className="text-lg font-display">{form.name}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            Excluído em {form.deleted_at ? new Date(form.deleted_at).toLocaleDateString("pt-BR") : ""}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => restoreForm(form.id)} title="Restaurar">
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => permanentDeleteForm(form.id)} title="Excluir permanentemente">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default WorkspaceForms;
