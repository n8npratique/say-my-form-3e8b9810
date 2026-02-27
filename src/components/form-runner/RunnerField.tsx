import { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Star, ArrowRight, Check, Loader2, FileUp, X, FileText, Image as ImageIcon } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import type { FormField, ContactFieldKey, FieldTranslation } from "@/types/workflow";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { FieldMedia } from "./FieldMedia";
import { PhoneInput } from "./PhoneInput";
import { ValidatedEmailInput } from "./ValidatedEmailInput";
import { AppointmentPicker } from "./AppointmentPicker";
import { validateEmail } from "@/lib/countries";
import { resolveAnswerPiping } from "@/lib/answerPiping";

interface RunnerFieldProps {
  field: FormField;
  index: number;
  total: number;
  onAnswer: (value: any) => void;
  formId?: string;
  locale?: Locale;
  fieldTranslation?: FieldTranslation;
  answers?: Record<string, any>;
  allFields?: FormField[];
}

export const RunnerField = ({ field, index, total, onAnswer, formId, locale, fieldTranslation, answers, allFields }: RunnerFieldProps) => {
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
  const [uploadedFile, setUploadedFile] = useState<{ name: string; url: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const i = t(locale);
  const rawLabel = fieldTranslation?.label || field.label;
  const rawPlaceholder = fieldTranslation?.placeholder || field.placeholder;
  const displayOptions = fieldTranslation?.options || field.options;

  // Apply answer piping to label and statement placeholder
  const displayLabel = answers && allFields ? resolveAnswerPiping(rawLabel, answers, allFields) : rawLabel;
  const displayPlaceholder = answers && allFields && rawPlaceholder
    ? resolveAnswerPiping(rawPlaceholder, answers, allFields)
    : rawPlaceholder;

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
    } else if (field.type === "file_upload") {
      onAnswer(uploadedFile ? { file_name: uploadedFile.name, file_url: uploadedFile.url, file_size: uploadedFile.size } : value);
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
    if (field.type === "file_upload") return !!uploadedFile;
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
              <motion.label
                key={i}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${value === opt ? "border-primary bg-primary/5 shadow-elevation-2" : "border-border hover:border-primary/40"}`}
              >
                <RadioGroupItem value={opt} />
                <span className="text-sm font-medium">{opt}</span>
              </motion.label>
            ))}
          </RadioGroup>
        );

      case "checkbox":
      case "ranking":
        return (
          <div className="space-y-3">
            {field.type === "ranking" && (
              <p className="text-xs" style={{ color: "var(--runner-text-secondary)" }}>Selecione as opções na ordem de preferência</p>
            )}
            {(displayOptions || []).map((opt, i) => (
              <motion.label
                key={opt}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${checkboxValues.includes(opt) ? "border-primary bg-primary/5 shadow-elevation-2" : "border-border hover:border-primary/40"}`}
              >
                <Checkbox
                  checked={checkboxValues.includes(opt)}
                  onCheckedChange={(checked) => {
                    setCheckboxValues(prev =>
                      checked ? [...prev, opt] : prev.filter(v => v !== opt)
                    );
                  }}
                />
                {field.type === "ranking" && checkboxValues.includes(opt) && (
                  <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                    {checkboxValues.indexOf(opt) + 1}
                  </span>
                )}
                <span className="text-sm font-medium">{opt}</span>
              </motion.label>
            ))}
          </div>
        );

      case "image_choice":
        return (
          <RadioGroup value={value} onValueChange={(v) => setValue(v)} className="grid grid-cols-2 gap-3">
            {(displayOptions || []).map((opt, i) => (
              <motion.label
                key={opt}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all text-center ${value === opt ? "border-primary bg-primary/5 shadow-elevation-2" : "border-border hover:border-primary/40"}`}
              >
                <RadioGroupItem value={opt} className="sr-only" />
                <ImageIcon className="h-8 w-8" style={{ color: "var(--runner-text-secondary)" }} />
                <span className="text-sm font-medium">{opt}</span>
              </motion.label>
            ))}
          </RadioGroup>
        );

      case "redirect_url":
        return (
          <p style={{ color: "var(--runner-text-secondary)" }} className="text-sm">
            {field.placeholder || "Redirecionando..."}
          </p>
        );

      case "matrix":
      case "question_group":
        return (
          <p className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>
            Este tipo de campo será suportado em breve.
          </p>
        );

      case "yes_no":
      case "legal":
        return (
          <div className="flex gap-3">
            {[i.yes, i.no].map((opt) => (
              <Button
                key={opt}
                variant={value === opt ? "default" : "outline"}
                className={`flex-1 h-14 text-lg btn-lift ${value === opt ? "shadow-elevation-2" : ""}`}
                onClick={() => { setValue(opt); }}
              >
                {opt}
              </Button>
            ))}
          </div>
        );

      case "rating":
        return (
          <div className="flex gap-3 justify-center">
            {[1, 2, 3, 4, 5].map((n) => (
              <motion.button
                key={n}
                onClick={() => setRating(n)}
                whileHover={{ scale: 1.2, y: -4 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="transition-colors"
              >
                <Star
                  className={`h-10 w-10 transition-colors duration-200 ${n <= rating ? "fill-yellow-400 text-yellow-400 drop-shadow-[0_2px_8px_rgba(250,204,21,0.4)]" : "text-muted-foreground/40 hover:text-yellow-300"}`}
                />
              </motion.button>
            ))}
          </div>
        );

      case "nps":
        return (
          <div className="space-y-2">
            <div className="flex gap-1 justify-center flex-wrap">
              {Array.from({ length: 11 }, (_, i) => (
                <motion.button
                  key={i}
                  onClick={() => setValue(i)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.92 }}
                  className={`w-11 h-11 rounded-lg border-2 text-sm font-medium transition-colors ${value === i ? "bg-primary text-primary-foreground border-primary shadow-elevation-2" : "border-border hover:border-primary/50"}`}
                >
                  {i}
                </motion.button>
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
              <motion.button
                key={n}
                onClick={() => setValue(n)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
                className={`w-14 h-14 rounded-lg border-2 text-lg font-medium transition-colors ${value === n ? "bg-primary text-primary-foreground border-primary shadow-elevation-2" : "border-border hover:border-primary/50"}`}
              >
                {n}
              </motion.button>
            ))}
          </div>
        );

      case "file_upload": {
        const acceptedTypes = field.accepted_file_types || [];
        const maxSizeMb = field.max_file_size_mb || 10;
        const acceptAttr = acceptedTypes.length > 0 ? acceptedTypes.join(",") : undefined;

        const handleFile = async (file: File) => {
          setUploadError("");
          // Validate size
          if (file.size > maxSizeMb * 1024 * 1024) {
            setUploadError(`Arquivo muito grande. Máximo: ${maxSizeMb}MB`);
            return;
          }
          // Validate type
          if (acceptedTypes.length > 0) {
            const ext = "." + file.name.split(".").pop()?.toLowerCase();
            if (!acceptedTypes.includes(ext)) {
              setUploadError(`Tipo não aceito. Permitidos: ${acceptedTypes.join(", ")}`);
              return;
            }
          }
          setUploading(true);
          try {
            const path = `uploads/${formId || "unknown"}/${crypto.randomUUID()}-${file.name}`;
            const { error } = await supabase.storage.from("form-assets").upload(path, file, { upsert: true });
            if (error) throw error;
            const { data } = supabase.storage.from("form-assets").getPublicUrl(path);
            setUploadedFile({ name: file.name, url: data.publicUrl, size: file.size });
          } catch (err: any) {
            setUploadError(err.message || "Erro ao enviar arquivo");
          } finally {
            setUploading(false);
          }
        };

        const handleDrop = (e: React.DragEvent) => {
          e.preventDefault();
          setDragActive(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        };

        const isImage = uploadedFile?.name.match(/\.(png|jpg|jpeg|webp|gif)$/i);

        return (
          <div className="space-y-3">
            {!uploadedFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  dragActive ? "border-primary bg-primary/5 shadow-elevation-2 scale-[1.01]" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/[0.02]"
                }`}
              >
                {uploading ? (
                  <div className="space-y-2">
                    <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                    <p className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>Enviando...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FileUp className="h-8 w-8 mx-auto" style={{ color: "var(--runner-text-secondary)" }} />
                    <p className="text-sm font-medium">Arraste um arquivo ou clique para selecionar</p>
                    <p className="text-xs" style={{ color: "var(--runner-text-secondary)" }}>
                      {acceptedTypes.length > 0
                        ? `Aceitos: ${acceptedTypes.map(t => t.replace(".", "").toUpperCase()).join(", ")}`
                        : "Todos os tipos de arquivo"}
                      {` — Máx. ${maxSizeMb}MB`}
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptAttr}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-xl border bg-muted/30">
                {isImage ? (
                  <ImageIcon className="h-8 w-8 text-blue-500 shrink-0" />
                ) : (
                  <FileText className="h-8 w-8 text-primary shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                  <p className="text-xs" style={{ color: "var(--runner-text-secondary)" }}>
                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={() => { setUploadedFile(null); setUploadError(""); }}
                  className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-destructive/10 transition"
                >
                  <X className="h-4 w-4 text-destructive" />
                </button>
              </div>
            )}
            {uploadError && (
              <p className="text-sm text-red-500">{uploadError}</p>
            )}
          </div>
        );
      }

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

  const isPassthrough = ["statement", "welcome_screen", "end_screen", "redirect_url"].includes(field.type);

  const springTransition = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -30, y: -5, scale: 0.98 }}
      transition={springTransition}
      className="w-full max-w-xl mx-auto space-y-8"
    >
      <FieldMedia field={field} />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springTransition, delay: 0.05 }}
        className="space-y-2"
      >
        <p className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>
          {index + 1} {i.questionOf} {total}
        </p>
        <h2 className="text-2xl font-bold">
          {displayLabel || `Pergunta ${index + 1}`}
        </h2>
        {displayPlaceholder && field.type === "statement" && (
          <p style={{ color: "var(--runner-text-secondary)" }}>{displayPlaceholder}</p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springTransition, delay: 0.15 }}
      >
        {renderInput()}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springTransition, delay: 0.25 }}
      >
        <Button
          onClick={submit}
          disabled={!isPassthrough && !canSubmit()}
          className="btn-lift shadow-elevation-2 hover:shadow-elevation-3"
          style={{ backgroundColor: "var(--runner-btn-bg)", color: "var(--runner-btn-text)" }}
        >
          {isPassthrough ? i.continue : i.ok} <Check className="h-4 w-4 ml-1" />
        </Button>
      </motion.div>
    </motion.div>
  );
};
