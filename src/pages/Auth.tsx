import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, ArrowRight, KeyRound, ShieldAlert, Loader2 } from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";

type AuthMode = "login" | "signup" | "forgot" | "reset";

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading]);

  // Invite system
  const inviteToken = searchParams.get("invite");
  const [inviteValid, setInviteValid] = useState<boolean | null>(null); // null = loading
  const [inviteChecked, setInviteChecked] = useState(false);

  // Listen for PASSWORD_RECOVERY event (user clicked reset link)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!inviteToken) {
      setInviteChecked(true);
      setInviteValid(false);
      return;
    }

    // Validate invite token
    const checkInvite = async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("email, status, expires_at")
        .eq("token", inviteToken)
        .maybeSingle();

      if (error || !data) {
        setInviteValid(false);
        setInviteChecked(true);
        return;
      }

      const isExpired = new Date(data.expires_at) < new Date();
      const isPending = data.status === "pending";

      if (isPending && !isExpired) {
        setInviteValid(true);
        setEmail(data.email);
        setMode("signup");
      } else {
        setInviteValid(false);
      }
      setInviteChecked(true);
    };

    checkInvite();
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast({
          title: "Senha atualizada!",
          description: "Sua senha foi redefinida com sucesso.",
        });
        navigate("/dashboard");
        return;
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast({
          title: "E-mail enviado!",
          description: "Verifique sua caixa de entrada para redefinir a senha.",
        });
        setMode("login");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({
          title: "Cadastro realizado!",
          description: "Verifique seu e-mail para confirmar a conta.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
      setGoogleLoading(false);
    }
  };

  // Can only signup with valid invite
  const canSignup = inviteToken && inviteValid;

  const title = mode === "reset" ? "Nova senha" : mode === "forgot" ? "Recuperar senha" : mode === "login" ? "Entrar" : "Criar conta";
  const description = mode === "reset"
    ? "Defina sua nova senha"
    : mode === "forgot"
      ? "Informe seu e-mail para receber o link de redefinição"
      : mode === "login"
        ? "Entre para gerenciar seus formulários"
        : "Crie sua conta com o convite recebido";

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <img src={logoPratique} alt="TecForms" className="h-14 w-14 rounded-full" />
               <h1 className="text-5xl font-display font-bold text-primary-foreground">
                TecForms
              </h1>
            </div>
            <p className="text-xl text-primary-foreground/80 max-w-md">
              Crie formulários conversacionais incríveis com lógica condicional, loops e integrações.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <img src={logoPratique} alt="TecForms" className="h-10 w-10 rounded-full" />
            <h1 className="text-3xl font-display font-bold gradient-text">TecForms</h1>
          </div>

          {/* Invalid/expired invite alert */}
          {inviteToken && inviteChecked && !inviteValid && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3"
            >
              <ShieldAlert className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">Convite inválido ou expirado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Solicite um novo convite ao administrador.
                </p>
              </div>
            </motion.div>
          )}

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-display">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <AnimatePresence mode="wait">
                  {mode === "signup" && (
                    <motion.div
                      key="name"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="name">Nome completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="name"
                          type="text"
                          placeholder="Seu nome"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="pl-10"
                          required={mode === "signup"}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {mode !== "reset" && (
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                        readOnly={mode === "signup" && !!canSignup}
                      />
                    </div>
                  </div>
                )}

                {mode !== "forgot" && (
                  <div className="space-y-2">
                    <Label htmlFor="password">{mode === "reset" ? "Nova senha" : "Senha"}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                )}

                {mode === "login" && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                    >
                      <KeyRound className="h-3 w-3" />
                      Esqueci minha senha
                    </button>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full gradient-primary text-primary-foreground font-semibold h-11"
                  disabled={loading}
                >
                  {loading
                    ? "Carregando..."
                    : mode === "reset"
                      ? "Salvar nova senha"
                      : mode === "forgot"
                        ? "Enviar link de redefinição"
                        : mode === "login"
                          ? "Entrar"
                          : "Criar conta"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>

              {(mode === "login" || mode === "signup") && (
                <div className="mt-5">
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">ou</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 font-semibold"
                    onClick={handleGoogleLogin}
                    disabled={googleLoading}
                  >
                    {googleLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    )}
                    {mode === "login" ? "Entrar com Google" : "Cadastrar com Google"}
                  </Button>
                </div>
              )}

              <div className="mt-6 text-center space-y-2">
                {mode === "reset" ? null : mode === "forgot" ? (
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Voltar para login
                  </button>
                ) : canSignup ? (
                  <button
                    type="button"
                    onClick={() => setMode(mode === "login" ? "signup" : "login")}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {mode === "login" ? "Usar convite para cadastrar" : "Já tem conta? Entre"}
                  </button>
                ) : mode === "signup" ? (
                  // Got here somehow without invite — go back to login
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Já tem conta? Entre
                  </button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;
