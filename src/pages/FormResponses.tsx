import { useEffect, useState, useMemo } from "react";
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
import { ArrowLeft, BarChart3, CheckCircle2, ClipboardList, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

const FormResponses = () => {
  const { workspaceId, formId } = useParams<{ workspaceId: string; formId: string }>();
  const navigate = useNavigate();

  const [formName, setFormName] = useState("");
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [selectedResponse, setSelectedResponse] = useState<ResponseRow | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(false);

  useEffect(() => {
    if (formId) fetchData();
  }, [formId]);

  const fetchData = async () => {
    setLoading(true);

    // Parallel fetches
    const [formRes, versionRes, responsesRes] = await Promise.all([
      supabase.from("forms").select("name, published_version_id").eq("id", formId!).maybeSingle(),
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

    if (formRes.data) setFormName(formRes.data.name);

    if (versionRes.data) {
      const schema = versionRes.data.schema as any;
      if (schema?.fields && Array.isArray(schema.fields)) {
        const map: Record<string, string> = {};
        schema.fields.forEach((f: any) => {
          map[f.id] = f.label || f.type || f.id;
        });
        setFieldMap(map);
      }
    }

    if (responsesRes.data) setResponses(responsesRes.data as ResponseRow[]);
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

  const avgScore = useMemo(() => {
    const scored = responses.filter((r) => r.meta?.score != null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((sum, r) => sum + Number(r.meta.score), 0) / scored.length);
  }, [responses]);

  const hasScoring = responses.some((r) => r.meta?.score != null);
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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm h-14 flex items-center px-4 gap-3 shrink-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/workspace/${workspaceId}/form/${formId}/edit`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-display font-bold text-sm gradient-text">Pratique Forms</span>
        </div>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-sm truncate max-w-[200px]">{formName}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">Respostas</span>
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
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <p className="text-3xl font-bold">{responses.length}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Taxa de Completude
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <p className="text-3xl font-bold">{completionRate}%</p>
              )}
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
                {loading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-3xl font-bold">{avgScore ?? "—"}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

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
                    <TableRow
                      key={resp.id}
                      className="cursor-pointer"
                      onClick={() => openDetails(resp)}
                    >
                      <TableCell className="whitespace-nowrap">
                        {formatDate(resp.started_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={resp.status === "completed" ? "default" : "secondary"}>
                          {resp.status === "completed" ? "Completada" : "Em andamento"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {meta.email || "—"}
                      </TableCell>
                      {hasScoring && (
                        <TableCell className="font-medium">
                          {meta.score != null ? meta.score : "—"}
                        </TableCell>
                      )}
                      {hasTags && (
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(meta.tags || []).map((tag: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      )}
                      {hasOutcome && (
                        <TableCell>{meta.outcome_label || "—"}</TableCell>
                      )}
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

          {/* Meta info */}
          {selectedResponse?.meta && (
            <div className="flex flex-wrap gap-2 pb-2 border-b">
              {selectedResponse.meta.score != null && (
                <Badge>Score: {selectedResponse.meta.score}</Badge>
              )}
              {selectedResponse.meta.outcome_label && (
                <Badge variant="secondary">{selectedResponse.meta.outcome_label}</Badge>
              )}
              {(selectedResponse.meta.tags || []).map((t: string, i: number) => (
                <Badge key={i} variant="outline">{t}</Badge>
              ))}
            </div>
          )}

          {/* Answers */}
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
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {fieldMap[a.field_key] || a.field_key}
                  </p>
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
