import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, RefreshCw, Loader2, Link2, Unlink, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ServiceAccount {
  id: string;
  name: string;
  client_email: string;
}

interface FormIntegration {
  formId: string;
  formName: string;
  integrationId: string | null;
  spreadsheetId: string;
  sheetName: string;
  serviceAccountId: string | null;
  lastSyncedAt: string | null;
}

interface Props {
  workspaceId: string;
}

export const SheetsIntegrationTable = ({ workspaceId }: Props) => {
  const [rows, setRows] = useState<FormIntegration[]>([]);
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, { spreadsheetId: string; sheetName: string; serviceAccountId: string }>>({});

  useEffect(() => {
    fetchData();
  }, [workspaceId]);

  const fetchData = async () => {
    setLoading(true);
    const [formsRes, integrationsRes, saRes] = await Promise.all([
      supabase.from("forms").select("id, name").eq("workspace_id", workspaceId).order("name"),
      supabase.from("integrations").select("id, form_id, config, service_account_id, last_synced_at").eq("type", "google_sheets"),
      supabase.from("google_service_accounts").select("id, name, client_email").eq("workspace_id", workspaceId),
    ]);

    const forms = formsRes.data || [];
    const integrations = integrationsRes.data || [];
    const sas = saRes.data || [];
    setServiceAccounts(sas);

    const intMap = new Map(integrations.map((i: any) => [i.form_id, i]));

    const mapped: FormIntegration[] = forms.map((f: any) => {
      const integ = intMap.get(f.id) as any;
      const config = integ?.config as any;
      return {
        formId: f.id,
        formName: f.name,
        integrationId: integ?.id || null,
        spreadsheetId: config?.spreadsheet_id || "",
        sheetName: config?.sheet_name || "",
        serviceAccountId: integ?.service_account_id || null,
        lastSyncedAt: integ?.last_synced_at || null,
      };
    });

    setRows(mapped);

    const edits: typeof editState = {};
    mapped.forEach((r) => {
      edits[r.formId] = {
        spreadsheetId: r.spreadsheetId,
        sheetName: r.sheetName,
        serviceAccountId: r.serviceAccountId || "",
      };
    });
    setEditState(edits);
    setLoading(false);
  };

  const updateEdit = (formId: string, field: string, value: string) => {
    setEditState((prev) => ({
      ...prev,
      [formId]: { ...prev[formId], [field]: value },
    }));
  };

  const handleSave = async (row: FormIntegration) => {
    const edit = editState[row.formId];
    if (!edit?.spreadsheetId?.trim()) {
      toast({ title: "Informe o Spreadsheet ID", variant: "destructive" });
      return;
    }

    setSavingId(row.formId);
    const config = { spreadsheet_id: edit.spreadsheetId.trim(), sheet_name: edit.sheetName.trim() || "Sheet1" };
    const saId = edit.serviceAccountId || null;

    if (row.integrationId) {
      await supabase
        .from("integrations")
        .update({ config: config as any, service_account_id: saId })
        .eq("id", row.integrationId);
    } else {
      await supabase.from("integrations").insert({
        form_id: row.formId,
        type: "google_sheets",
        config: config as any,
        service_account_id: saId,
      } as any);
    }

    toast({ title: "Integração salva!" });
    setSavingId(null);
    fetchData();
  };

  const handleDisconnect = async (row: FormIntegration) => {
    if (!row.integrationId) return;
    await supabase.from("integrations").delete().eq("id", row.integrationId);
    toast({ title: "Integração removida" });
    fetchData();
  };

  const handleSync = async (formId: string) => {
    setSyncingId(formId);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { form_id: formId, sync_all: true },
      });
      if (error) throw error;
      toast({ title: `${data?.synced || 0} respostas sincronizadas!` });
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao sincronizar", description: err.message, variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <Sheet className="h-5 w-5 text-green-600" />
          Mapeamento de Formulários → Google Sheets
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum formulário neste workspace.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Formulário</TableHead>
                  <TableHead>Service Account</TableHead>
                  <TableHead>Spreadsheet ID</TableHead>
                  <TableHead>Aba</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Sync</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const edit = editState[row.formId] || { spreadsheetId: "", sheetName: "", serviceAccountId: "" };
                  const connected = !!row.integrationId;
                  const isSyncing = syncingId === row.formId;
                  const isSaving = savingId === row.formId;

                  return (
                    <TableRow key={row.formId}>
                      <TableCell className="font-medium whitespace-nowrap">{row.formName}</TableCell>
                      <TableCell>
                        <Select
                          value={edit.serviceAccountId}
                          onValueChange={(v) => updateEdit(row.formId, "serviceAccountId", v)}
                        >
                          <SelectTrigger className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Global (secret)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Global (secret)</SelectItem>
                            {serviceAccounts.map((sa) => (
                              <SelectItem key={sa.id} value={sa.id}>
                                {sa.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-[220px] h-8 text-xs"
                          placeholder="Spreadsheet ID"
                          value={edit.spreadsheetId}
                          onChange={(e) => updateEdit(row.formId, "spreadsheetId", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-[120px] h-8 text-xs"
                          placeholder="Sheet1"
                          value={edit.sheetName}
                          onChange={(e) => updateEdit(row.formId, "sheetName", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        {connected ? (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-600 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Conectado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
                            <XCircle className="h-3 w-3" /> Desconectado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.lastSyncedAt
                          ? formatDistanceToNow(new Date(row.lastSyncedAt), { addSuffix: true, locale: ptBR })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleSave(row)}
                            disabled={isSaving}
                          >
                            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                            Salvar
                          </Button>
                          {connected && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleSync(row.formId)}
                                disabled={isSyncing}
                              >
                                {isSyncing ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                )}
                                Sync
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive"
                                onClick={() => handleDisconnect(row)}
                              >
                                <Unlink className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
