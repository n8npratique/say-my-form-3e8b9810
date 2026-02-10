import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Star, ArrowRight, Check } from "lucide-react";
import { motion } from "framer-motion";
import type { FormField } from "@/components/form-editor/FieldItem";
import { FieldMedia } from "./FieldMedia";

interface RunnerFieldProps {
  field: FormField;
  index: number;
  total: number;
  onAnswer: (value: any) => void;
}

export const RunnerField = ({ field, index, total, onAnswer }: RunnerFieldProps) => {
  const [value, setValue] = useState<any>("");
  const [checkboxValues, setCheckboxValues] = useState<string[]>([]);
  const [rating, setRating] = useState(0);

  const submit = () => {
    if (field.type === "checkbox" || field.type === "ranking") {
      onAnswer(checkboxValues);
    } else if (field.type === "rating") {
      onAnswer(rating);
    } else if (field.type === "nps" || field.type === "opinion_scale") {
      onAnswer(value);
    } else {
      onAnswer(value);
    }
  };

  const canSubmit = () => {
    if (!field.required) return true;
    if (field.type === "checkbox" || field.type === "ranking") return checkboxValues.length > 0;
    if (field.type === "rating") return rating > 0;
    return !!value;
  };

  const renderInput = () => {
    switch (field.type) {
      case "short_text":
      case "email":
      case "phone":
      case "website":
      case "number":
      case "address":
        return (
          <Input
            type={field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "phone" ? "tel" : "text"}
            placeholder={field.placeholder || "Digite sua resposta..."}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit() && submit()}
            className="text-lg h-14 border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            autoFocus
          />
        );

      case "long_text":
        return (
          <Textarea
            placeholder={field.placeholder || "Digite sua resposta..."}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-lg min-h-[120px] border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary resize-none"
            autoFocus
          />
        );

      case "date":
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-lg h-14 border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            autoFocus
          />
        );

      case "multiple_choice":
      case "dropdown":
        return (
          <RadioGroup value={value} onValueChange={(v) => { setValue(v); }} className="space-y-3">
            {(field.options || []).map((opt, i) => (
              <label
                key={i}
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all hover:border-primary ${value === opt ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <RadioGroupItem value={opt} />
                <span className="text-sm font-medium">{opt}</span>
              </label>
            ))}
          </RadioGroup>
        );

      case "checkbox":
        return (
          <div className="space-y-3">
            {(field.options || []).map((opt, i) => (
              <label
                key={i}
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all hover:border-primary ${checkboxValues.includes(opt) ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <Checkbox
                  checked={checkboxValues.includes(opt)}
                  onCheckedChange={(checked) => {
                    setCheckboxValues(prev =>
                      checked ? [...prev, opt] : prev.filter(v => v !== opt)
                    );
                  }}
                />
                <span className="text-sm font-medium">{opt}</span>
              </label>
            ))}
          </div>
        );

      case "yes_no":
      case "legal":
        return (
          <div className="flex gap-3">
            {["Sim", "Não"].map((opt) => (
              <Button
                key={opt}
                variant={value === opt ? "default" : "outline"}
                className="flex-1 h-14 text-lg"
                onClick={() => { setValue(opt); }}
              >
                {opt}
              </Button>
            ))}
          </div>
        );

      case "rating":
        return (
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className="transition-all hover:scale-110"
              >
                <Star
                  className={`h-10 w-10 ${n <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                />
              </button>
            ))}
          </div>
        );

      case "nps":
        return (
          <div className="space-y-2">
            <div className="flex gap-1 justify-center flex-wrap">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setValue(i)}
                  className={`w-11 h-11 rounded-lg border text-sm font-medium transition-all ${value === i ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"}`}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span>Nada provável</span>
              <span>Muito provável</span>
            </div>
          </div>
        );

      case "opinion_scale":
        return (
          <div className="flex gap-2 justify-center flex-wrap">
            {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setValue(n)}
                className={`w-14 h-14 rounded-lg border text-lg font-medium transition-all ${value === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"}`}
              >
                {n}
              </button>
            ))}
          </div>
        );

      case "statement":
      case "welcome_screen":
      case "end_screen":
        return null;

      default:
        return (
          <Input
            placeholder="Digite sua resposta..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit() && submit()}
            className="text-lg h-14 border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            autoFocus
          />
        );
    }
  };

  const isPassthrough = ["statement", "welcome_screen", "end_screen"].includes(field.type);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-xl mx-auto space-y-8"
    >
      <FieldMedia field={field} />

      <div className="space-y-2">
      <p className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>
          {index + 1} → {total}
        </p>
        <h2 className="text-2xl font-bold">
          {field.label || `Pergunta ${index + 1}`}
        </h2>
        {field.placeholder && field.type === "statement" && (
          <p style={{ color: "var(--runner-text-secondary)" }}>{field.placeholder}</p>
        )}
      </div>

      {renderInput()}

      <Button
        onClick={submit}
        disabled={!isPassthrough && !canSubmit()}
        style={{ backgroundColor: "var(--runner-btn-bg)", color: "var(--runner-btn-text)" }}
      >
        {isPassthrough ? "Continuar" : "OK"} <Check className="h-4 w-4 ml-1" />
      </Button>
    </motion.div>
  );
};
