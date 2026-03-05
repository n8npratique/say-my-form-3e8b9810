import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
// Progress bar is now custom (motion.div) — shadcn Progress removed
import { EmailGate } from "@/components/form-runner/EmailGate";
import { RunnerField } from "@/components/form-runner/RunnerField";
import { TypingIndicator } from "@/components/form-runner/TypingIndicator";
import { WelcomeScreen } from "@/components/form-runner/WelcomeScreen";
import { CheckCircle2, Trophy, AlertTriangle, Eye } from "lucide-react";
import logoPratique from "@/assets/logo-pratique.png";
import { AnimatePresence, motion } from "framer-motion";
import type { FormField, FieldTranslation } from "@/types/workflow";
import type { FieldLogic, ScoringConfig, TaggingConfig, OutcomesConfig, FormSchema } from "@/types/workflow";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { getNextFieldId, calculateScore, collectTags, determineOutcome } from "@/lib/logicEngine";
import type { FormTheme, WelcomeScreen as WelcomeScreenType } from "@/lib/formTheme";
import { DEFAULT_THEME, getThemeStyle, loadGoogleFont } from "@/lib/formTheme";
import { parseMediaUrl } from "@/lib/mediaUtils";

interface FormRunnerProps {
  previewMode?: boolean;
}

