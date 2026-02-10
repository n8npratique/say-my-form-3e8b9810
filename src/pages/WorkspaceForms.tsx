import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  Plus, ArrowLeft, FileText, MoreHorizontal,
  Eye, Pencil, Trash2, Globe, Settings, Users
} from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Form {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const WorkspaceForms = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const [forms, setForms] = useState<Form[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(true);
  const [newFormName, setNewFormName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (workspaceId) {
      fetchWorkspace();
      fetchForms();
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
      .order("updated_at", { ascending: false });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setForms(data || []);
    }
    setLoading(false);
  };

  const createForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFormName.trim()) return;

    const slug = newFormName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).substring(2, 8);

    const { data, error } = await supabase.from("forms").insert({
      name: newFormName.trim(),
      workspace_id: workspaceId!,
      slug,
    }).select().single();

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      // Create initial version
      await supabase.from("form_versions").insert({
        form_id: data.id,
        version_number: 1,
      });
      toast({ title: "Formulário criado!" });
      setNewFormName("");
      setDialogOpen(false);
      fetchForms();
    }
  };

  const deleteForm = async (formId: string) => {
    const { error } = await supabase.from("forms").delete().eq("id", formId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Formulário excluído" });
      fetchForms();
    }
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
            <Button variant="ghost" size="sm" onClick={() => navigate(`/workspace/${workspaceId}/team`)}>
              <Users className="h-4 w-4 mr-2" />
              Equipe
            </Button>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold">Formulários</h1>
            <p className="text-muted-foreground mt-1">Gerencie os formulários deste workspace</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                Novo Formulário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Criar Formulário</DialogTitle>
              </DialogHeader>
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
                <Button type="submit" className="w-full gradient-primary text-primary-foreground">
                  Criar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

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
                transition={{ delay: i * 0.05 }}
              >
                <Card className="hover:shadow-lg hover:border-primary/30 transition-all group">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(`/workspace/${workspaceId}/form/${form.id}/edit`)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg font-display group-hover:text-primary transition-colors">
                          {form.name}
                        </CardTitle>
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <Badge
                          variant={form.status === "published" ? "default" : "secondary"}
                          className={form.status === "published" ? "gradient-primary text-primary-foreground border-0" : ""}
                        >
                          {form.status === "published" ? "Publicado" : "Rascunho"}
                        </Badge>
                        <span className="text-xs">
                          Atualizado {new Date(form.updated_at).toLocaleDateString("pt-BR")}
                        </span>
                      </CardDescription>
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
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteForm(form.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default WorkspaceForms;
