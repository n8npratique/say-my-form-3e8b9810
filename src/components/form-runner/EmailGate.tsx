import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import type { FormTheme } from "@/lib/formTheme";

interface EmailGateProps {
  formName: string;
  onSubmit: (email: string) => void;
  themeStyle?: React.CSSProperties;
  theme?: FormTheme;
}

export const EmailGate = ({ formName, onSubmit, themeStyle, theme }: EmailGateProps) => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Insira um e-mail válido");
      return;
    }
    onSubmit(email);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-4"
      style={themeStyle}
    >
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <Sparkles className="h-8 w-8 mx-auto" style={{ color: theme?.button_color || "hsl(var(--primary))" }} />
          <h1 className="text-2xl font-bold">{formName}</h1>
          <p style={{ color: theme?.text_secondary_color || "hsl(var(--muted-foreground))" }}>Insira seu e-mail para começar</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              className="text-center text-lg h-12"
              autoFocus
            />
            {error && <p className="text-destructive text-sm mt-1">{error}</p>}
          </div>
          <Button
            type="submit"
            className="w-full h-12"
            style={{
              backgroundColor: theme?.button_color || "hsl(var(--primary))",
              color: theme?.button_text_color || "hsl(var(--primary-foreground))",
            }}
          >
            Começar <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </form>
      </div>
    </motion.div>
  );
};