const FormRunner = ({ previewMode = false }: FormRunnerProps) => {
  const { slug, formId: paramFormId } = useParams<{ slug?: string; formId?: string }>();
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
  const [deadlineState, setDeadlineState] = useState<"ok" | "not_open" | "closed">("ok");
  const answersRef = useRef<Record<string, any>>({});
  const [showTyping, setShowTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldHistory, setFieldHistory] = useState<string[]>([]);

  // Outcome result
  const [outcomeLabel, setOutcomeLabel] = useState<string | null>(null);
  const [outcomeDesc, setOutcomeDesc] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<{ score: number; label?: string } | null>(null);
  // Conditional end screen
  const [endScreen, setEndScreen] = useState<FormField | null>(null);

  useEffect(() => {
    if (previewMode && paramFormId) loadFormPreview();
    else if (slug) loadForm();
  }, [slug, paramFormId, previewMode]);

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

    // Check deadline
    const now = new Date();
    if (settings?.opens_at) {
      const opensAt = new Date(settings.opens_at);
      if (now < opensAt) {
        setDeadlineState("not_open");
        setLoading(false);
        return;
      }
    }
    if (settings?.closes_at) {
      const closesAt = new Date(settings.closes_at);
      if (now > closesAt) {
        setDeadlineState("closed");
        setLoading(false);
        return;
      }
    }

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
      // Also show welcome if there's a welcome_screen field (e.g. from AI generation)
      const wsField = allF.find((f) => f.type === "welcome_screen");
      if (wsField && !schema?.theme?.welcome_screen?.enabled) setShowWelcome(true);
    }

    setLoading(false);
  };

  const loadFormPreview = async () => {
    // Load form by ID without checking published status
    const { data: form, error: formErr } = await supabase
      .from("forms")
      .select("id, name, settings")
      .eq("id", paramFormId!)
      .maybeSingle();

    if (formErr || !form) {
      setError("Formulário não encontrado.");
      setLoading(false);
      return;
    }

    setFormId(form.id);
    setFormName(form.name);
    const settings = form.settings as any;
    setAccessMode("public"); // Preview always public

    // Load latest form_version (draft)
    const { data: version } = await supabase
      .from("form_versions")
      .select("id, schema")
      .eq("form_id", form.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (version) {
      setVersionId(version.id);
      const schema = version.schema as any as FormSchema;
      if (schema?.fields) {
        const allF: FormField[] = schema.fields;
        setAllFields(allF);
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
        if (schema.field_translations?.[schema.locale]) {
          setFieldTranslationsMap(schema.field_translations[schema.locale]);
        }
      }
      if (schema?.theme?.welcome_screen?.enabled) setShowWelcome(true);
      const wsField = allF.find((f) => f.type === "welcome_screen");
      if (wsField && !schema?.theme?.welcome_screen?.enabled) setShowWelcome(true);
    }

    setLoading(false);
  };

  const startResponse = async (email?: string) => {
    if (!formId || !versionId) return;
    if (previewMode) return; // Don't create response records in preview
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
    if (previewMode) {
      // In preview: calculate scoring/outcomes for display but don't save anything
      if (scoring) {
        const score = calculateScore(answersRef.current, scoring.field_scores);
        const range = scoring.ranges.find((r) => score >= r.min && score <= r.max);
        setScoreResult({ score, label: range?.label });
      }
      if (outcomesConfig) {
        const outcomeId = determineOutcome(answersRef.current, outcomesConfig.field_outcomes);
        if (outcomeId) {
          const def = outcomesConfig.definitions.find((d) => d.id === outcomeId);
          setOutcomeLabel(def?.label || null);
          setOutcomeDesc(def?.description || null);
          if (def?.end_screen_id) {
            const es = allFields.find((f) => f.id === def.end_screen_id);
            if (es) setEndScreen(es);
          }
        }
      }
      if (scoring) {
        const score = calculateScore(answersRef.current, scoring.field_scores);
        const range = scoring.ranges.find((r) => score >= r.min && score <= r.max);
        if (range?.end_screen_id) {
          const es = allFields.find((f) => f.id === range.end_screen_id);
          if (es) setEndScreen((prev) => prev ?? es);
        }
      }
      setCompleted(true);
      return;
    }

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

    // Extract respondent email from answers (email field, contact_info, or email_required)
    if (respondentEmail) {
      meta.respondent_email = respondentEmail;
    } else {
      for (const field of fields) {
        const ft = field.type?.toLowerCase();
        if (ft === "email" || ft === "email_input") {
          const val = answersRef.current[field.id];
          if (val && typeof val === "string" && val.includes("@")) {
            meta.respondent_email = val;
            break;
          }
        } else if (ft === "contact_info") {
          const val = answersRef.current[field.id];
          const email = typeof val === "object" && val?.email ? val.email :
                        typeof val === "string" ? (() => { try { const p = JSON.parse(val); return p?.email; } catch { return null; } })() : null;
          if (email && typeof email === "string" && email.includes("@")) {
            meta.respondent_email = email;
            break;
          }
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

    // 1) Fire webhooks (fire-and-forget, independent)
    supabase.functions.invoke("fire-webhooks", {
      body: { form_id: formId, response_id: responseId, session_token: sessionToken, event: "response.completed" },
    }).catch(() => {});

    // 2) Run calendar FIRST (email needs the calendar/meet links)
    let calendarMeta: Record<string, any> = {};
    const integrationStatus: Record<string, string> = {};

    try {
      const calRes = await supabase.functions.invoke("create-calendar-event", {
        body: { form_id: formId, response_id: responseId },
      });
      const d = calRes.data;
      if (d?.created && d?.event_id) {
        integrationStatus.calendar = "ok";
        calendarMeta = {
          calendar_event_id: d.event_id,
          calendar_html_link: d.html_link || null,
          calendar_meet_link: d.meet_link || null,
          calendar_id: d.calendar_id || null,
          google_connection_id: d.google_connection_id || null,
        };
      } else if (d?.reason === "not_configured") {
        // skip
      } else {
        integrationStatus.calendar = "erro";
      }
    } catch {
      integrationStatus.calendar = "erro";
    }

    // 3) Run remaining integrations in parallel (email gets calendar links)
    const otherResults = await Promise.allSettled([
      supabase.functions.invoke("send-email", {
        body: {
          form_id: formId,
          response_id: responseId,
          calendar_link: calendarMeta.calendar_html_link || "",
          meet_link: calendarMeta.calendar_meet_link || "",
        },
      }),
      supabase.functions.invoke("send-whatsapp", {
        body: {
          form_id: formId,
          response_id: responseId,
          meet_link: calendarMeta.calendar_meet_link || "",
          calendar_link: calendarMeta.calendar_html_link || "",
        },
      }),
      supabase.functions.invoke("sync-unnichat", {
        body: { form_id: formId, response_id: responseId },
      }),
      supabase.functions.invoke("sync-chatguru", {
        body: { form_id: formId, response_id: responseId },
      }),
    ]).catch(() => []) as PromiseSettledResult<any>[] | [];

    // 4) Parse integration statuses
    const otherNames = ["email", "whatsapp", "unnichat", "chatguru"];
    for (let i = 0; i < otherNames.length; i++) {
      const result = (otherResults as any[])?.[i];
      if (!result) continue;
      if (result.status === "fulfilled") {
        const d = result.value?.data;
        if (d?.sent || d?.synced || d?.created || d?.success) {
          integrationStatus[otherNames[i]] = "ok";
        } else if (d?.reason === "not_configured" || d?.reason === "no_templates" || d?.reason === "no_phone") {
          // skip
        } else {
          integrationStatus[otherNames[i]] = "erro";
        }
      } else {
        integrationStatus[otherNames[i]] = "erro";
      }
    }

    // 5) Single update: mark completed + save all meta (RLS requires status='in_progress')
    await supabase
      .from("responses")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        meta: {
          ...meta,
          ...calendarMeta,
          ...(Object.keys(integrationStatus).length > 0 ? { integration_status: integrationStatus } : {}),
        } as any,
      })
      .eq("id", responseId)
      .eq("session_token", sessionToken);

    setCompleted(true);

    // 6) Sync to Google Sheets LAST (so it captures integration status)
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
    if (!previewMode && (!responseId || !currentFieldId)) return;
    if (previewMode && !currentFieldId) return;
    const field = fields.find((f) => f.id === currentFieldId);
    if (!field) return;

    // Handle redirect_url: redirect to the configured URL
    if (field.type === "redirect_url" && !previewMode) {
      const redirectUrl = (field as any).redirect_url || field.placeholder || "";
      if (redirectUrl) {
        await completeForm();
        const url = redirectUrl.startsWith("http") ? redirectUrl : `https://${redirectUrl}`;
        window.location.href = url;
        return;
      }
    }

    answersRef.current[field.id] = value;

    // Save answer (skip in preview mode)
    if (!previewMode) {
      await supabase.from("response_answers").insert({
        response_id: responseId,
        field_key: field.id,
        value: value as any,
        value_text: formatValueText(value),
      });
    }

    setAnsweredCount((prev) => prev + 1);

    // Evaluate logic for next field
    const nextId = getNextFieldId(currentFieldId, value, logic, fields.map((f) => f.id));

    if (nextId === "end") {
      await completeForm();
      return;
    }

    // Check if jump target is an end_screen
    if (nextId) {
      const targetEndScreen = allFields.find((f) => f.id === nextId && f.type === "end_screen");
      if (targetEndScreen) {
        setEndScreen(targetEndScreen);
        await completeForm();
        return;
      }
    }

    // Determine the actual next field ID
    let resolvedNextId: string | null = null;
    if (nextId) {
      const idx = fields.findIndex((f) => f.id === nextId);
      if (idx >= 0) resolvedNextId = nextId;
    }
    if (!resolvedNextId) {
      const currentIdx = fields.findIndex((f) => f.id === currentFieldId);
      if (currentIdx < fields.length - 1) {
        resolvedNextId = fields[currentIdx + 1].id;
      }
    }

    if (!resolvedNextId) {
      await completeForm();
      return;
    }

    // Push current field to history before advancing
    setFieldHistory((prev) => [...prev, currentFieldId!]);

    // Show typing indicator before transitioning
    setShowTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setShowTyping(false);
      setCurrentFieldId(resolvedNextId);
    }, 800 + Math.random() * 400);
  };

  const handleBack = () => {
    if (fieldHistory.length === 0 || showTyping) return;
    const prevFieldId = fieldHistory[fieldHistory.length - 1];
    setFieldHistory((prev) => prev.slice(0, -1));
    setCurrentFieldId(prevFieldId);
    setAnsweredCount((prev) => Math.max(0, prev - 1));
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

  if (deadlineState === "not_open") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={themeStyle}>
        {hasOverlay && (
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.background_overlay})` }} />
        )}
        <div className="text-center space-y-4 max-w-md relative z-10">
          <AlertTriangle className="h-14 w-14 mx-auto" style={{ color: theme.button_color }} />
          <h1 className="text-2xl font-bold">Formulário ainda não aberto</h1>
          <p style={{ color: theme.text_secondary_color }}>
            Este formulário ainda não está aceitando respostas. Tente novamente mais tarde.
          </p>
        </div>
      </div>
    );
  }

  if (deadlineState === "closed") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={themeStyle}>
        {hasOverlay && (
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.background_overlay})` }} />
        )}
        <div className="text-center space-y-4 max-w-md relative z-10">
          <AlertTriangle className="h-14 w-14 mx-auto" style={{ color: theme.button_color }} />
          <h1 className="text-2xl font-bold">Formulário encerrado</h1>
          <p style={{ color: theme.text_secondary_color }}>
            Este formulário não está mais aceitando respostas.
          </p>
        </div>
      </div>
    );
  }

  if (accessMode === "email_required" && !emailCollected) {
    return <EmailGate formName={formName} onSubmit={handleEmailSubmit} themeStyle={themeStyle} theme={theme} locale={locale} />;
  }

  if (showWelcome) {
    // Build welcome data from theme or from welcome_screen field
    const wsField = allFields.find((f) => f.type === "welcome_screen");
    const welcomeData: WelcomeScreenType = theme.welcome_screen?.enabled
      ? theme.welcome_screen
      : {
          enabled: true,
          title: wsField?.label || formName,
          description: wsField?.placeholder || "",
          button_text: "Começar",
          image_url: wsField?.media_url || "",
        };

    return (
      <AnimatePresence mode="wait">
        <WelcomeScreen
          formName={formName}
          theme={theme}
          welcome={welcomeData}
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
        style={themeStyle}
      >
        {hasOverlay && (
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.background_overlay})` }} />
        )}
        {/* Celebration particles */}
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          {Array.from({ length: 24 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ y: -20, x: `${Math.random() * 100}vw`, opacity: 1, rotate: 0, scale: 0 }}
              animate={{ y: "110vh", opacity: 0, rotate: 360 * (Math.random() > 0.5 ? 1 : -1), scale: 1 }}
              transition={{ duration: 2.5 + Math.random() * 2, delay: Math.random() * 0.8, ease: "easeOut" }}
              className="absolute w-2 h-2 rounded-full"
              style={{
                backgroundColor: [theme.button_color, "#FFD700", "#FF6B6B", "#4ECDC4", "#A78BFA", "#F472B6"][i % 6],
                left: `${5 + Math.random() * 90}%`,
              }}
            />
          ))}
        </div>
        <div className="text-center space-y-4 max-w-md relative z-10">
          {endScreen ? (
            /* ── Conditional End Screen ── */
            <>
              {endScreen.media_url && (() => {
                const mediaInfo = parseMediaUrl(endScreen.media_url);
                if (!mediaInfo) return null;
                if (mediaInfo.type === "video") {
                  return (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2, duration: 0.5 }}
                      className="relative w-full rounded-xl overflow-hidden mb-2"
                      style={{ paddingBottom: "56.25%" }}
                    >
                      {mediaInfo.direct ? (
                        <video src={mediaInfo.embedUrl} controls autoPlay className="absolute inset-0 w-full h-full object-contain" />
                      ) : (
                        <iframe src={mediaInfo.embedUrl} className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                      )}
                    </motion.div>
                  );
                }
                return (
                  <motion.img
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    src={mediaInfo.embedUrl}
                    alt=""
                    className="w-full max-h-48 object-contain rounded-xl mb-2"
                  />
                );
              })()}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
              >
                <CheckCircle2 className="h-16 w-16 mx-auto" style={{ color: theme.button_color }} />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="text-2xl font-bold"
              >
                {endScreen.label || t(locale).thankYou}
              </motion.h1>
              {endScreen.placeholder && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  style={{ color: theme.text_secondary_color }}
                >
                  {endScreen.placeholder}
                </motion.p>
              )}
              {(endScreen as any).button_text && (endScreen as any).button_url && (
                <motion.a
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                  href={(endScreen as any).button_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 px-6 py-3 rounded-xl font-medium btn-lift"
                  style={{ backgroundColor: theme.button_color, color: theme.button_text_color }}
                >
                  {(endScreen as any).button_text}
                </motion.a>
              )}
            </>
          ) : outcomeLabel ? (
            /* ── Outcome (no specific end screen) ── */
            <>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}>
                <Trophy className="h-16 w-16 mx-auto" style={{ color: theme.button_color }} />
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="text-2xl font-bold">{outcomeLabel}</motion.h1>
              {outcomeDesc && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} style={{ color: theme.text_secondary_color }}>{outcomeDesc}</motion.p>}
            </>
          ) : (
            /* ── Default thank-you screen ── */
            <>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}>
                <CheckCircle2 className="h-16 w-16 mx-auto" style={{ color: theme.button_color }} />
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="text-2xl font-bold">{t(locale).thankYou}</motion.h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} style={{ color: theme.text_secondary_color }}>{t(locale).responseSent}</motion.p>
            </>
          )}

          {/* Score card — always shown when scoring is active */}
          {scoreResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              className="mt-4 p-5 rounded-2xl"
              style={{ backgroundColor: `${theme.button_color}12`, border: `1px solid ${theme.button_color}25` }}
            >
              <p className="text-sm" style={{ color: theme.text_secondary_color }}>{t(locale).yourScore}</p>
              <p className="text-4xl font-bold mt-1" style={{ color: theme.button_color }}>{scoreResult.score}</p>
              {scoreResult.label && <p className="text-sm mt-1" style={{ color: theme.text_secondary_color }}>{scoreResult.label}</p>}
            </motion.div>
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
      {previewMode && (
        <div className="sticky top-0 z-50 bg-yellow-400 text-yellow-900 text-center text-sm font-medium py-1.5 px-4 flex items-center justify-center gap-2">
          <Eye className="h-4 w-4" />
          Modo Preview — as respostas não serão salvas
        </div>
      )}
      <div className="sticky top-0 z-40 backdrop-blur-sm px-0" style={{ backgroundColor: `${theme.background_color}CC` }}>
        {/* Progress track */}
        <div className="w-full h-2.5 rounded-none" style={{ backgroundColor: `${theme.text_secondary_color}26` }}>
          <motion.div
            className="h-full rounded-r-full"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              background: `linear-gradient(90deg, ${theme.button_color}, ${theme.button_color}CC)`,
              boxShadow: `0 0 8px ${theme.button_color}66`,
            }}
          />
        </div>
        {/* Progress text */}
        <div className="flex justify-between px-4 py-1">
          <span className="text-xs font-medium" style={{ color: theme.text_secondary_color }}>
            {Math.round(progress)}%
          </span>
          <span className="text-xs" style={{ color: theme.text_secondary_color }}>
            {answeredCount} {t(locale).questionOf} {fields.length}
          </span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <AnimatePresence mode="wait">
          {showTyping ? (
            <TypingIndicator key="typing" />
          ) : currentField ? (
            <RunnerField
              key={currentField.id}
              field={currentField}
              index={currentIdx}
              total={fields.length}
              onAnswer={handleAnswer}
              onBack={handleBack}
              canGoBack={fieldHistory.length > 0}
              formId={formId || undefined}
              locale={locale}
              fieldTranslation={fieldTranslationsMap[currentField.id]}
              answers={answersRef.current}
              allFields={fields}
            />
          ) : null}
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
