import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface EmailGateProps {
  formName: string;
  onSubmit: (email: string) => void;
}

export const EmailGate = ({ formName, onSubmit }: EmailGateProps) => {
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
      className="min-h-screen flex items-center justify-center bg-background p-4"
    >
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <Sparkles className="h-8 w-8 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">{formName}</h1>
          <p className="text-muted-foreground">Insira seu e-mail para começar</p>
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
          <Button type="submit" className="w-full gradient-primary text-primary-foreground h-12">
            Começar <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </form>
      </div>
    </motion.div>
  );
};
