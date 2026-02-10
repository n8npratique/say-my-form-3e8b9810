import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Zap, GitBranch, BarChart3 } from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";
import { useEffect } from "react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]" style={{ background: "var(--gradient-primary)" }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-15 blur-[100px]" style={{ background: "var(--gradient-secondary)" }} />
      </div>

      {/* Nav */}
      <nav className="relative z-10 container flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-primary" />
          <span className="text-2xl font-display font-bold gradient-text">TecForms</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/auth")}>Entrar</Button>
          <Button className="gradient-primary text-primary-foreground" onClick={() => navigate("/auth")}>
            Começar grátis
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 container pt-20 pb-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto"
        >
          <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight mb-6">
            Formulários que{" "}
            <span className="gradient-text">conversam</span>{" "}
            com seu público
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Crie formulários conversacionais com lógica condicional, loops dinâmicos e integrações.
            Tudo visual, sem código.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button
              size="lg"
              className="gradient-primary text-primary-foreground font-semibold h-12 px-8 text-lg"
              onClick={() => navigate("/auth")}
            >
              Começar agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid md:grid-cols-3 gap-8 mt-24 max-w-4xl mx-auto"
        >
          {[
            {
              icon: Zap,
              title: "Builder Visual",
              desc: "Arraste, solte e configure perguntas com preview em tempo real.",
              gradient: "gradient-primary",
            },
            {
              icon: GitBranch,
              title: "Lógica Condicional",
              desc: "Crie fluxos inteligentes que se adaptam às respostas.",
              gradient: "gradient-secondary",
            },
            {
              icon: BarChart3,
              title: "Resultados e Exports",
              desc: "Painel de respostas, export CSV e integração com Google Sheets.",
              gradient: "gradient-warm",
            },
          ].map((feature, i) => (
            <div key={i} className="text-center p-6">
              <div className={`h-14 w-14 rounded-2xl ${feature.gradient} flex items-center justify-center mx-auto mb-4`}>
                <feature.icon className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-display font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm">{feature.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
};

export default Index;
