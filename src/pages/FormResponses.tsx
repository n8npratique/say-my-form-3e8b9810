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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, BarChart3, CheckCircle2, ClipboardList, Download,
  ShieldCheck, RefreshCw, Clock, CalendarDays, AlertTriangle,
  ChevronDown, ChevronUp, ChevronsUpDown, CalendarIcon, X,
  ExternalLink, FileSpreadsheet,
} from "lucide-react";
import { useRealtimeResponses } from "@/hooks/useRealtimeResponses";
import logoPratique from "@/assets/logo-pratique.png";
import { toast } from "sonner";
import { format, formatDistance, subDays, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { ScoreDistributionChart } from "@/components/responses/ScoreDistributionChart";
import { FieldResponsesChart } from "@/components/responses/FieldResponsesChart";
import { ResponsesAreaChart } from "@/components/responses/ResponsesAreaChart";
import { OutcomePieChart } from "@/components/responses/OutcomePieChart";
import { TagsBarChart } from "@/components/responses/TagsBarChart";

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

type SortKey = "started_at" | "status" | "score" | "duration";
type SortDir = "asc" | "desc";
type QuickRange = "today" | "7d" | "30d" | "month" | "custom";

const PAGE_SIZE = 20;

const escapeCsv = (val: string) => {
  if (val.includes('"') || val.includes(",") || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
};

const formatDuration = (start: string, end: string | null) => {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}m ${secs}s`;
};

const FormResponses = () => {
  const { workspaceId, formId } = useParams<{ workspaceId: string; formId: string }>();
  const navigate = useNavigate();

  const [formName, setFormName] = useState("");
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [scoreRangeFilter, setScoreRangeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [quickRange, setQuickRange] = useState<QuickRange | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Dedup
  const [dedupEnabled, setDedupEnabled] = useState(true);
  const [dedupFields, setDedupFields] = useState<string[]>(["email", "phone", "name"]);
  const [savingDedup, setSavingDedup] = useState(false);

  // Detail dialog
  const [selectedResponse, setSelectedResponse] = useState<ResponseRow | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(false);

  // All answers for charts
  const [allAnswers, setAllAnswers] = useState<AnswerRow[]>([]);
  const [exporting, setExporting] = useState(false);

  // Sheets integration
  const [sheetsSpreadsheetId, setSheetsSpreadsheetId] = useState<string | null>(null);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("started_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Pagination
  const [page, setPage] = useState(1);

  // Schema for scoring ranges / tags / outcomes
  const [scoringRanges, setScoringRanges] = useState<{ min: number; max: number; label?: string }[]>([]);

  // Realtime
  const { newCount, resetCount } = useRealtimeResponses({ formId: formId ?? undefined });
  const isFirstRender = useRef(true);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (newCount > 0) toast.info("Nova resposta recebida!", { duration: 4000 });
  }, [newCount]);

  useEffect(() => {
    if (formId) fetchData();
  }, [formId]);

  const fetchData = async () => {
    setLoading(true);
    const [formRes, versionRes, responsesRes, integrationRes] = await Promise.all([
      supabase.from("forms").select("name, published_version_id, settings").eq("id", formId!).maybeSingle(),
      supabase.from("form_versions").select("schema").eq("form_id", formId!).order("version_number", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("responses").select("id, started_at, completed_at, status, meta").eq("form_id", formId!).order("started_at", { ascending: false }),
      supabase.from("integrations").select("config").eq("form_id", formId!).eq("type", "google_sheets").maybeSingle(),
    ]);

    if (formRes.data) {
      setFormName(formRes.data.name);
      const settings = formRes.data.settings as any;
      if (settings?.dedup) {
        setDedupEnabled(settings.dedup.enabled ?? true);
        setDedupFields(settings.dedup.fields ?? ["email", "phone", "name"]);
      }
    }

    if (integrationRes.data?.config) {
      const cfg = integrationRes.data.config as any;
      setSheetsSpreadsheetId(cfg?.spreadsheet_id || null);
    }

    if (versionRes.data) {
      const schema = versionRes.data.schema as any;
      if (schema?.fields && Array.isArray(schema.fields)) {
        const fields: SchemaField[] = schema.fields;
        const map: Record<string, string> = {};
        fields.forEach((f) => { map[f.id] = f.label || f.type || f.id; });
        setFieldMap(map);
        setSchemaFields(fields);
        setScoringRanges(schema.scoring?.ranges || []);
      }
    }

    const resps = (responsesRes.data as ResponseRow[]) || [];
    setResponses(resps);

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

  const handleRefresh = () => {
    // Mark newest responses for highlight
    const newestIds = responses.slice(0, newCount).map((r) => r.id);
    setHighlightedIds(new Set(newestIds));
    setTimeout(() => setHighlightedIds(new Set()), 3000);
    resetCount();
    fetchData();
    setPage(1);
  };

  // Quick range helpers
  const applyQuickRange = (range: QuickRange) => {
    setQuickRange(range);
    const now = new Date();
    if (range === "today") { setDateFrom(startOfDay(now)); setDateTo(endOfDay(now)); }
    else if (range === "7d") { setDateFrom(startOfDay(subDays(now, 6))); setDateTo(endOfDay(now)); }
    else if (range === "30d") { setDateFrom(startOfDay(subDays(now, 29))); setDateTo(endOfDay(now)); }
    else if (range === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(startOfDay(first));
      setDateTo(endOfDay(now));
    } else {
      // custom — keep date pickers open
      setDatePickerOpen(true);
    }
    setPage(1);
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setScoreRangeFilter("all");
    setTagFilter("all");
    setOutcomeFilter("all");
    setQuickRange(null);
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
  };

  const hasActiveFilters = statusFilter !== "all" || scoreRangeFilter !== "all" || tagFilter !== "all" || outcomeFilter !== "all" || !!dateFrom || !!dateTo;

  // Derived filter options
  const allTags = useMemo(() => {
    const set = new Set<string>();
    responses.forEach((r) => (r.meta?.tags || []).forEach((t: string) => set.add(t)));
    return [...set];
  }, [responses]);

  const allOutcomes = useMemo(() => {
    const set = new Set<string>();
    responses.forEach((r) => { if (r.meta?.outcome_label) set.add(r.meta.outcome_label); });
    return [...set];
  }, [responses]);

  // Filtered
  const filtered = useMemo(() => {
    let list = responses;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (dateFrom) list = list.filter((r) => isAfter(new Date(r.started_at), dateFrom));
    if (dateTo) list = list.filter((r) => isBefore(new Date(r.started_at), dateTo));
    if (tagFilter !== "all") list = list.filter((r) => (r.meta?.tags || []).includes(tagFilter));
    if (outcomeFilter !== "all") list = list.filter((r) => r.meta?.outcome_label === outcomeFilter);
    if (scoreRangeFilter !== "all") {
      const range = scoringRanges.find((_, i) => String(i) === scoreRangeFilter);
      if (range) list = list.filter((r) => r.meta?.score != null && Number(r.meta.score) >= range.min && Number(r.meta.score) <= range.max);
    }
    return list;
  }, [responses, statusFilter, dateFrom, dateTo, tagFilter, outcomeFilter, scoreRangeFilter, scoringRanges]);

  // Sorted
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === "started_at") { va = new Date(a.started_at).getTime(); vb = new Date(b.started_at).getTime(); }
      else if (sortKey === "status") { va = a.status; vb = b.status; }
      else if (sortKey === "score") { va = a.meta?.score ?? -1; vb = b.meta?.score ?? -1; }
      else if (sortKey === "duration") {
        va = a.completed_at ? new Date(a.completed_at).getTime() - new Date(a.started_at).getTime() : -1;
        vb = b.completed_at ? new Date(b.completed_at).getTime() - new Date(b.started_at).getTime() : -1;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  // Metrics
  const completedCount = responses.filter((r) => r.status === "completed").length;
  const completionRate = responses.length > 0 ? Math.round((completedCount / responses.length) * 100) : 0;

  const scores = useMemo(
    () => responses.filter((r) => r.meta?.score != null).map((r) => Number(r.meta.score)),
    [responses]
  );
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const avgDurationMs = useMemo(() => {
    const completed = responses.filter((r) => r.status === "completed" && r.completed_at);
    if (completed.length === 0) return null;
    const total = completed.reduce((acc, r) => acc + (new Date(r.completed_at!).getTime() - new Date(r.started_at).getTime()), 0);
    return Math.round(total / completed.length);
  }, [responses]);

  const todayCount = useMemo(() => {
    const today = startOfDay(new Date());
    return responses.filter((r) => r.completed_at && isAfter(new Date(r.completed_at), today)).length;
  }, [responses]);

  const abandonRate = useMemo(() => {
    const cutoff = subDays(new Date(), 1);
    const oldInProgress = responses.filter((r) => r.status === "in_progress" && isBefore(new Date(r.started_at), cutoff));
    return responses.length > 0 ? Math.round((oldInProgress.length / responses.length) * 100) : 0;
  }, [responses]);

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

  const openDetails = async (resp: ResponseRow) => {
    setSelectedResponse(resp);
    setLoadingAnswers(true);
    const { data } = await supabase.from("response_answers").select("field_key, value, value_text").eq("response_id", resp.id);
    setAnswers((data as AnswerRow[]) || []);
    setLoadingAnswers(false);
  };

  // CSV Export (respects filters)
  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const ids = sorted.map((r) => r.id);
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
      const headers = ["Data", "Status", "Duração", "Email", "Score", "Tags", "Outcome", ...fieldKeys.map((k) => fieldMap[k] || k)];
      const rows = sorted.map((r) => {
        const meta = r.meta || {};
        const ra = answersByResp[r.id] || {};
        return [
          formatDate(r.started_at),
          r.status === "completed" ? "Completada" : "Em andamento",
          formatDuration(r.started_at, r.completed_at),
          meta.respondent_email || meta.email || "",
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
  }, [sorted, schemaFields, fieldMap, formName]);

  const saveDedup = useCallback(async (enabled: boolean, fields: string[]) => {
    if (!formId) return;
    setSavingDedup(true);
    try {
      const { data: formData } = await supabase.from("forms").select("settings").eq("id", formId).maybeSingle();
      const currentSettings = (formData?.settings as any) || {};
      await supabase.from("forms").update({ settings: { ...currentSettings, dedup: { enabled, fields } } as any }).eq("id", formId);
      toast.success("Configuração salva");
    } catch { toast.error("Erro ao salvar configuração"); }
    finally { setSavingDedup(false); }
  }, [formId]);

  const toggleDedupEnabled = (checked: boolean) => { setDedupEnabled(checked); saveDedup(checked, dedupFields); };
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
        <button onClick={() => navigate(`/workspace/${workspaceId}/form/${formId}/edit`)} className="font-medium text-sm truncate max-w-[200px] hover:text-primary transition">{formName}</button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">Respostas</span>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting || sorted.length === 0}>
                <Download className="h-4 w-4 mr-1" />
                {exporting ? "Exportando..." : "Exportar"}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}>
                <Download className="h-4 w-4 mr-2" /> Exportar CSV {hasActiveFilters && "(filtrado)"}
              </DropdownMenuItem>
              {sheetsSpreadsheetId && (
                <DropdownMenuItem onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${sheetsSpreadsheetId}`, "_blank")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Abrir no Google Sheets
                  <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-6xl mx-auto w-full">

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { icon: <ClipboardList className="h-4 w-4" />, label: "Total", value: loading ? null : responses.length, sub: "respostas recebidas" },
            { icon: <CheckCircle2 className="h-4 w-4" />, label: "Completude", value: loading ? null : `${completionRate}%`, sub: `${completedCount} completadas` },
            { icon: <CalendarDays className="h-4 w-4" />, label: "Hoje", value: loading ? null : todayCount, sub: "respostas completadas" },
            { icon: <Clock className="h-4 w-4" />, label: "Tempo médio", value: loading ? null : (avgDurationMs == null ? "—" : `${Math.floor(avgDurationMs / 60000)}m ${Math.floor((avgDurationMs % 60000) / 1000)}s`), sub: "por resposta" },
            { icon: <AlertTriangle className="h-4 w-4" />, label: "Abandono", value: loading ? null : `${abandonRate}%`, sub: ">24h sem completar" },
          ].map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    {m.icon} {m.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {m.value === null ? <Skeleton className="h-7 w-16" /> : (
                    <p className="text-2xl font-bold leading-none">{m.value}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{m.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {hasScoring && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4" /> Score médio
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {loading ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-bold">{avgScore ?? "—"}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">pontos</p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {/* Charts */}
        {!loading && responses.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ResponsesAreaChart responses={responses} />
            {hasScoring && <ScoreDistributionChart scores={scores} />}
            {hasOutcome && <OutcomePieChart responses={responses} />}
            {hasTags && <TagsBarChart responses={responses} />}
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
                {[{ key: "email", label: "Email" }, { key: "phone", label: "Celular" }, { key: "name", label: "Nome" }].map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <Checkbox id={`dedup-${f.key}`} checked={dedupFields.includes(f.key)} onCheckedChange={(checked) => toggleDedupField(f.key, !!checked)} disabled={savingDedup} />
                    <Label htmlFor={`dedup-${f.key}`} className="text-sm">{f.label}</Label>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Realtime banner */}
        <AnimatePresence>
          {newCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center justify-between px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg"
            >
              <span className="text-sm text-primary font-medium">
                🔔 {newCount} nova{newCount > 1 ? "s respostas chegaram" : " resposta chegou"}
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs border-primary/40 text-primary" onClick={handleRefresh}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Atualizar ({newCount} nova{newCount > 1 ? "s" : ""})
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Advanced Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Quick date ranges */}
              <div className="flex gap-1">
                {(["today", "7d", "30d", "month"] as QuickRange[]).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={quickRange === r ? "default" : "outline"}
                    className={cn("h-7 text-xs px-2", quickRange === r && "gradient-primary text-primary-foreground border-0")}
                    onClick={() => applyQuickRange(r)}
                  >
                    {{ today: "Hoje", "7d": "7 dias", "30d": "30 dias", month: "Este mês" }[r]}
                  </Button>
                ))}

                {/* Custom date picker */}
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant={quickRange === "custom" ? "default" : "outline"}
                      className={cn("h-7 text-xs px-2", quickRange === "custom" && "gradient-primary text-primary-foreground border-0")}
                    >
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      {dateFrom && dateTo && quickRange === "custom"
                        ? `${format(dateFrom, "dd/MM")} – ${format(dateTo, "dd/MM")}`
                        : "Personalizado"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex flex-col gap-2 p-3">
                      <div className="text-xs font-medium text-muted-foreground">Data inicial</div>
                      <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setQuickRange("custom"); setPage(1); }} initialFocus className={cn("p-3 pointer-events-auto")} />
                      <div className="text-xs font-medium text-muted-foreground">Data final</div>
                      <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d ? endOfDay(d) : undefined); setQuickRange("custom"); setPage(1); }} className={cn("p-3 pointer-events-auto")} />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Status */}
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="completed">Completada</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                </SelectContent>
              </Select>

              {/* Score ranges */}
              {hasScoring && scoringRanges.length > 0 && (
                <Select value={scoreRangeFilter} onValueChange={(v) => { setScoreRangeFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="Faixa de score" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os scores</SelectItem>
                    {scoringRanges.map((r, i) => (
                      <SelectItem key={i} value={String(i)}>{r.label || `${r.min}–${r.max}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Tags */}
              {hasTags && allTags.length > 0 && (
                <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue placeholder="Tag" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as tags</SelectItem>
                    {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              {/* Outcomes */}
              {hasOutcome && allOutcomes.length > 0 && (
                <Select value={outcomeFilter} onValueChange={(v) => { setOutcomeFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="Outcome" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os outcomes</SelectItem>
                    {allOutcomes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              {hasActiveFilters && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={clearFilters}>
                  <X className="h-3 w-3 mr-1" /> Limpar filtros
                </Button>
              )}

              <span className="ml-auto text-xs text-muted-foreground">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>Nenhuma resposta encontrada.</p>
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button className="flex items-center text-xs font-semibold" onClick={() => toggleSort("started_at")}>
                        Data <SortIcon k="started_at" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button className="flex items-center text-xs font-semibold" onClick={() => toggleSort("status")}>
                        Status <SortIcon k="status" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button className="flex items-center text-xs font-semibold" onClick={() => toggleSort("duration")}>
                        Duração <SortIcon k="duration" />
                      </button>
                    </TableHead>
                    <TableHead>Email</TableHead>
                    {hasScoring && (
                      <TableHead>
                        <button className="flex items-center text-xs font-semibold" onClick={() => toggleSort("score")}>
                          Score <SortIcon k="score" />
                        </button>
                      </TableHead>
                    )}
                    {hasTags && <TableHead>Tags</TableHead>}
                    {hasOutcome && <TableHead>Outcome</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {paginated.map((resp) => {
                      const meta = resp.meta || {};
                      const isNew = highlightedIds.has(resp.id);
                      return (
                        <motion.tr
                          key={resp.id}
                          initial={isNew ? { backgroundColor: "hsl(var(--primary) / 0.15)" } : {}}
                          animate={{ backgroundColor: "transparent" }}
                          transition={{ duration: 2 }}
                          className="cursor-pointer hover:bg-muted/50 border-b"
                          onClick={() => openDetails(resp)}
                        >
                          <TableCell className="whitespace-nowrap text-sm">{formatDate(resp.started_at)}</TableCell>
                          <TableCell>
                            <Badge variant={resp.status === "completed" ? "default" : "secondary"}>
                              {resp.status === "completed" ? "Completada" : "Em andamento"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDuration(resp.started_at, resp.completed_at)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{meta.respondent_email || meta.email || "—"}</TableCell>
                          {hasScoring && <TableCell className="font-medium text-sm">{meta.score != null ? meta.score : "—"}</TableCell>}
                          {hasTags && (
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(meta.tags || []).map((tag: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                                ))}
                              </div>
                            </TableCell>
                          )}
                          {hasOutcome && <TableCell className="text-sm">{meta.outcome_label || "—"}</TableCell>}
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Página {page} de {totalPages} · {sorted.length} resultado{sorted.length !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </>
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
                  {selectedResponse.completed_at && ` · Duração: ${formatDuration(selectedResponse.started_at, selectedResponse.completed_at)}`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedResponse?.meta && (
            <div className="flex flex-wrap gap-2 pb-2 border-b">
              {selectedResponse.meta.score != null && <Badge>Score: {selectedResponse.meta.score}</Badge>}
              {selectedResponse.meta.outcome_label && <Badge variant="secondary">{selectedResponse.meta.outcome_label}</Badge>}
              {(selectedResponse.meta.tags || []).map((t: string, i: number) => <Badge key={i} variant="outline">{t}</Badge>)}
            </div>
          )}

          {loadingAnswers ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
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
