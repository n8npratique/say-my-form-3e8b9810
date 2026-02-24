import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { ArrowLeft, Settings, CheckCircle2, XCircle, Loader2, Trash2, Mail, Phone, MessageCircle, MessageSquare, Globe, Link, Unlink, Plus } from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "America/São Paulo (BRT)" },
  { value: "America/Manaus", label: "America/Manaus (AMT)" },
  { value: "America/Bahia", label: "America/Bahia (BRT)" },
  { value: "America/Belem", label: "America/Belém (BRT)" },
  { value: "America/Fortaleza", label: "America/Fortaleza (BRT)" },
  { value: "America/Recife", label: "America/Recife (BRT)" },
  { value: "America/Cuiaba", label: "America/Cuiabá (AMT)" },
  { value: "America/Porto_Velho", label: "America/Porto Velho (AMT)" },
  { value: "America/Boa_Vista", label: "America/Boa Vista (AMT)" },
  { value: "America/Rio_Branco", label: "America/Rio Branco (ACT)" },
  { value: "America/Noronha", label: "America/Noronha (FNT)" },
];

type ConnectionStatus = "idle" | "loading" | "ok" | "error";

interface WorkspaceSettings {
  waha?: { url: string; api_key: string; session: string; default_number: string };
  email?: { provider: "google_oauth" | "resend"; resend_api_key?: string; sender_email?: string };
  unnichat?: { url: string; token?: string; phones: Array<{ label: string; phone_id: string; token: string }> };
  chatguru?: { key: string; account_id: string; phones: Array<{ telefone: string; phone_id: string }> };
  timezone?: string;
}

