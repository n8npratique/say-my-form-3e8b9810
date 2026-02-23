import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Star, ArrowRight, Check, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { FormField, ContactFieldKey, FieldTranslation } from "@/types/workflow";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { FieldMedia } from "./FieldMedia";
import { PhoneInput } from "./PhoneInput";
import { ValidatedEmailInput } from "./ValidatedEmailInput";
import { AppointmentPicker } from "./AppointmentPicker";
import { validateEmail } from "@/lib/countries";

interface RunnerFieldProps {
  field: FormField;
  index: number;
  total: number;
  onAnswer: (value: any) => void;
  formId?: string;
  locale?: Locale;
  fieldTranslation?: FieldTranslation;
}

export const RunnerField = ({ field, index, total, onAnswer, formId, locale, fieldTranslation }: RunnerFieldProps) => {
  const [value, setValue] = useState<any>("");
  const [checkboxValues, setCheckboxValues] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [contactValues, setContactValues] = useState<Record<string, string>>({});
  const [contactValidation, setContactValidation] = useState<Record<string, boolean>>({});
  const [contactTouched, setContactTouched] = useState<Record<string, boolean>>({});
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");
  const [cepResolved, setCepResolved] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const [emailValid, setEmailValid] = useState(false);

  const i = t(locale);
  const displayLabel = fieldTranslation?.label || field.label;
  const displayPlaceholder = fieldTranslation?.placeholder || field.placeholder;
  const displayOptions = fieldTranslation?.options || field.options;

  const formatCpf = (raw: string): string => {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const formatCep = (raw: string): string => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const validateCpf = (masked: string): boolean => {
    const digits = masked.replace(/\D/g, "");
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;
    for (let t = 9; t <= 10; t++) {
      let sum = 0;
      for (let i = 0; i < t; i++) sum += Number(digits[i]) * (t + 1 - i);
      const remainder = (sum * 10) % 11;
      if ((remainder === 10 ? 0 : remainder) !== Number(digits[t])) return false;
    }
    return true;
  };

  const fetchCep = useCallback(async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    setCepError("");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepError("CEP não encontrado");
        setCepResolved("");
      } else {
        const addr = [data.logradouro, data.bairro].filter(Boolean).join(", ");
        const full = addr ? `${addr} - ${data.localidade}/${data.uf}` : `${data.localidade}/${data.uf}`;
        setCepResolved(full);
        const activeFields = field.contact_fields || ["first_name", "email"];
        if (activeFields.includes("address" as ContactFieldKey)) {
          setContactValues(prev => ({ ...prev, address: full }));
        }
      }
    } catch {
      setCepError("Erro ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  }, [field.contact_fields]);

  const CONTACT_LABELS: Record<ContactFieldKey, string> = {
    first_name: i.contactFirstName,
    last_name: i.contactLastName,
    email: i.contactEmail,
    phone: i.contactPhone,
    cpf: i.contactCpf,
    cep: i.contactCep,
    address: i.contactAddress,
  };

  const submit = () => {
    if (field.type === "contact_info") {
      onAnswer(contactValues);
    } else if (field.type === "checkbox" || field.type === "ranking") {
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
    if (field.type === "contact_info") {
      const activeFields = field.contact_fields || ["first_name", "email"];
      return activeFields.every(f => {
        if (!contactValues[f]?.trim()) return false;
        if (f === "email" || f === "phone" || f === "cpf") {
          return contactValidation[f] !== false;
        }
        return true;
      });
    }
    if (field.type === "checkbox" || field.type === "ranking") return checkboxValues.length > 0;
    if (field.type === "rating") return rating > 0;
    if (field.type === "phone") return phoneValid;
    if (field.type === "email") return emailValid;
    if (field.type === "appointment") return !!value && !!value.slot_start;
    return !!value;
  };

  const renderInput = () => {
    switch (field.type) {
      case "contact_info": {
        const activeFields = field.contact_fields || ["first_name", "email"];
        return (
          <div className="space-y-4">
            {activeFields.map((key) => (
              <div key={key} className="space-y-1">
                <Label className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>
                  {CONTACT_LABELS[key]}
                </Label>
                {key === "cpf" ? (
                  <>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={contactValues[key] || ""}
                      onChange={(e) => {
                        const formatted = formatCpf(e.target.value);
                        setContactValues(prev => ({ ...prev, [key]: formatted }));
                        const digits = formatted.replace(/\D/g, "");
                        if (digits.length === 11) {
                          setContactValidation(prev => ({ ...prev, cpf: validateCpf(formatted) }));
                        } else {
                          setContactValidation(prev => ({ ...prev, cpf: false }));
                        }
                      }}
                      onBlur={() => setContactTouched(prev => ({ ...prev, cpf: true }))}
                      maxLength={14}
                      className={`text-lg h-12 border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary ${contactTouched.cpf && contactValidation.cpf === false && (contactValues.cpf || "").replace(/\D/g, "").length === 11 ? "!border-red-500" : ""}`}
                    />
                    {contactTouched.cpf && contactValidation.cpf === false && (contactValues.cpf || "").replace(/\D/g, "").length === 11 && (
                      <p className="text-xs text-red-500">CPF inválido</p>
                    )}
                  </>
                ) : key === "cep" ? (
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="00000-000"
                      value={contactValues[key] || ""}
                      onChange={(e) => {
                        const formatted = formatCep(e.target.value);
                        setContactValues(prev => ({ ...prev, [key]: formatted }));
                        const digits = formatted.replace(/\D/g, "");
                        if (digits.length === 8) fetchCep(digits);
                      }}
                      maxLength={9}
                      className={`text-lg h-12 border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary ${cepError ? "!border-red-500" : ""}`}
                    />
                    {cepLoading && (
                      <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {cepError && <p className="text-xs text-red-500">{cepError}</p>}
                    {cepResolved && !cepError && (
                      <p className="text-xs text-green-600 mt-1">{cepResolved}</p>
                    )}
                  </div>
                ) : key === "phone" ? (
                  <PhoneInput
                    value={contactValues[key] || ""}
                    onChange={(v, valid) => {
                      setContactValues(prev => ({ ...prev, [key]: v }));
                      setContactValidation(prev => ({ ...prev, phone: valid }));
                    }}
                  />
                ) : key === "email" ? (
                  <ValidatedEmailInput
                    value={contactValues[key] || ""}
                    onChange={(v, valid) => {
                      setContactValues(prev => ({ ...prev, [key]: v }));
                      setContactValidation(prev => ({ ...prev, email: valid }));
                    }}
                    placeholder={i.emailGatePlaceholder}
                  />
                ) : (
                  <Input
                    type="text"
                    placeholder={CONTACT_LABELS[key]}
                    value={contactValues[key] || ""}
                    onChange={(e) => setContactValues(prev => ({ ...prev, [key]: e.target.value }))}
                    className="text-lg h-12 border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary"
                  />
                )}
              </div>
            ))}
          </div>
        );
      }
      case "email":
        return (
          <ValidatedEmailInput
            value={value}
            onChange={(v, valid) => { setValue(v); setEmailValid(valid); }}
            onKeyDown={(e) => e.key === "Enter" && canSubmit() && submit()}
            placeholder={displayPlaceholder}
            autoFocus
          />
        );

      case "phone":
        return (
          <PhoneInput
            value={value}
            onChange={(v, valid) => { setValue(v); setPhoneValid(valid); }}
            onKeyDown={(e) => e.key === "Enter" && canSubmit() && submit()}
            autoFocus
          />
        );

      case "short_text":
      case "website":
      case "number":
      case "address":
        return (
          <div className="space-y-1">
            <Input
              type={field.type === "number" ? "number" : "text"}
              placeholder={displayPlaceholder || i.typeYourAnswer}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit() && submit()}
              className="text-lg h-14 border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              autoFocus
            />
            {field.type === "website" && (
              <p className="text-xs opacity-40" style={{ color: "var(--runner-text-secondary)" }}>{i.websiteExample}</p>
            )}
            {field.type === "number" && (
              <p className="text-xs opacity-40" style={{ color: "var(--runner-text-secondary)" }}>{i.numberExample}</p>
            )}
          </div>
        );

      case "long_text":
        return (
          <Textarea
            placeholder={displayPlaceholder || i.typeYourAnswer}
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
            {(displayOptions || []).map((opt, i) => (
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
            {(displayOptions || []).map((opt, i) => (
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
            {[i.yes, i.no].map((opt) => (
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
              <span>{i.notLikely}</span>
              <span>{i.veryLikely}</span>
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

      case "appointment":
        return formId ? (
          <AppointmentPicker
            field={field}
            formId={formId}
            onSelect={(val) => setValue(val)}
            locale={locale}
          />
        ) : null;

      case "statement":
      case "welcome_screen":
      case "end_screen":
        return null;

      default:
        return (
          <Input
            placeholder={i.typeYourAnswer}
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
          {index + 1} {i.questionOf} {total}
        </p>
        <h2 className="text-2xl font-bold">
          {displayLabel || `Pergunta ${index + 1}`}
        </h2>
        {displayPlaceholder && field.type === "statement" && (
          <p style={{ color: "var(--runner-text-secondary)" }}>{displayPlaceholder}</p>
        )}
      </div>

      {renderInput()}

      <Button
        onClick={submit}
        disabled={!isPassthrough && !canSubmit()}
        style={{ backgroundColor: "var(--runner-btn-bg)", color: "var(--runner-btn-text)" }}
      >
        {isPassthrough ? i.continue : i.ok} <Check className="h-4 w-4 ml-1" />
      </Button>
    </motion.div>
  );
};
