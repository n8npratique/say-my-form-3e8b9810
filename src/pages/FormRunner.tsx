import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { EmailGate } from "@/components/form-runner/EmailGate";
import { RunnerField } from "@/components/form-runner/RunnerField";
import { WelcomeScreen } from "@/components/form-runner/WelcomeScreen";
import { CheckCircle2, Trophy, AlertTriangle } from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";
import { AnimatePresence, motion } from "framer-motion";
import type { FormField, FieldTranslation } from "@/types/workflow";
import type { FieldLogic, ScoringConfig, TaggingConfig, OutcomesConfig, FormSchema } from "@/types/workflow";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { getNextFieldId, calculateScore, collectTags, determineOutcome } from "@/lib/logicEngine";
import type { FormTheme, WelcomeScreen as WelcomeScreenType } from "@/lib/formTheme";
import { DEFAULT_THEME, getThemeStyle, loadGoogleFont } from "@/lib/formTheme";

const FormRunner = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [allFields, setAllFields] = useState<FormField[]>([]);   // ALL fields incl. end_screen
  const [fields, setFields] = useState<FormField[]>([]);         // answerable fields only
  const [logic, setLogic] = useState<FieldLogic[]>([]);
  const [scoring, setScoring] = useState<ScoringConfig | null>(null);
  const [tagging, setTagging] = useState<TaggingConfig | null>(null);
  const [outcomesConfig, setOutcomesConfig] = useState<OutcomesConfig | null>(null);
  const [theme, setTheme] = useState<FormTheme>(DEFAULT_THEME);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  const [fieldTranslationsMap, setFieldTranslationsMap] = useState<Record<string, FieldTranslation>>({});
  const [formId, setFormId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<"public" | "email_required">("public");
  const [emailCollected, setEmailCollected] = useState(false);
  const [respondentEmail, setRespondentEmail] = useState<string | null>(null);
  const [currentFieldId, setCurrentFieldId] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [dedupConfig, setDedupConfig] = useState<{ enabled: boolean; fields: string[] } | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const answersRef = useRef<Record<string, any>>({});

  // Outcome result
  const [outcomeLabel, setOutcomeLabel] = useState<string | null>(null);
  const [outcomeDesc, setOutcomeDesc] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<{ score: number; label?: string } | null>(null);
  // Conditional end screen
  const [endScreen, setEndScreen] = useState<FormField | null>(null);

  useEffect(() => {
    if (slug) loadForm();
  }, [slug]);

  useEffect(() => {
    loadGoogleFont(theme.font_family);
  }, [theme.font_family]);

  const loadForm = async () => {
    const { data: form, error: formErr } = await supabase
      .from("forms")
      .select("id, name, settings, published_version_id, status")
      .eq("slug", slug!)
      .maybeSingle();

    if (formErr || !form) {
      setError("Formulário não encontrado.");
      setLoading(false);
      return;
    }

    if (form.status !== "published" || !form.published_version_id) {
      setError("Este formulário não está publicado.");
      setLoading(false);
      return;
    }

    setFormId(form.id);
    setFormName(form.name);
    setVersionId(form.published_version_id);
    const settings = form.settings as any;
    setAccessMode(settings?.access_mode || "public");
    if (settings?.dedup) setDedupConfig(settings.dedup);

    const { data: version } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("id", form.published_version_id)
      .maybeSingle();

    if (version) {
      const schema = version.schema as any as FormSchema;
      if (schema?.fields) {
        const allF: FormField[] = schema.fields;
        setAllFields(allF);
        // Answerable fields: exclude end_screen and welcome_screen types
        const answerable = allF.filter(
          (f) => f.type !== "end_screen" && f.type !== "welcome_screen"
        );
        setFields(answerable);
        setCurrentFieldId(answerable[0]?.id || null);
      }
      if (schema?.logic) setLogic(schema.logic);
      if (schema?.scoring?.enabled) setScoring(schema.scoring);
      if (schema?.tagging?.enabled) setTagging(schema.tagging);
      if (schema?.outcomes?.enabled) setOutcomesConfig(schema.outcomes);
      if (schema?.theme) setTheme(schema.theme);
      if (schema?.locale) {
        setLocale(schema.locale);
        // Load field translations for the active locale
        if (schema.field_translations?.[schema.locale]) {
          setFieldTranslationsMap(schema.field_translations[schema.locale]);
        }
      }
      if (schema?.theme?.welcome_screen?.enabled) setShowWelcome(true);
    }

    setLoading(false);
  };

  const startResponse = async (email?: string) => {
    if (!formId || !versionId) return;
    const meta = email ? { respondent_email: email } : {};
    const { data } = await supabase
      .from("responses")
      .insert({
        form_id: formId,
        form_version_id: versionId,
        status: "in_progress",
        meta: meta as any,
      })
      .select("id, session_token")
      .single();
    if (data) {
      setResponseId(data.id);
      setSessionToken((data as any).session_token);
      // Fire webhooks for response.started (best-effort)
      try {
        await supabase.functions.invoke("fire-webhooks", {
          body: { form_id: formId, response_id: data.id, session_token: (data as any).session_token, event: "response.started" },
        });
      } catch {
        // silent fail
      }
    }
  };

  const handleEmailSubmit = async (email: string) => {
    setRespondentEmail(email);
    setEmailCollected(true);
    await startResponse(email);
  };

  useEffect(() => {
    if (!loading && accessMode === "public" && !responseId && fields.length > 0) {
      startResponse();
    }
  }, [loading, accessMode, fields]);

  const completeForm = async () => {
    if (!responseId || !formId) return;

    // Check for duplicates
    if (dedupConfig?.enabled && dedupConfig.fields.length > 0) {
      const checks: { field_key: string; value: string }[] = [];
      for (const [fieldId, value] of Object.entries(answersRef.current)) {
        const field = fields.find((f) => f.id === fieldId);
        if (!field || !value) continue;
        const fieldType = field.type?.toLowerCase();
        // Match field type to dedup field
        if (
          (dedupConfig.fields.includes("email") && (fieldType === "email" || fieldType === "email_input")) ||
          (dedupConfig.fields.includes("phone") && (fieldType === "phone" || fieldType === "phone_input")) ||
          (dedupConfig.fields.includes("name") && (fieldType === "short_text" || fieldType === "name" || fieldType === "text_input") && field.label?.toLowerCase().includes("nome"))
        ) {
          checks.push({ field_key: fieldId, value: String(value) });
        }
      }

      if (checks.length > 0) {
        try {
          const { data } = await supabase.functions.invoke("check-duplicate", {
            body: { form_id: formId, checks },
          });
          if (data?.duplicate) {
            const fieldLabel = fields.find((f) => f.id === data.field)?.label || data.field;
            setDuplicateError(`Já recebemos uma resposta com este ${fieldLabel}. Não é permitido enviar respostas duplicadas.`);
            return;
          }
        } catch {
          // If check fails, allow submission
        }
      }
    }

    const meta: any = {};

    // Extract respondent email from answers (find first email field)
    for (const field of fields) {
      const ft = field.type?.toLowerCase();
      if (ft === "email" || ft === "email_input") {
        const val = answersRef.current[field.id];
        if (val && typeof val === "string" && val.includes("@")) {
          meta.respondent_email = val;
          break;
        }
      }
    }

    // Calculate scoring
    if (scoring) {
      const score = calculateScore(answersRef.current, scoring.field_scores);
      const range = scoring.ranges.find((r) => score >= r.min && score <= r.max);
      meta.score = score;
      meta.score_range = range?.label || null;
      setScoreResult({ score, label: range?.label });
    }

    // Collect tags
    if (tagging) {
      const tags = collectTags(answersRef.current, tagging.field_tags);
      meta.tags = tags;
    }

    // Determine outcome
    if (outcomesConfig) {
      const outcomeId = determineOutcome(answersRef.current, outcomesConfig.field_outcomes);
      if (outcomeId) {
        const def = outcomesConfig.definitions.find((d) => d.id === outcomeId);
        meta.outcome_id = outcomeId;
        meta.outcome_label = def?.label;
        setOutcomeLabel(def?.label || null);
        setOutcomeDesc(def?.description || null);

        // Resolve end screen from outcome (priority 1)
        if (def?.end_screen_id) {
          const es = allFields.find((f) => f.id === def.end_screen_id);
          if (es) setEndScreen(es);
        }
      }
    }

    // Resolve end screen from score range (priority 2, only if not set by outcome)
    if (scoring) {
      const score = meta.score ?? 0;
      const range = scoring.ranges.find((r) => score >= r.min && score <= r.max);
      if (range?.end_screen_id) {
        const es = allFields.find((f) => f.id === range.end_screen_id);
        if (es) setEndScreen((prev) => prev ?? es); // don't override outcome's end screen
      }
    }

    await supabase
      .from("responses")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        meta: meta as any,
      })
      .eq("id", responseId)
      .eq("session_token", sessionToken);

    setCompleted(true);

    // 1) Fire webhooks (fire-and-forget, independent)
    supabase.functions.invoke("fire-webhooks", {
      body: { form_id: formId, response_id: responseId, session_token: sessionToken, event: "response.completed" },
    }).catch(() => {});

    // 2) Fire delivery integrations first, collect results
    const integrationResults = await Promise.allSettled([
      supabase.functions.invoke("send-email", {
        body: { form_id: formId, response_id: responseId },
      }),
      supabase.functions.invoke("send-whatsapp", {
        body: { form_id: formId, response_id: responseId },
      }),
      supabase.functions.invoke("create-calendar-event", {
        body: { form_id: formId, response_id: responseId },
      }),
      supabase.functions.invoke("sync-unnichat", {
        body: { form_id: formId, response_id: responseId },
      }),
    ]).catch(() => []) as PromiseSettledResult<any>[] | [];

    // 3) Parse integration statuses for the Sheets log
    const integrationNames = ["email", "whatsapp", "calendar", "unnichat"];
    const integrationStatus: Record<string, string> = {};
    for (let i = 0; i < integrationNames.length; i++) {
      const result = (integrationResults as any[])?.[i];
      if (!result) continue;
      if (result.status === "fulfilled") {
        const d = result.value?.data;
        if (d?.sent || d?.synced || d?.created || d?.success) {
          integrationStatus[integrationNames[i]] = "ok";
        } else if (d?.reason === "not_configured" || d?.reason === "no_templates" || d?.reason === "no_phone") {
          // Not configured = skip, don't log
        } else {
          integrationStatus[integrationNames[i]] = "erro";
        }
      } else {
        integrationStatus[integrationNames[i]] = "erro";
      }
    }

    // 4) Save integration status to response meta
    if (Object.keys(integrationStatus).length > 0) {
      const { data: freshResp } = await supabase
        .from("responses")
        .select("meta")
        .eq("id", responseId)
        .maybeSingle();
      const freshMeta = (freshResp?.meta as any) || {};
      await supabase
        .from("responses")
        .update({ meta: { ...freshMeta, integration_status: integrationStatus } as any })
        .eq("id", responseId)
        .eq("session_token", sessionToken);
    }

    // 5) Sync to Google Sheets LAST (so it captures integration status)
    supabase.functions.invoke("sync-google-sheets", {
      body: { form_id: formId, response_id: responseId },
    }).catch(() => {});
  };

  const formatValueText = (val: any): string => {
    if (val == null) return "";
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === "object") {
      // Name-like fields: {first_name, last_name, phone, ...}
      if (val.first_name || val.last_name) {
        const name = [val.first_name, val.last_name].filter(Boolean).join(" ");
        const extra = Object.entries(val)
          .filter(([k]) => !["first_name", "last_name"].includes(k))
          .map(([, v]) => v)
          .filter(Boolean);
        return extra.length > 0 ? `${name} | ${extra.join(" | ")}` : name;
      }
      // Address-like: {street, city, state, zip, ...}
      if (val.street || val.city) {
        return Object.values(val).filter(Boolean).join(", ");
      }
      // Generic object: join values with separator
      return Object.values(val).filter(Boolean).join(" | ");
    }
    return String(val);
  };

  const handleAnswer = async (value: any) => {
    if (!responseId || !currentFieldId) return;
    const field = fields.find((f) => f.id === currentFieldId);
    if (!field) return;

    answersRef.current[field.id] = value;

    // Save answer
    await supabase.from("response_answers").insert({
      response_id: responseId,
      field_key: field.id,
      value: value as any,
      value_text: formatValueText(value),
    });

    setAnsweredCount((prev) => prev + 1);

    // Evaluate logic for next field
    const nextId = getNextFieldId(currentFieldId, value, logic, fields.map((f) => f.id));

    if (nextId === "end") {
      await completeForm();
      return;
    }

    if (nextId) {
      // Jump to specific field
      const idx = fields.findIndex((f) => f.id === nextId);
      if (idx >= 0) {
        setCurrentFieldId(nextId);
        return;
      }
    }

    // Default: next sequential field
    const currentIdx = fields.findIndex((f) => f.id === currentFieldId);
    if (currentIdx < fields.length - 1) {
      setCurrentFieldId(fields[currentIdx + 1].id);
    } else {
      await completeForm();
    }
  };

  const themeStyle = getThemeStyle(theme);
  const hasOverlay = theme.background_image && theme.background_overlay && theme.background_overlay > 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={themeStyle}>
        <img src={logoPratique} alt="Carregando" className="h-8 w-8 rounded-full animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={themeStyle}>
        <div className="text-center space-y-2">
          <img src={logoPratique} alt="" className="h-8 w-8 mx-auto rounded-full" />
          <p style={{ color: theme.text_secondary_color }}>{error}</p>
        </div>
      </div>
    );
  }

  if (accessMode === "email_required" && !emailCollected) {
    return <EmailGate formName={formName} onSubmit={handleEmailSubmit} themeStyle={themeStyle} theme={theme} locale={locale} />;
  }

  if (showWelcome && theme.welcome_screen?.enabled) {
    return (
      <AnimatePresence mode="wait">
        <WelcomeScreen
          formName={formName}
          theme={theme}
          welcome={theme.welcome_screen}
          onStart={() => setShowWelcome(false)}
        />
      </AnimatePresence>
    );
  }

  if (duplicateError) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-screen flex items-center justify-center p-4 relative"
        style={themeStyle}
      >
        {hasOverlay && (
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.background_overlay})` }} />
        )}
        <div className="text-center space-y-4 max-w-md relative z-10">
          <AlertTriangle className="h-16 w-16 mx-auto text-yellow-500" />
          <h1 className="text-2xl font-bold">{t(locale).duplicateTitle}</h1>
          <p style={{ color: theme.text_secondary_color }}>{duplicateError}</p>
        </div>
      </motion.div>
    );
  }

  if (completed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-screen flex items-center justify-center p-4 relative"
        style={themeStyle}
      >
        {hasOverlay && (
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.background_overlay})` }} />
        )}
        <div className="text-center space-y-4 max-w-md relative z-10">
          {endScreen ? (
            /* ── Conditional End Screen ── */
            <>
              {endScreen.media_url && (
                <img
                  src={endScreen.media_url}
                  alt=""
                  className="w-full max-h-48 object-contain rounded-xl mb-2"
                />
              )}
              <CheckCircle2 className="h-14 w-14 mx-auto" style={{ color: theme.button_color }} />
              <h1 className="text-2xl font-bold">{endScreen.label || t(locale).thankYou}</h1>
              {endScreen.placeholder && (
                <p style={{ color: theme.text_secondary_color }}>{endScreen.placeholder}</p>
              )}
              {(endScreen as any).button_text && (endScreen as any).button_url && (
                <a
                  href={(endScreen as any).button_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 px-6 py-2 rounded-lg font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: theme.button_color, color: theme.button_text_color }}
                >
                  {(endScreen as any).button_text}
                </a>
              )}
            </>
          ) : outcomeLabel ? (
            /* ── Outcome (no specific end screen) ── */
            <>
              <Trophy className="h-16 w-16 mx-auto" style={{ color: theme.button_color }} />
              <h1 className="text-2xl font-bold">{outcomeLabel}</h1>
              {outcomeDesc && <p style={{ color: theme.text_secondary_color }}>{outcomeDesc}</p>}
            </>
          ) : (
            /* ── Default thank-you screen ── */
            <>
              <CheckCircle2 className="h-16 w-16 mx-auto" style={{ color: theme.button_color }} />
              <h1 className="text-2xl font-bold">{t(locale).thankYou}</h1>
              <p style={{ color: theme.text_secondary_color }}>{t(locale).responseSent}</p>
            </>
          )}

          {/* Score card — always shown when scoring is active */}
          {scoreResult && (
            <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: `${theme.button_color}15`, border: `1px solid ${theme.button_color}30` }}>
              <p className="text-sm" style={{ color: theme.text_secondary_color }}>{t(locale).yourScore}</p>
              <p className="text-3xl font-bold" style={{ color: theme.button_color }}>{scoreResult.score}</p>
              {scoreResult.label && <p className="text-sm" style={{ color: theme.text_secondary_color }}>{scoreResult.label}</p>}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  const currentField = fields.find((f) => f.id === currentFieldId);
  const currentIdx = fields.findIndex((f) => f.id === currentFieldId);
  const progress = fields.length > 0 ? (answeredCount / fields.length) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col relative" style={themeStyle}>
      {hasOverlay && (
        <div className="absolute inset-0 z-0" style={{ backgroundColor: `rgba(0,0,0,${theme.background_overlay})` }} />
      )}
      <div className="sticky top-0 z-50 backdrop-blur-sm" style={{ backgroundColor: `${theme.background_color}CC` }}>
        <Progress value={progress} className="h-1 rounded-none" />
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <AnimatePresence mode="wait">
          {currentField && (
            <RunnerField
              key={currentField.id}
              field={currentField}
              index={currentIdx}
              total={fields.length}
              onAnswer={handleAnswer}
              formId={formId || undefined}
              locale={locale}
              fieldTranslation={fieldTranslationsMap[currentField.id]}
            />
          )}
        </AnimatePresence>
      </div>

      <footer className="p-4 text-center relative z-10">
        <div className="flex items-center justify-center gap-1 text-xs" style={{ color: theme.text_secondary_color }}>
          <img src={logoPratique} alt="TecForms" className="h-4 w-4 rounded-full" />
          <span>TecForms</span>
        </div>
      </footer>
    </div>
  );
};

export default FormRunner;
