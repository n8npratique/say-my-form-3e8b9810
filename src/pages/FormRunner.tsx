import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { EmailGate } from "@/components/form-runner/EmailGate";
import { RunnerField } from "@/components/form-runner/RunnerField";
import { Sparkles, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { FormField } from "@/components/form-editor/FieldItem";

const FormRunner = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [formId, setFormId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<"public" | "email_required">("public");
  const [emailCollected, setEmailCollected] = useState(false);
  const [respondentEmail, setRespondentEmail] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (slug) loadForm();
  }, [slug]);

  const loadForm = async () => {
    // Fetch form by slug
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

    // Fetch version schema
    const { data: version } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("id", form.published_version_id)
      .maybeSingle();

    if (version) {
      const schema = version.schema as any;
      if (schema?.fields) setFields(schema.fields);
    }

    setLoading(false);
  };

  const startResponse = async (email?: string) => {
    if (!formId || !versionId) return;

    const meta = email ? { respondent_email: email } : {};
    const { data, error } = await supabase
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

  const handleAnswer = async (value: any) => {
    if (!responseId) return;
    const field = fields[currentIndex];

    // Save answer
    await supabase.from("response_answers").insert({
      response_id: responseId,
      field_key: field.id,
      value: value as any,
      value_text: typeof value === "string" ? value : JSON.stringify(value),
    });

    // Next or complete
    if (currentIndex < fields.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      await supabase
        .from("responses")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", responseId);
      setCompleted(true);
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
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Obrigado!</h1>
          <p className="text-muted-foreground">Suas respostas foram enviadas com sucesso.</p>
        </div>
      </motion.div>
    );
  }

  const progress = fields.length > 0 ? ((currentIndex) / fields.length) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Progress */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <Progress value={progress} className="h-1 rounded-none" />
      </div>

      {/* Field */}
      <div className="flex-1 flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {fields[currentIndex] && (
            <RunnerField
              key={fields[currentIndex].id}
              field={fields[currentIndex]}
              index={currentIndex}
              total={fields.length}
              onAnswer={handleAnswer}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
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
