import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { EmailGate } from "@/components/form-runner/EmailGate";
import { RunnerField } from "@/components/form-runner/RunnerField";
import { Sparkles, CheckCircle2, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { FormField } from "@/types/workflow";
import type { FieldLogic, ScoringConfig, TaggingConfig, OutcomesConfig, FormSchema } from "@/types/workflow";
import { getNextFieldId, calculateScore, collectTags, determineOutcome } from "@/lib/logicEngine";

const FormRunner = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [logic, setLogic] = useState<FieldLogic[]>([]);
  const [scoring, setScoring] = useState<ScoringConfig | null>(null);
  const [tagging, setTagging] = useState<TaggingConfig | null>(null);
  const [outcomesConfig, setOutcomesConfig] = useState<OutcomesConfig | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<"public" | "email_required">("public");
  const [emailCollected, setEmailCollected] = useState(false);
  const [respondentEmail, setRespondentEmail] = useState<string | null>(null);
  const [currentFieldId, setCurrentFieldId] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const answersRef = useRef<Record<string, any>>({});

  // Outcome result
  const [outcomeLabel, setOutcomeLabel] = useState<string | null>(null);
  const [outcomeDesc, setOutcomeDesc] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<{ score: number; label?: string } | null>(null);

  useEffect(() => {
    if (slug) loadForm();
  }, [slug]);

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

    const { data: version } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("id", form.published_version_id)
      .maybeSingle();

    if (version) {
      const schema = version.schema as any as FormSchema;
      if (schema?.fields) {
        setFields(schema.fields);
        setCurrentFieldId(schema.fields[0]?.id || null);
      }
      if (schema?.logic) setLogic(schema.logic);
      if (schema?.scoring?.enabled) setScoring(schema.scoring);
      if (schema?.tagging?.enabled) setTagging(schema.tagging);
      if (schema?.outcomes?.enabled) setOutcomesConfig(schema.outcomes);
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
      .select("id")
      .single();
    if (data) setResponseId(data.id);
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

    const meta: any = {};

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
      }
    }

    await supabase
      .from("responses")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        meta: meta as any,
      })
      .eq("id", responseId);

    setCompleted(true);

    // Fire webhooks + sync Google Sheets (best-effort)
    try {
      await Promise.allSettled([
        supabase.functions.invoke("fire-webhooks", {
          body: { form_id: formId, response_id: responseId },
        }),
        supabase.functions.invoke("sync-google-sheets", {
          body: { form_id: formId, response_id: responseId },
        }),
      ]);
    } catch {
      // silent fail
    }
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
      value_text: typeof value === "string" ? value : JSON.stringify(value),
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Sparkles className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-2">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (accessMode === "email_required" && !emailCollected) {
    return <EmailGate formName={formName} onSubmit={handleEmailSubmit} />;
  }

  if (completed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-screen flex items-center justify-center bg-background p-4"
      >
        <div className="text-center space-y-4 max-w-md">
          {outcomeLabel ? (
            <>
              <Trophy className="h-16 w-16 mx-auto text-primary" />
              <h1 className="text-2xl font-bold">{outcomeLabel}</h1>
              {outcomeDesc && <p className="text-muted-foreground">{outcomeDesc}</p>}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-16 w-16 mx-auto text-primary" />
              <h1 className="text-2xl font-bold">Obrigado!</h1>
              <p className="text-muted-foreground">Suas respostas foram enviadas com sucesso.</p>
            </>
          )}
          {scoreResult && (
            <div className="mt-4 p-4 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-sm text-muted-foreground">Sua pontuação</p>
              <p className="text-3xl font-bold text-primary">{scoreResult.score}</p>
              {scoreResult.label && <p className="text-sm text-muted-foreground">{scoreResult.label}</p>}
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
    <div className="min-h-screen flex flex-col bg-background">
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <Progress value={progress} className="h-1 rounded-none" />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {currentField && (
            <RunnerField
              key={currentField.id}
              field={currentField}
              index={currentIdx}
              total={fields.length}
              onAnswer={handleAnswer}
            />
          )}
        </AnimatePresence>
      </div>

      <footer className="p-4 text-center">
        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>Pratique Forms</span>
        </div>
      </footer>
    </div>
  );
};

export default FormRunner;
