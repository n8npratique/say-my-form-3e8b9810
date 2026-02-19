import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableCell, TableHead,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowLeft, BarChart3, CheckCircle2, ClipboardList, Download, ShieldCheck, RefreshCw } from "lucide-react";
import { useRealtimeResponses } from "@/hooks/useRealtimeResponses";
import logoPratique from "@/assets/logo-pratique.png";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScoreDistributionChart } from "@/components/responses/ScoreDistributionChart";
import { FieldResponsesChart } from "@/components/responses/FieldResponsesChart";

interface ResponseRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  meta: any;
}

interface AnswerRow {
  field_key: string;
  value: any;
  value_text: string | null;
}

interface SchemaField {
  id: string;
  type: string;
  label?: string;
  options?: string[];
}

// CSV helpers
const escapeCsv = (val: string) => {
  if (val.includes('"') || val.includes(",") || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
};

const FormResponses = () => {
  const { workspaceId, formId } = useParams<{ workspaceId: string; formId: string }>();
  const navigate = useNavigate();

  const [formName, setFormName] = useState("");
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dedup config
  const [dedupEnabled, setDedupEnabled] = useState(true);
  const [dedupFields, setDedupFields] = useState<string[]>(["email", "phone", "name"]);
  const [savingDedup, setSavingDedup] = useState(false);

  const [selectedResponse, setSelectedResponse] = useState<ResponseRow | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(false);

  // All answers for charts
  const [allAnswers, setAllAnswers] = useState<AnswerRow[]>([]);
  const [exporting, setExporting] = useState(false);

  // Realtime notifications
  const { newCount, resetCount } = useRealtimeResponses({ formId: formId ?? undefined });
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (newCount > 0) {
      toast.info("Nova resposta recebida!", { duration: 4000 });
    }
  }, [newCount]);

  useEffect(() => {
    if (formId) fetchData();
  }, [formId]);

  const fetchData = async () => {
    setLoading(true);

    const [formRes, versionRes, responsesRes] = await Promise.all([
      supabase.from("forms").select("name, published_version_id, settings").eq("id", formId!).maybeSingle(),
      supabase
        .from("form_versions")
        .select("schema")
        .eq("form_id", formId!)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("responses")
        .select("id, started_at, completed_at, status, meta")
        .eq("form_id", formId!)
        .order("started_at", { ascending: false }),
    ]);

    if (formRes.data) {
      setFormName(formRes.data.name);
      const settings = formRes.data.settings as any;
      if (settings?.dedup) {
        setDedupEnabled(settings.dedup.enabled ?? true);
        setDedupFields(settings.dedup.fields ?? ["email", "phone", "name"]);
      }
    }

    let fields: SchemaField[] = [];
    if (versionRes.data) {
      const schema = versionRes.data.schema as any;
      if (schema?.fields && Array.isArray(schema.fields)) {
        fields = schema.fields;
        const map: Record<string, string> = {};
        fields.forEach((f) => { map[f.id] = f.label || f.type || f.id; });
        setFieldMap(map);
        setSchemaFields(fields);
      }
    }

    const resps = (responsesRes.data as ResponseRow[]) || [];
    setResponses(resps);

    // Fetch all answers for charts
    if (resps.length > 0) {
      const ids = resps.map((r) => r.id);
      const { data: answersData } = await supabase
        .from("response_answers")
        .select("field_key, value, value_text")
        .in("response_id", ids);
      setAllAnswers((answersData as AnswerRow[]) || []);
    }

    setLoading(false);
  };

  const openDetails = async (resp: ResponseRow) => {
    setSelectedResponse(resp);
    setLoadingAnswers(true);
    const { data } = await supabase
      .from("response_answers")
      .select("field_key, value, value_text")
      .eq("response_id", resp.id);
    setAnswers((data as AnswerRow[]) || []);
    setLoadingAnswers(false);
  };

  const filtered = useMemo(() => {
    if (statusFilter === "all") return responses;
    return responses.filter((r) => r.status === statusFilter);
  }, [responses, statusFilter]);

  const completedCount = responses.filter((r) => r.status === "completed").length;
  const completionRate = responses.length > 0 ? Math.round((completedCount / responses.length) * 100) : 0;

  const scores = useMemo(
    () => responses.filter((r) => r.meta?.score != null).map((r) => Number(r.meta.score)),
    [responses]
  );
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const hasScoring = scores.length > 0;
  const hasTags = responses.some((r) => r.meta?.tags?.length > 0);
  const hasOutcome = responses.some((r) => r.meta?.outcome_label);

  const formatDate = (d: string) => format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });

  const renderValue = (val: any, valText: string | null) => {
    if (valText) return valText;
    if (val == null) return "—";
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  // CSV Export
  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const ids = filtered.map((r) => r.id);
      const { data: csvAnswers } = await supabase
        .from("response_answers")
        .select("response_id, field_key, value, value_text")
        .in("response_id", ids);

      const answersByResp: Record<string, Record<string, string>> = {};
      (csvAnswers || []).forEach((a: any) => {
        if (!answersByResp[a.response_id]) answersByResp[a.response_id] = {};
        answersByResp[a.response_id][a.field_key] = a.value_text || (a.value != null ? (Array.isArray(a.value) ? a.value.join("; ") : String(a.value)) : "");
      });

      const fieldKeys = schemaFields.map((f) => f.id);
      const headers = ["Data", "Status", "Email", "Score", "Tags", "Outcome", ...fieldKeys.map((k) => fieldMap[k] || k)];

      const rows = filtered.map((r) => {
        const meta = r.meta || {};
        const ra = answersByResp[r.id] || {};
        return [
          formatDate(r.started_at),
          r.status === "completed" ? "Completada" : "Em andamento",
          meta.email || "",
          meta.score != null ? String(meta.score) : "",
          (meta.tags || []).join("; "),
          meta.outcome_label || "",
          ...fieldKeys.map((k) => ra[k] || ""),
        ];
      });

      const csv = [headers.map(escapeCsv).join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${formName || "respostas"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [filtered, schemaFields, fieldMap, formName]);

  const saveDedup = useCallback(async (enabled: boolean, fields: string[]) => {
    if (!formId) return;
    setSavingDedup(true);
    try {
      // Fetch current settings to merge
      const { data: formData } = await supabase.from("forms").select("settings").eq("id", formId).maybeSingle();
      const currentSettings = (formData?.settings as any) || {};
      const newSettings = { ...currentSettings, dedup: { enabled, fields } };
      await supabase.from("forms").update({ settings: newSettings as any }).eq("id", formId);
      toast.success("Configuração salva");
    } catch {
      toast.error("Erro ao salvar configuração");
    } finally {
      setSavingDedup(false);
    }
  }, [formId]);

  const toggleDedupEnabled = (checked: boolean) => {
    setDedupEnabled(checked);
    saveDedup(checked, dedupFields);
  };

  const toggleDedupField = (field: string, checked: boolean) => {
    const newFields = checked ? [...dedupFields, field] : dedupFields.filter((f) => f !== field);
    setDedupFields(newFields);
    saveDedup(dedupEnabled, newFields);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm h-14 flex items-center px-4 gap-3 shrink-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/workspace/${workspaceId}/form/${formId}/edit`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 hover:opacity-80 transition">
           <img src={logoPratique} alt="TecForms" className="h-6 w-6 rounded-full" />
          <span className="font-display font-bold text-sm gradient-text">TecForms</span>
        </button>
        <span className="text-muted-foreground">/</span>
        <button onClick={() => navigate(`/workspace/${workspaceId}/form/${formId}/edit`)} className="font-medium text-sm truncate max-w-[200px] hover:text-primary transition cursor-pointer">{formName}</button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">Respostas</span>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> {exporting ? "Exportando..." : "Exportar CSV"}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-6xl mx-auto w-full">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Total de Respostas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold">{responses.length}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Taxa de Completude
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold">{completionRate}%</p>}
            </CardContent>
          </Card>

          {hasScoring && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Score Médio
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold">{avgScore ?? "—"}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Charts */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hasScoring && <ScoreDistributionChart scores={scores} />}
            <FieldResponsesChart fields={schemaFields} fieldMap={fieldMap} allAnswers={allAnswers} />
          </div>
        )}

        {/* Dedup Config */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Prevenção de Duplicados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="dedup-switch" className="text-sm">Bloquear respostas duplicadas</Label>
              <Switch id="dedup-switch" checked={dedupEnabled} onCheckedChange={toggleDedupEnabled} disabled={savingDedup} />
            </div>
            {dedupEnabled && (
              <div className="flex flex-wrap gap-4">
                {[
                  { key: "email", label: "Email" },
                  { key: "phone", label: "Celular" },
                  { key: "name", label: "Nome" },
                ].map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`dedup-${f.key}`}
                      checked={dedupFields.includes(f.key)}
                      onCheckedChange={(checked) => toggleDedupField(f.key, !!checked)}
                      disabled={savingDedup}
                    />
                    <Label htmlFor={`dedup-${f.key}`} className="text-sm">{f.label}</Label>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Realtime banner */}
        {newCount > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-primary/10 border-b border-primary/20">
            <span className="text-sm text-primary font-medium">
              🔔 {newCount} nova{newCount > 1 ? "s respostas chegaram" : " resposta chegou"}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-primary/40 text-primary"
              onClick={() => { resetCount(); fetchData(); }}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Atualizar ({newCount} nova{newCount > 1 ? "s" : ""})
            </Button>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filtrar por status:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="completed">Completada</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>Nenhuma resposta encontrada.</p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email</TableHead>
                  {hasScoring && <TableHead>Score</TableHead>}
                  {hasTags && <TableHead>Tags</TableHead>}
                  {hasOutcome && <TableHead>Outcome</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((resp) => {
                  const meta = resp.meta || {};
                  return (
                    <TableRow key={resp.id} className="cursor-pointer" onClick={() => openDetails(resp)}>
                      <TableCell className="whitespace-nowrap">{formatDate(resp.started_at)}</TableCell>
                      <TableCell>
                        <Badge variant={resp.status === "completed" ? "default" : "secondary"}>
                          {resp.status === "completed" ? "Completada" : "Em andamento"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{meta.email || "—"}</TableCell>
                      {hasScoring && <TableCell className="font-medium">{meta.score != null ? meta.score : "—"}</TableCell>}
                      {hasTags && (
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(meta.tags || []).map((tag: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        </TableCell>
                      )}
                      {hasOutcome && <TableCell>{meta.outcome_label || "—"}</TableCell>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedResponse} onOpenChange={(o) => !o && setSelectedResponse(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Resposta</DialogTitle>
            <DialogDescription>
              {selectedResponse && (
                <span>
                  Iniciada em {formatDate(selectedResponse.started_at)}
                  {selectedResponse.completed_at && ` • Concluída em ${formatDate(selectedResponse.completed_at)}`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedResponse?.meta && (
            <div className="flex flex-wrap gap-2 pb-2 border-b">
              {selectedResponse.meta.score != null && <Badge>Score: {selectedResponse.meta.score}</Badge>}
              {selectedResponse.meta.outcome_label && <Badge variant="secondary">{selectedResponse.meta.outcome_label}</Badge>}
              {(selectedResponse.meta.tags || []).map((t: string, i: number) => (
                <Badge key={i} variant="outline">{t}</Badge>
              ))}
            </div>
          )}

          {loadingAnswers ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : answers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma resposta individual encontrada.</p>
          ) : (
            <div className="space-y-4">
              {answers.map((a, i) => (
                <div key={i}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{fieldMap[a.field_key] || a.field_key}</p>
                  <p className="text-sm">{renderValue(a.value, a.value_text)}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FormResponses;