const WorkspaceSettings = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Workspace general
  const [workspaceName, setWorkspaceName] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Google OAuth Connections
  const [oauthConnections, setOauthConnections] = useState<{ id: string; google_email: string; created_at: string; user_id: string }[]>([]);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // Google Service Account
  const [serviceAccount, setServiceAccount] = useState<{ id: string; client_email: string; name: string } | null>(null);
  const [saJson, setSaJson] = useState("");
  const [savingSA, setSavingSA] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // WAHA
  const [wahaUrl, setWahaUrl] = useState("");
  const [wahaKey, setWahaKey] = useState("");
  const [wahaSession, setWahaSession] = useState("default");
  const [wahaNumber, setWahaNumber] = useState("");
  const [savingWaha, setSavingWaha] = useState(false);
  const [wahaStatus, setWahaStatus] = useState<ConnectionStatus>("idle");
  const [wahaStatusLabel, setWahaStatusLabel] = useState("");

  // Email
  const [emailProvider, setEmailProvider] = useState<"google_oauth" | "resend">("google_oauth");
  const [emailConnectionId, setEmailConnectionId] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Unnichat
  const [unnichatUrl, setUnnichatUrl] = useState("");
  const [unnichatPhones, setUnnichatPhones] = useState<Array<{ label: string; phone_id: string; token: string }>>([]);
  const [savingUnnichat, setSavingUnnichat] = useState(false);
  const [unnichatStatus, setUnnichatStatus] = useState<ConnectionStatus>("idle");

  // ChatGuru
  const [chatguruKey, setChatguruKey] = useState("");
  const [chatguruAccountId, setChatguruAccountId] = useState("");
  const [chatguruPhones, setChatguruPhones] = useState<Array<{ telefone: string; phone_id: string }>>([]);
  const [savingChatguru, setSavingChatguru] = useState(false);
  const [chatguruStatus, setChatguruStatus] = useState<ConnectionStatus>("idle");

  useEffect(() => {
    if (workspaceId) fetchAll();
  }, [workspaceId]);

  // Listen for OAuth popup callback (postMessage + localStorage fallback)
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === "google-oauth-callback" && event.data?.status === "success") {
        fetchOAuthConnections();
        toast({ title: "Conta Google conectada!", description: event.data.detail });
      }
    };
    const storageHandler = (event: StorageEvent) => {
      if (event.key === "google-oauth-result" && event.newValue) {
        try {
          const result = JSON.parse(event.newValue);
          if (result.status === "success") {
            fetchOAuthConnections();
            toast({ title: "Conta Google conectada!", description: result.detail });
          }
          localStorage.removeItem("google-oauth-result");
        } catch {}
      }
    };
    window.addEventListener("message", messageHandler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("message", messageHandler);
      window.removeEventListener("storage", storageHandler);
    };
  }, [workspaceId]);

  const fetchAll = async () => {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId!)
      .maybeSingle();

    if (ws) {
      setWorkspaceName(ws.name);
      const s = ((ws as any).settings as WorkspaceSettings) || {};

      // Fetch global settings as fallback for empty configs
      let g: any = {};
      if (!s.waha?.url || !s.chatguru?.key) {
        const { data: globalData } = await supabase.rpc("get_global_settings");
        if (globalData) {
          g = typeof globalData === "string" ? JSON.parse(globalData) : globalData;
        }
      }

      // Merge: workspace settings take priority, global as fallback
      const waha = s.waha?.url ? s.waha : g.waha;
      const chatguru = s.chatguru?.key ? s.chatguru : g.chatguru;

      if (waha) { setWahaUrl(waha.url); setWahaKey(waha.api_key); setWahaSession(waha.session || "default"); setWahaNumber(waha.default_number); }
      if (s.email) { setEmailProvider(s.email.provider === "resend" ? "resend" : "google_oauth"); setResendKey(s.email.resend_api_key || ""); setSenderEmail(s.email.sender_email || ""); setEmailConnectionId((s.email as any).google_connection_id || ""); }
      if (s.unnichat) {
        setUnnichatUrl(s.unnichat.url);
        setUnnichatPhones(s.unnichat.phones?.length ? s.unnichat.phones : (s.unnichat.token ? [{ label: "Principal", phone_id: "", token: s.unnichat.token }] : []));
      }
      if (chatguru) { setChatguruKey(chatguru.key || ""); setChatguruAccountId(chatguru.account_id || ""); setChatguruPhones(chatguru.phones || []); }
      if (s.timezone) setTimezone(s.timezone);
    }

    const { data: sa } = await supabase
      .from("google_service_accounts")
      .select("id, client_email, name")
      .eq("workspace_id", workspaceId!)
      .maybeSingle();
    if (sa) setServiceAccount(sa);

    await fetchOAuthConnections();
  };

  const fetchOAuthConnections = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth", {
        body: { action: "status", workspace_id: workspaceId },
      });
      if (!error && data?.connections) {
        setOauthConnections(data.connections);
      }
    } catch {
      // silently fail — OAuth might not be deployed yet
    }
  };

  const connectGoogleOAuth = async () => {
    setConnectingOAuth(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth", {
        body: { action: "authorize", workspace_id: workspaceId },
      });
      if (error) throw error;
      if (data?.authorization_url) {
        // Open as popup
        const w = 500, h = 600;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        const popup = window.open(
          data.authorization_url,
          "google-oauth",
          `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
        );
        // Poll: when popup closes, refresh connections
        if (popup) {
          const poll = setInterval(() => {
            if (popup.closed) {
              clearInterval(poll);
              fetchOAuthConnections();
            }
          }, 500);
        }
      }
    } catch (err: any) {
      toast({ title: "Erro ao conectar", description: err.message, variant: "destructive" });
    }
    setConnectingOAuth(false);
  };

  const disconnectGoogleOAuth = async (connectionId: string) => {
    setDisconnectingId(connectionId);
    try {
      const { error } = await supabase.functions.invoke("google-oauth", {
        body: { action: "disconnect", connection_id: connectionId },
      });
      if (error) throw error;
      setOauthConnections((prev) => prev.filter((c) => c.id !== connectionId));
      toast({ title: "Conta Google desconectada" });
    } catch (err: any) {
      toast({ title: "Erro ao desconectar", description: err.message, variant: "destructive" });
    }
    setDisconnectingId(null);
  };

  // ── Google Service Account ──────────────────────────────────────────────────
  const handleSAFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSaJson(ev.target?.result as string);
    reader.readAsText(file);
  };

  const saveServiceAccount = async () => {
    setSavingSA(true);
    try {
      const parsed = JSON.parse(saJson);
      const clientEmail: string = parsed.client_email;
      const privateKey: string = parsed.private_key;
      if (!clientEmail || !privateKey) throw new Error("JSON inválido: campos client_email ou private_key ausentes");

      if (serviceAccount) {
        await supabase.from("google_service_accounts").delete().eq("id", serviceAccount.id);
      }

      const { data, error } = await supabase.from("google_service_accounts").insert({
        workspace_id: workspaceId!,
        name: clientEmail,
        client_email: clientEmail,
        encrypted_key: privateKey,
      }).select("id, client_email, name").single();
      if (error) throw error;
      toast({ title: "Service Account salva!" });
      setSaJson("");
      if (data) setServiceAccount(data);
      else fetchAll();
    } catch (err: unknown) {
      toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    }
    setSavingSA(false);
  };

  const removeServiceAccount = async () => {
    if (!serviceAccount) return;
    await supabase.from("google_service_accounts").delete().eq("id", serviceAccount.id);
    setServiceAccount(null);
    toast({ title: "Service Account removida" });
  };

  // ── WAHA ───────────────────────────────────────────────────────────────────
  const testWaha = async (url: string, key: string, session: string): Promise<"ok" | "session_not_found" | "error"> => {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/api/sessions`, {
        headers: key ? { "X-Api-Key": key } : {},
      });
      if (!res.ok) return "error";
      const data = await res.json();
      // WAHA returns an array of sessions
      const sessions: { name?: string }[] = Array.isArray(data) ? data : (data.sessions ?? []);
      const found = sessions.some((s) => s.name === session);
      return found ? "ok" : "session_not_found";
    } catch {
      return "error";
    }
  };

  const saveWaha = async () => {
    setSavingWaha(true);
    setWahaStatus("loading");
    setWahaStatusLabel("");
    const result = await testWaha(wahaUrl, wahaKey, wahaSession);

    if (result === "ok") {
      setWahaStatus("ok");
      setWahaStatusLabel(`Conectado — session: ${wahaSession}`);
    } else if (result === "session_not_found") {
      setWahaStatus("idle"); // use idle to show yellow badge separately
      setWahaStatusLabel(`Session não encontrada: ${wahaSession}`);
    } else {
      setWahaStatus("error");
      setWahaStatusLabel("Erro de conexão");
    }

    const { data: ws } = await supabase.from("workspaces").select("*").eq("id", workspaceId!).maybeSingle();
    const current = ((ws as any)?.settings as WorkspaceSettings) || {};
    await supabase.from("workspaces").update({
      settings: { ...current, waha: { url: wahaUrl, api_key: wahaKey, session: wahaSession, default_number: wahaNumber } },
    } as any).eq("id", workspaceId!);

    const toastMsg = result === "ok"
      ? "WAHA salvo e conectado!"
      : result === "session_not_found"
      ? "WAHA salvo, mas session não encontrada"
      : "WAHA salvo, mas conexão falhou";
    toast({ title: toastMsg, variant: result === "ok" ? "default" : "destructive" });
    setSavingWaha(false);
  };

  // ── Email ──────────────────────────────────────────────────────────────────
  const saveEmail = async () => {
    setSavingEmail(true);
    const { data: ws } = await supabase.from("workspaces").select("*").eq("id", workspaceId!).maybeSingle();
    const current = ((ws as any)?.settings as WorkspaceSettings) || {};
    await supabase.from("workspaces").update({
      settings: {
        ...current,
        email: emailProvider === "google_oauth"
          ? { provider: "google_oauth", google_connection_id: emailConnectionId || undefined }
          : { provider: "resend", resend_api_key: resendKey || undefined, sender_email: senderEmail },
      },
    } as any).eq("id", workspaceId!);
    toast({ title: "Configuração de email salva!" });
    setSavingEmail(false);
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    toast({ title: "Email de teste enviado", description: `Para: ${user?.email}` });
    setSendingTest(false);
  };

  // ── Unnichat ───────────────────────────────────────────────────────────────
  const testUnnichat = async (url: string, token: string): Promise<boolean> => {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/tags/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "contact" }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const saveUnnichat = async () => {
    setSavingUnnichat(true);
    setUnnichatStatus("loading");
    const firstToken = unnichatPhones[0]?.token || "";
    const ok = firstToken ? await testUnnichat(unnichatUrl, firstToken) : false;
    setUnnichatStatus(ok ? "ok" : "error");

    const { data: ws } = await supabase.from("workspaces").select("*").eq("id", workspaceId!).maybeSingle();
    const current = ((ws as any)?.settings as WorkspaceSettings) || {};
    await supabase.from("workspaces").update({
      settings: { ...current, unnichat: { url: unnichatUrl, phones: unnichatPhones.filter((p) => p.phone_id || p.token) } },
    } as any).eq("id", workspaceId!);

    toast({ title: ok ? "Unnichat salvo e conectado!" : "Unnichat salvo, mas conexão falhou", variant: ok ? "default" : "destructive" });
    setSavingUnnichat(false);
  };

  // ── ChatGuru ─────────────────────────────────────────────────────────────
  const saveChatguru = async () => {
    setSavingChatguru(true);
    setChatguruStatus("loading");

    const { data: ws } = await supabase.from("workspaces").select("*").eq("id", workspaceId!).maybeSingle();
    const current = ((ws as any)?.settings as WorkspaceSettings) || {};
    await supabase.from("workspaces").update({
      settings: { ...current, chatguru: { key: chatguruKey, account_id: chatguruAccountId, phones: chatguruPhones.filter((p) => p.phone_id) } },
    } as any).eq("id", workspaceId!);

    setChatguruStatus(chatguruKey && chatguruAccountId ? "ok" : "error");
    toast({ title: "ChatGuru salvo!" });
    setSavingChatguru(false);
  };

  // ── General ────────────────────────────────────────────────────────────────
  const saveGeneral = async () => {
    setSavingGeneral(true);
    const { data: ws } = await supabase.from("workspaces").select("*").eq("id", workspaceId!).maybeSingle();
    const current = ((ws as any)?.settings as WorkspaceSettings) || {};

    await supabase.from("workspaces").update({
      name: workspaceName,
      settings: { ...current, timezone },
    } as any).eq("id", workspaceId!);

    toast({ title: "Configurações gerais salvas!" });
    setSavingGeneral(false);
  };

  // ── Status badge helper ────────────────────────────────────────────────────
  const StatusBadge = ({ status, label }: { status: ConnectionStatus; label?: string }) => {
    if (status === "loading") return <Badge variant="secondary" className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Testando…</Badge>;
    if (status === "ok") return <Badge className="flex items-center gap-1 bg-[hsl(var(--success,142_71%_45%))] text-white border-0"><CheckCircle2 className="h-3 w-3" /> {label || "Conectado"}</Badge>;
    if (status === "error") return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> {label || "Erro de conexão"}</Badge>;
    // idle but with label = session not found — use warning tone via CSS var
    if (status === "idle" && label) return <Badge variant="outline" className="flex items-center gap-1 border-[hsl(var(--warning,45_93%_47%))] text-[hsl(var(--warning,45_93%_47%))]"><XCircle className="h-3 w-3" /> {label}</Badge>;
    return null;
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08 } }),
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center h-16 gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/workspace/${workspaceId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 hover:opacity-80 transition">
            <img src={logoPratique} alt="TecForms" className="h-7 w-7 rounded-full" />
            <span className="font-display font-bold gradient-text">TecForms</span>
          </button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => navigate(`/workspace/${workspaceId}`)} className="font-medium hover:text-primary transition-colors">
            {workspaceName}
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium flex items-center gap-1.5">
            <Settings className="h-4 w-4" /> Configurações
          </span>
        </div>
      </header>

      <main className="container py-8 max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Configurações do Workspace</h1>
          <p className="text-muted-foreground mt-1">Integrações e preferências deste workspace</p>
        </div>

        {/* ── Google OAuth Connections ── */}
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <svg viewBox="0 0 48 48" className="h-5 w-5" fill="none">
                      <path d="M43.6 20.5H42V20H24v8h11.3C34 32.7 29.5 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.4 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.5-.4-3.5z" fill="#FFC107"/>
                      <path d="M6.3 14.7l6.6 4.8C14.7 16 19.1 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.4 7 29.5 4.5 24 4.5c-7.7 0-14.4 4.4-17.7 10.2z" fill="#FF3D00"/>
                      <path d="M24 44c5.4 0 10.2-2 13.8-5.3l-6.4-5.4C29.4 35 26.8 36 24 36c-5.4 0-10.1-3.3-11.8-8.1l-6.6 5.1C8.9 39.6 16 44 24 44z" fill="#4CAF50"/>
                      <path d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.4 5.4C37.3 39 44 34 44 24c0-1.2-.1-2.5-.4-3.5z" fill="#1976D2"/>
                    </svg>
                  </div>
                  <div>
                    <CardTitle className="text-base">Contas Google Conectadas</CardTitle>
                    <CardDescription className="text-xs">OAuth2 — planilhas e eventos no seu Drive/Calendar pessoal</CardDescription>
                  </div>
                </div>
                {oauthConnections.length > 0 ? (
                  <Badge className="flex items-center gap-1 bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] border-0">
                    <CheckCircle2 className="h-3 w-3" /> {oauthConnections.length} conta{oauthConnections.length > 1 ? "s" : ""}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Nenhuma conta</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Connected accounts list */}
              {oauthConnections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{conn.google_email}</p>
                      <p className="text-xs text-muted-foreground">Conectada via OAuth</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => disconnectGoogleOAuth(conn.id)}
                    disabled={disconnectingId === conn.id}
                  >
                    {disconnectingId === conn.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Unlink className="h-4 w-4 mr-1" /> Desconectar</>
                    )}
                  </Button>
                </div>
              ))}

              <Button
                className="w-full gradient-primary text-primary-foreground"
                onClick={connectGoogleOAuth}
                disabled={connectingOAuth}
              >
                {connectingOAuth ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link className="h-4 w-4 mr-2" />
                )}
                Conectar nova conta Google
              </Button>

              <p className="text-xs text-muted-foreground">
                Conecte sua conta Google para que planilhas e eventos sejam criados diretamente no seu Drive e Calendar pessoal.
                Você pode conectar múltiplas contas e escolher qual usar em cada formulário.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Google Service Account ── */}
        <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <svg viewBox="0 0 48 48" className="h-5 w-5" fill="none">
                      <path d="M43.6 20.5H42V20H24v8h11.3C34 32.7 29.5 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.4 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.5-.4-3.5z" fill="#FFC107"/>
                      <path d="M6.3 14.7l6.6 4.8C14.7 16 19.1 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.4 7 29.5 4.5 24 4.5c-7.7 0-14.4 4.4-17.7 10.2z" fill="#FF3D00"/>
                      <path d="M24 44c5.4 0 10.2-2 13.8-5.3l-6.4-5.4C29.4 35 26.8 36 24 36c-5.4 0-10.1-3.3-11.8-8.1l-6.6 5.1C8.9 39.6 16 44 24 44z" fill="#4CAF50"/>
                      <path d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.4 5.4C37.3 39 44 34 44 24c0-1.2-.1-2.5-.4-3.5z" fill="#1976D2"/>
                    </svg>
                  </div>
                  <div>
                    <CardTitle className="text-base">Google Service Account</CardTitle>
                    <CardDescription className="text-xs">Para Google Sheets, Gmail e Google Calendar</CardDescription>
                  </div>
                </div>
                {serviceAccount ? (
                  <Badge className="flex items-center gap-1 bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] border-0">
                    <CheckCircle2 className="h-3 w-3" /> Conectado
                  </Badge>
                ) : (
                  <Badge variant="secondary">Não configurado</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {serviceAccount ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div>
                    <p className="text-sm font-medium">{serviceAccount.client_email}</p>
                    <p className="text-xs text-muted-foreground">Service Account ativa</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={removeServiceAccount}>
                    <Trash2 className="h-4 w-4 mr-1" /> Remover
                  </Button>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Cole o JSON da Service Account ou faça upload do arquivo</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    Escolher arquivo .json
                  </Button>
                  <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleSAFile} />
                  {saJson && <Badge variant="secondary">JSON carregado</Badge>}
                </div>
                <Textarea
                  placeholder='{ "type": "service_account", "client_email": "...", "private_key": "..." }'
                  value={saJson}
                  onChange={(e) => setSaJson(e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Crie uma Service Account em{" "}
                <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                  console.cloud.google.com
                </a>{" "}
                e faça o download do arquivo JSON de credenciais.
              </p>

              <Button
                className="gradient-primary text-primary-foreground"
                disabled={!saJson || savingSA}
                onClick={saveServiceAccount}
              >
                {savingSA && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Service Account
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── WhatsApp WAHA ── */}
        <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <Phone className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">WhatsApp — WAHA</CardTitle>
                    <CardDescription className="text-xs">Envio de mensagens via WhatsApp API</CardDescription>
                  </div>
                </div>
                <StatusBadge status={wahaStatus} label={wahaStatusLabel} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="waha-url">URL da API WAHA</Label>
                <Input id="waha-url" placeholder="https://seu-waha.com" value={wahaUrl} onChange={(e) => setWahaUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="waha-key">API Key</Label>
                <Input id="waha-key" type="password" placeholder="••••••••" value={wahaKey} onChange={(e) => setWahaKey(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="waha-session">Session</Label>
                <Input id="waha-session" placeholder="default" value={wahaSession} onChange={(e) => setWahaSession(e.target.value)} />
                <p className="text-xs text-muted-foreground">Nome da session no WAHA. Use &quot;default&quot; se tiver apenas uma.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="waha-number">Número padrão de envio <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input id="waha-number" placeholder="+5511999999999" value={wahaNumber} onChange={(e) => setWahaNumber(e.target.value)} />
                <p className="text-xs text-muted-foreground">Opcional. Número que receberá notificações quando alguém responder um formulário.</p>
              </div>
              <Button className="gradient-primary text-primary-foreground" disabled={!wahaUrl || savingWaha} onClick={saveWaha}>
                {savingWaha && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar e Testar Conexão
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Email ── */}
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                  <Mail className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Envio de Email</CardTitle>
                  <CardDescription className="text-xs">Configuração do provedor de email</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-provider">Provedor</Label>
                <Select value={emailProvider} onValueChange={(v) => setEmailProvider(v as "google_oauth" | "resend")}>
                  <SelectTrigger id="email-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google_oauth">Google OAuth (conectado)</SelectItem>
                    <SelectItem value="resend">Resend (domínio próprio)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {emailProvider === "google_oauth" ? (
                <div className="space-y-3">
                  {oauthConnections.length > 0 ? (
                    <div className="space-y-2">
                      <Label>Conta de envio</Label>
                      <Select value={emailConnectionId} onValueChange={setEmailConnectionId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a conta Google" />
                        </SelectTrigger>
                        <SelectContent>
                          {oauthConnections.map((conn) => (
                            <SelectItem key={conn.id} value={conn.id}>
                              {conn.google_email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Emails serão enviados a partir desta conta Google via Gmail API.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-yellow-600">
                      Nenhuma conta Google conectada. Conecte uma conta na seção acima.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resend-key">API Key do Resend</Label>
                    <Input id="resend-key" type="password" placeholder="re_••••••••" value={resendKey} onChange={(e) => setResendKey(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sender-email">Email remetente</Label>
                    <Input id="sender-email" type="email" placeholder="avisos@suaempresa.com" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                      Requer domínio verificado no Resend
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button className="gradient-primary text-primary-foreground" disabled={savingEmail} onClick={saveEmail}>
                  {savingEmail && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
                <Button variant="outline" disabled={sendingTest} onClick={sendTestEmail}>
                  {sendingTest && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enviar email de teste
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Unnichat ── */}
        <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Unnichat</CardTitle>
                    <CardDescription className="text-xs">CRM, WhatsApp e automações</CardDescription>
                  </div>
                </div>
                <StatusBadge status={unnichatStatus} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="unnichat-url">URL da API</Label>
                <Input id="unnichat-url" placeholder="https://unnichat.com.br/api" value={unnichatUrl} onChange={(e) => setUnnichatUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefones</Label>
                <p className="text-xs text-muted-foreground">
                  Cada telefone possui seu próprio Bearer token e phone_id no Unnichat.
                </p>
                {unnichatPhones.map((phone, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      className="w-28"
                      placeholder="Label (ex: ...8494)"
                      value={phone.label}
                      onChange={(e) => {
                        const phones = [...unnichatPhones];
                        phones[i] = { ...phone, label: e.target.value };
                        setUnnichatPhones(phones);
                      }}
                    />
                    <Input
                      className="flex-1"
                      placeholder="phone_id (UUID)"
                      value={phone.phone_id}
                      onChange={(e) => {
                        const phones = [...unnichatPhones];
                        phones[i] = { ...phone, phone_id: e.target.value };
                        setUnnichatPhones(phones);
                      }}
                    />
                    <Input
                      className="flex-1"
                      type="password"
                      placeholder="Bearer Token"
                      value={phone.token}
                      onChange={(e) => {
                        const phones = [...unnichatPhones];
                        phones[i] = { ...phone, token: e.target.value };
                        setUnnichatPhones(phones);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setUnnichatPhones(unnichatPhones.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1"
                  onClick={() => setUnnichatPhones([...unnichatPhones, { label: "", phone_id: "", token: "" }])}
                >
                  <Plus className="h-4 w-4" /> Adicionar telefone
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O Unnichat será usado para criar contatos, enviar WhatsApp, gerenciar tags e CRM automaticamente.
              </p>
              <Button className="gradient-primary text-primary-foreground" disabled={!unnichatUrl || savingUnnichat} onClick={saveUnnichat}>
                {savingUnnichat && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar e Testar Conexão
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── ChatGuru ── */}
        <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">ChatGuru</CardTitle>
                    <CardDescription className="text-xs">WhatsApp Business via ChatGuru</CardDescription>
                  </div>
                </div>
                <StatusBadge status={chatguruStatus} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="chatguru-key">API Key</Label>
                <Input id="chatguru-key" type="password" placeholder="••••••••" value={chatguruKey} onChange={(e) => setChatguruKey(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chatguru-account">Account ID</Label>
                <Input id="chatguru-account" placeholder="ID da conta ChatGuru" value={chatguruAccountId} onChange={(e) => setChatguruAccountId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefones</Label>
                <p className="text-xs text-muted-foreground">
                  Cadastre os telefones vinculados à conta ChatGuru com seus respectivos phone_id.
                </p>
                {chatguruPhones.map((phone, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      placeholder="Telefone (ex: +5511999...)"
                      value={phone.telefone}
                      onChange={(e) => {
                        const phones = [...chatguruPhones];
                        phones[i] = { ...phone, telefone: e.target.value };
                        setChatguruPhones(phones);
                      }}
                    />
                    <Input
                      className="flex-1"
                      placeholder="phone_id"
                      value={phone.phone_id}
                      onChange={(e) => {
                        const phones = [...chatguruPhones];
                        phones[i] = { ...phone, phone_id: e.target.value };
                        setChatguruPhones(phones);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setChatguruPhones(chatguruPhones.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1"
                  onClick={() => setChatguruPhones([...chatguruPhones, { telefone: "", phone_id: "" }])}
                >
                  <Plus className="h-4 w-4" /> Adicionar telefone
                </Button>
              </div>
              <Button className="gradient-primary text-primary-foreground" disabled={!chatguruKey || !chatguruAccountId || savingChatguru} onClick={saveChatguru}>
                {savingChatguru && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Geral ── */}
        <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                  <Globe className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Geral</CardTitle>
                  <CardDescription className="text-xs">Nome e fuso horário do workspace</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ws-name">Nome do workspace</Label>
                <Input id="ws-name" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Fuso horário</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="gradient-primary text-primary-foreground" disabled={savingGeneral} onClick={saveGeneral}>
                {savingGeneral && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default WorkspaceSettings;
