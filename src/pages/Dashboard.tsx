import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Plus, LogOut, Building2, Bell, Shield, FileText, BarChart3 } from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";
import { useRealtimeResponses } from "@/hooks/useRealtimeResponses";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [allFormIds, setAllFormIds] = useState<string[]>([]);
  const [formNames, setFormNames] = useState<Record<string, string>>({});
  const [wsFormCounts, setWsFormCounts] = useState<Record<string, number>>({});
  const [wsResponseCounts, setWsResponseCounts] = useState<Record<string, number>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);

  const { newCount, recentResponses, resetCount } = useRealtimeResponses({ formIds: allFormIds });

  useEffect(() => {
    fetchWorkspaces();
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .maybeSingle();
    setIsAdmin(!!data);
  };

  const fetchWorkspaces = async () => {
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setWorkspaces(data || []);
    }
    setLoading(false);

    // Buscar todos os form_ids para o canal Realtime global + stats por workspace
    const { data: forms } = await supabase
      .from("forms")
      .select("id, name, workspace_id")
      .is("deleted_at", null);
    if (forms) {
      setAllFormIds(forms.map((f) => f.id));
      const names: Record<string, string> = {};
      const fCounts: Record<string, number> = {};
      forms.forEach((f) => {
        names[f.id] = f.name;
        fCounts[f.workspace_id] = (fCounts[f.workspace_id] || 0) + 1;
      });
      setFormNames(names);
      setWsFormCounts(fCounts);

      // Fetch total responses per workspace
      const { data: responses } = await supabase
        .from("responses")
        .select("form_id")
        .in("form_id", forms.map((f) => f.id));
      if (responses) {
        const wsIdByForm: Record<string, string> = {};
        forms.forEach((f) => { wsIdByForm[f.id] = f.workspace_id; });
        const rCounts: Record<string, number> = {};
        responses.forEach((r) => {
          const wsId = wsIdByForm[r.form_id];
          if (wsId) rCounts[wsId] = (rCounts[wsId] || 0) + 1;
        });
        setWsResponseCounts(rCounts);
      }
    }
  };

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    const { error } = await supabase.from("workspaces").insert({
      name: newWorkspaceName.trim(),
      owner_id: user!.id,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Workspace criado!" });
      setNewWorkspaceName("");
      setDialogOpen(false);
      fetchWorkspaces();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <img src={logoPratique} alt="TecForms" className="h-8 w-8 rounded-full" />
            <span className="text-xl font-display font-bold gradient-text">TecForms</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.email}</span>

            {/* Admin link */}
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                title="Administração"
                onClick={() => navigate("/admin/invites")}
              >
                <Shield className="h-4 w-4" />
              </Button>
            )}

            {/* Sino de notificações */}
            <Popover onOpenChange={(open) => { if (open) resetCount(); }}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-4 w-4" />
                  {newCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] animate-pulse"
                    >
                      {newCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="p-3 border-b">
                  <p className="text-sm font-semibold">Notificações</p>
                </div>
                {recentResponses.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhuma notificação recente
                  </div>
                ) : (
                  <div className="divide-y">
                    {recentResponses.slice(0, 5).map((r) => (
                      <button
                        key={r.id}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          const ws = workspaces[0];
                          if (ws) navigate(`/workspace/${ws.id}/form/${r.form_id}/responses`);
                        }}
                      >
                        <p className="text-sm font-medium truncate">{formNames[r.form_id] || "Formulário"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge
                            variant={r.status === "completed" ? "default" : "secondary"}
                            className="text-[10px] h-4"
                          >
                            {r.status === "completed" ? "Completada" : "Em andamento"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(r.started_at), { locale: ptBR, addSuffix: true })}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="text-3xl font-display font-bold">Workspaces</h1>
            <p className="text-muted-foreground mt-1">Selecione ou crie um workspace para começar</p>
          </motion.div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground btn-lift shadow-elevation-2">
                <Plus className="h-4 w-4 mr-2" />
                Novo Workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Criar Workspace</DialogTitle>
              </DialogHeader>
              <form onSubmit={createWorkspace} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ws-name">Nome do workspace</Label>
                  <Input
                    id="ws-name"
                    placeholder="Minha Empresa"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
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
        ) : workspaces.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
            <Building2 className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-xl font-display font-semibold mb-2">Nenhum workspace ainda</h2>
            <p className="text-muted-foreground mb-6">Crie seu primeiro workspace para começar a construir formulários.</p>
            <Button className="gradient-primary text-primary-foreground" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro workspace
            </Button>
          </motion.div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws, i) => (
              <motion.div key={ws.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, type: "spring", stiffness: 260, damping: 20 }}>
                <Card
                  className="cursor-pointer card-hover-glow group overflow-hidden"
                  onClick={() => navigate(`/workspace/${ws.id}`)}
                >
                  <div className="h-1 w-full gradient-primary" />
                  <CardHeader className="pt-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center shadow-elevation-2 group-hover:shadow-elevation-3 transition-shadow">
                        <Building2 className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-lg font-display group-hover:text-primary transition-colors truncate">
                          {ws.name}
                        </CardTitle>
                        <CardDescription className="text-[11px]">
                          Criado {formatDistanceToNow(new Date(ws.created_at), { locale: ptBR, addSuffix: true })}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        {wsFormCounts[ws.id] || 0} {(wsFormCounts[ws.id] || 0) === 1 ? "formulário" : "formulários"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5" />
                        {wsResponseCounts[ws.id] || 0} {(wsResponseCounts[ws.id] || 0) === 1 ? "resposta" : "respostas"}
                      </span>
                    </div>
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

export default Dashboard;
