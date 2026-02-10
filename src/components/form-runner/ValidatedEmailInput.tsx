import { useState } from "react";
import { Input } from "@/components/ui/input";
import { validateEmail } from "@/lib/countries";

interface ValidatedEmailInputProps {
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

export const ValidatedEmailInput = ({ value, onChange, onKeyDown, autoFocus, placeholder }: ValidatedEmailInputProps) => {
  const [touched, setTouched] = useState(false);

  const validation = value ? validateEmail(value) : { valid: false };
  const showError = touched && value.length > 0 && !validation.valid;

  return (
    <div className="space-y-1">
      <Input
        type="email"
        placeholder={placeholder || "seunome@provedor.com"}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          const result = validateEmail(v);
          onChange(v, result.valid);
        }}
        onBlur={() => setTouched(true)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        className={`text-lg h-14 border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 ${showError ? "border-red-500 focus-visible:border-red-500" : "focus-visible:border-primary"}`}
      />
      <p className="text-xs opacity-40" style={{ color: "var(--runner-text-secondary)" }}>
        Ex: joao.silva@gmail.com
      </p>
      {showError && validation.error && (
        <p className="text-xs text-red-500 font-medium">{validation.error}</p>
      )}
    </div>
  );
};
