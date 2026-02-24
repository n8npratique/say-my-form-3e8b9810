import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Mail, Copy, RefreshCw, Ban, Shield, UserPlus, Check, Loader2,
} from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";

interface Invitation {
  id: string;
  email: string;
  token: string;
  status: string;
  created_at: string;
  accepted_at: string | null;
  expires_at: string;
}

interface AdminUser {
  user_id: string;
  role: string;
  email?: string;
}

const AdminInvites = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  // Send invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);

  // Add admin dialog
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);

  // Check admin access
  useEffect(() => {
    if (authLoading || !user) return;

    const checkAdmin = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .maybeSingle();

      if (!data) {
        navigate("/dashboard");
        return;
      }
      setIsAdmin(true);
      fetchInvitations();
      fetchAdmins();
    };

    checkAdmin();
  }, [user, authLoading]);

  const fetchInvitations = async () => {
    setLoadingInvites(true);
    const { data, error } = await supabase
      .from("invitations")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setInvitations(data);
    setLoadingInvites(false);
  };

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["owner", "admin"]);

    if (data) {
      // Fetch emails from profiles
      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) || []);

      setAdmins(
        data.map((d) => ({
          ...d,
          email: profileMap.get(d.user_id) || d.user_id,
        }))
      );
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSending(true);

    try {
      // 1. Check if email already has a pending invite
      const { data: existing } = await supabase
        .from("invitations")
        .select("id, status")
        .eq("email", inviteEmail.trim().toLowerCase())
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        toast({
          title: "Convite já existe",
          description: "Este e-mail já tem um convite pendente.",
          variant: "destructive",
        });
        setSending(false);
        return;
      }

      // 2. Insert invitation
      const { data: invite, error } = await supabase
        .from("invitations")
        .insert({
          email: inviteEmail.trim().toLowerCase(),
          invited_by: user!.id,
        })
        .select()
        .single();

      if (error) throw error;

      // 3. Try to send email via edge function
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            email: invite.email,
            token: invite.token,
          }),
        }
      );
      const result = await res.json();

      if (result.sent) {
        toast({ title: "Convite enviado!", description: `E-mail enviado para ${invite.email}` });
      } else {
        // No email provider — show link to copy
        const inviteUrl = `${window.location.origin}/auth?invite=${invite.token}`;
        await navigator.clipboard.writeText(inviteUrl);
        toast({
          title: "Convite criado!",
          description: "Sem provedor de e-mail configurado. O link foi copiado para a área de transferência.",
        });
      }

      setInviteEmail("");
      fetchInvitations();
    } catch (error: any) {
      toast({ title: "Erro", description: "Falha ao criar convite.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const copyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/auth?invite=${token}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copiado!" });
  };

  const resendInvite = async (invitation: Invitation) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            email: invitation.email,
            token: invitation.token,
          }),
        }
      );
      const result = await res.json();

      if (result.sent) {
        toast({ title: "Reenviado!", description: `E-mail reenviado para ${invitation.email}` });
      } else {
        await copyInviteLink(invitation.token);
        toast({ title: "Link copiado!", description: "Sem provedor de e-mail. Link copiado." });
      }
    } catch {
      toast({ title: "Erro ao reenviar", variant: "destructive" });
    }
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase
      .from("invitations")
      .update({ status: "expired" })
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao revogar", variant: "destructive" });
    } else {
      toast({ title: "Convite revogado" });
      fetchInvitations();
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim()) return;
    setAddingAdmin(true);

    try {
      const { data, error } = await supabase.rpc("promote_to_admin", {
        target_email: adminEmail.trim().toLowerCase(),
      });

      if (error) {
        toast({
          title: "Erro",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      const result = data as { success: boolean; error?: string; user_id?: string };

      if (!result.success) {
        toast({
          title: "Não foi possível promover",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Admin adicionado!",
        description: `${adminEmail} agora é administrador.`,
      });

      setAddAdminOpen(false);
      setAdminEmail("");
      fetchAdmins();
    } catch {
      toast({ title: "Erro inesperado", variant: "destructive" });
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (adminUser: AdminUser) => {
    if (adminUser.role === "owner") {
      toast({
        title: "Não permitido",
        description: "Não é possível remover um owner.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.rpc("remove_admin", {
        target_user_id: adminUser.user_id,
      });

      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        toast({ title: "Erro", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: "Admin removido" });
      fetchAdmins();
    } catch {
      toast({ title: "Erro inesperado", variant: "destructive" });
    }
  };

  const statusBadge = (status: string, expiresAt: string) => {
    const isExpired = new Date(expiresAt) < new Date();
    if (status === "accepted") {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Aceito</Badge>;
    }
    if (status === "expired" || (status === "pending" && isExpired)) {
      return <Badge variant="secondary" className="text-muted-foreground">Expirado</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Pendente</Badge>;
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <img src={logoPratique} alt="TecForms" className="h-8 w-8 rounded-full" />
            <span className="text-xl font-display font-bold gradient-text">Admin</span>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Send Invite Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Enviar Convite
            </CardTitle>
            <CardDescription>
              Convide alguém para criar uma conta no TecForms. O convite expira em 7 dias.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendInvite} className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="invite-email" className="sr-only">E-mail</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="gradient-primary text-primary-foreground"
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Enviar
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Invitations Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Convites</CardTitle>
              <CardDescription>{invitations.length} convite(s)</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={fetchInvitations}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {loadingInvites ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum convite enviado ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.email}</TableCell>
                        <TableCell>{statusBadge(inv.status, inv.expires_at)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(inv.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(inv.expires_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Copiar link"
                              onClick={() => copyInviteLink(inv.token)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            {inv.status === "pending" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Reenviar"
                                  onClick={() => resendInvite(inv)}
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Revogar"
                                  onClick={() => revokeInvite(inv.id)}
                                >
                                  <Ban className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manage Admins Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Administradores
              </CardTitle>
              <CardDescription>Gerencie quem tem acesso de administrador.</CardDescription>
            </div>
            <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Adicionar Admin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Promover a Admin</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddAdmin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-email">E-mail do usuário</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      placeholder="usuario@email.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      O usuário precisa já ter uma conta (convite aceito).
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={addingAdmin}>
                    {addingAdmin ? <Loader2 className="h-4 w-4 animate-spin" /> : "Promover"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {admins.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum admin encontrado.</p>
            ) : (
              <div className="space-y-2">
                {admins.map((admin) => (
                  <div
                    key={admin.user_id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center">
                        <Shield className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{admin.email}</p>
                        <p className="text-xs text-muted-foreground">{admin.user_id.slice(0, 8)}...</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={admin.role === "owner" ? "default" : "secondary"}>
                        {admin.role === "owner" ? "Owner" : "Admin"}
                      </Badge>
                      {admin.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remover admin"
                          onClick={() => handleRemoveAdmin(admin)}
                        >
                          <Ban className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminInvites;
