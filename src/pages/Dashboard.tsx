import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Plus, LogOut, Building2 } from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";

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
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

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
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold">Workspaces</h1>
            <p className="text-muted-foreground mt-1">Selecione ou crie um workspace para começar</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
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
              <motion.div
                key={ws.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all group"
                  onClick={() => navigate(`/workspace/${ws.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-display group-hover:text-primary transition-colors">
                          {ws.name}
                        </CardTitle>
                        <CardDescription>
                          {new Date(ws.created_at).toLocaleDateString("pt-BR")}
                        </CardDescription>
                      </div>
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
