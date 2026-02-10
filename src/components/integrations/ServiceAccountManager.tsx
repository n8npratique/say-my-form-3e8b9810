import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { KeyRound, Plus, Trash2, Loader2, Mail } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ServiceAccount {
  id: string;
  name: string;
  client_email: string;
  created_at: string;
}

interface Props {
  workspaceId: string;
}

export const ServiceAccountManager = ({ workspaceId }: Props) => {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [jsonKey, setJsonKey] = useState("");

  useEffect(() => {
    fetchAccounts();
  }, [workspaceId]);

  const fetchAccounts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("google_service_accounts")
      .select("id, name, client_email, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    setAccounts(data || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!name.trim() || !jsonKey.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonKey);
    } catch {
      toast({ title: "JSON inválido", description: "Cole o conteúdo completo do arquivo JSON da Service Account.", variant: "destructive" });
      return;
    }

    if (!parsed.client_email || !parsed.private_key) {
      toast({ title: "JSON incompleto", description: "O JSON precisa conter client_email e private_key.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("google_service_accounts").insert({
      workspace_id: workspaceId,
      name: name.trim(),
      client_email: parsed.client_email,
      encrypted_key: jsonKey.trim(),
    });

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Service Account cadastrada!" });
      setName("");
      setJsonKey("");
      setDialogOpen(false);
      fetchAccounts();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("google_service_accounts").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Service Account removida" });
      fetchAccounts();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          Service Accounts do Google
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">Nova Service Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome amigável</Label>
                <Input
                  placeholder="Ex: Conta Principal"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Chave JSON</Label>
                <Textarea
                  placeholder="Cole aqui o conteúdo do arquivo JSON da Service Account..."
                  value={jsonKey}
                  onChange={(e) => setJsonKey(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
              </div>
              <Button onClick={handleAdd} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma Service Account cadastrada ainda.
          </p>
        ) : (
          <div className="space-y-3">
            {accounts.map((sa) => (
              <div key={sa.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{sa.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{sa.client_email}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(sa.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
