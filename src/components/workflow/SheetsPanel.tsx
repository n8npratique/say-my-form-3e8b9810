import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, ExternalLink, AlertTriangle, RefreshCw, Trash2, Plus, Clock, History, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SheetsPanelProps {
  formId: string;
}

export const SheetsPanel = ({ formId }: SheetsPanelProps) => {
  const { toast } = useToast();
  const [integration, setIntegration] = useState<any>(null);
  const [hasServiceAccount, setHasServiceAccount] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchData();
  }, [formId]);

  // Polling: quando a integração está ativa mas sem spreadsheet_id,
  // verifica a cada 5s se a edge function já criou a planilha
  useEffect(() => {
    const config = (integration?.config as any) ?? {};
    if (!integration || config.spreadsheet_id || !config.enabled) return;
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [integration]);

  const fetchData = async () => {
    setLoading(true);

    // Buscar integração
    const { data: integ } = await supabase
      .from("integrations")
      .select("*")
      .eq("form_id", formId)
      .eq("type", "google_sheets")
      .maybeSingle();

    setIntegration(integ);

    // Verificar se tem service account configurada
    if (integ || !integ) {
      const { data: form } = await supabase
        .from("forms")
        .select("workspace_id")
        .eq("id", formId)
        .maybeSingle();

      if (form?.workspace_id) {
        const { data: sa } = await supabase
          .from("google_service_accounts")
          .select("id")
          .eq("workspace_id", form.workspace_id)
          .maybeSingle();
        setHasServiceAccount(!!sa);
      }
    }

    setLoading(false);
  };

  const activateIntegration = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("integrations")
      .insert({
        form_id: formId,
        type: "google_sheets",
        config: { enabled: true } as any,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao ativar", description: error.message, variant: "destructive" });
    } else {
      setIntegration(data);
      toast({ title: "Google Sheets ativado!", description: "A planilha será criada automaticamente na próxima resposta." });
    }
    setSaving(false);
  };

  const toggleEnabled = async (enabled: boolean) => {
    if (!integration) return;
    setSaving(true);
    // ⚠️ Sempre busca o config mais recente do banco antes de salvar
    // para não sobrescrever campos escritos pela edge function (ex: spreadsheet_id)
    const { data: fresh } = await supabase
      .from("integrations")
      .select("config")
      .eq("id", integration.id)
      .maybeSingle();
    const latestConfig = (fresh?.config as any) ?? (integration.config as any) ?? {};
    const { data } = await supabase
      .from("integrations")
      .update({ config: { ...latestConfig, enabled } } as any)
      .eq("id", integration.id)
      .select()
      .single();
    if (data) setIntegration(data);
    toast({ title: enabled ? "Sincronização ativada" : "Sincronização pausada" });
    setSaving(false);
  };

  const recreateSpreadsheet = async () => {
    if (!integration) return;
    setSaving(true);
    // ⚠️ Busca config mais recente antes de remover spreadsheet_id
    const { data: fresh } = await supabase
      .from("integrations")
      .select("config")
      .eq("id", integration.id)
      .maybeSingle();
    const latestConfig = (fresh?.config as any) ?? (integration.config as any) ?? {};
    const { spreadsheet_id: _, ...rest } = latestConfig;
    const { data } = await supabase
      .from("integrations")
      .update({ config: { ...rest } } as any)
      .eq("id", integration.id)
      .select()
      .single();
    if (data) setIntegration(data);
    toast({ title: "Planilha será recriada", description: "Na próxima resposta, uma nova planilha será criada." });
    setSaving(false);
  };

  const createSpreadsheetNow = async () => {
    if (!integration) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { form_id: formId, create_only: true },
      });
      if (error) throw error;
      toast({
        title: "Planilha criada!",
        description: "A planilha foi criada com sucesso no Google Drive.",
      });
      await fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao criar planilha", description: err.message, variant: "destructive" });
    }
    setCreating(false);
  };

  const fixPermissions = async () => {
    if (!integration) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { form_id: formId, fix_permissions: true },
      });
      if (error) throw error;
      if (data?.fixed) {
        toast({ title: "Permissões corrigidas!", description: "Tente abrir a planilha novamente." });
      } else {
        toast({ title: "Erro ao corrigir", description: data?.error ?? "Tente novamente.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao corrigir", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const syncPreviousResponses = async () => {
    if (!integration) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { form_id: formId, batch_sync: true },
      });
      if (error) throw error;
      if (data?.count === 0) {
        toast({ title: "Nenhuma resposta encontrada", description: "Não há respostas completas para sincronizar." });
      } else {
        toast({
          title: "Sincronização concluída!",
          description: `${data?.count ?? 0} resposta(s) sincronizada(s) com sucesso.`,
        });
      }
    } catch (err: any) {
      toast({ title: "Erro ao sincronizar", description: err.message, variant: "destructive" });
    }
    // Sempre atualiza o painel após sincronizar (captura spreadsheet_id criado pela edge fn)
    await fetchData();
    setSyncing(false);
  };

  const deleteIntegration = async () => {
    if (!integration) return;
    setSaving(true);
    await supabase.from("integrations").delete().eq("id", integration.id);
    setIntegration(null);
    setShowDeleteConfirm(false);
    toast({ title: "Integração removida" });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-green-600" />
        <h3 className="font-semibold text-sm">Google Sheets</h3>
        <button
          onClick={fetchData}
          className="ml-auto text-muted-foreground hover:text-foreground transition"
          title="Atualizar"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Aviso de service account */}
      {!hasServiceAccount && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            Configure a <strong>Google Service Account</strong> nas Configurações do Workspace para usar esta integração.
          </p>
        </div>
      )}

      {/* Estado: sem integração */}
      {!integration && (
        <div className="text-center py-6 space-y-3">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium">Google Sheets</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sincronize respostas automaticamente com uma planilha Google.
            </p>
          </div>
          <Button
            className="w-full gradient-primary text-primary-foreground"
            size="sm"
            onClick={activateIntegration}
            disabled={saving || !hasServiceAccount}
          >
            <Plus className="h-4 w-4 mr-1" /> Ativar Google Sheets
          </Button>
        </div>
      )}

      {/* Estado: integração configurada */}
      {integration && (
        <div className="space-y-4">
          {/* Toggle principal */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Sincronização ativa</p>
              <p className="text-xs text-muted-foreground">
                {(integration.config as any)?.enabled
                  ? "Respostas estão sendo enviadas ao Sheets"
                  : "Sincronização pausada"}
              </p>
            </div>
            <Switch
              checked={(integration.config as any)?.enabled ?? true}
              onCheckedChange={toggleEnabled}
              disabled={saving}
            />
          </div>

          {/* Link da planilha — sempre visível quando spreadsheet_id existe */}
          {(integration.config as any)?.spreadsheet_id ? (
            <div className="space-y-2">
              <a
                href={`https://docs.google.com/spreadsheets/d/${(integration.config as any).spreadsheet_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir planilha no Google Sheets
              </a>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={fixPermissions}
                  disabled={saving}
                  title="Reaplicar permissão pública na planilha (use se receber 'Acesso negado')"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Corrigir acesso
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={recreateSpreadsheet}
                  disabled={saving}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recriar
                </Button>
              </div>
            </div>
          ) : (integration.config as any)?.enabled ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Nenhuma planilha vinculada ainda
              </div>
              <Button
                size="sm"
                className="w-full gradient-primary text-primary-foreground text-xs"
                onClick={createSpreadsheetNow}
                disabled={creating || saving}
              >
                {creating ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5 mr-1" />
                )}
                {creating ? "Criando planilha..." : "Criar planilha agora"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
              Sincronização pausada. Respostas não serão enviadas ao Google Sheets até você reativar.
            </p>
          )}

          {/* Última sincronização */}
          {integration.last_synced_at && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Última sincronização:{" "}
              {format(new Date(integration.last_synced_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </div>
          )}

          {/* Sincronizar respostas anteriores */}
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={syncPreviousResponses}
              disabled={syncing || saving}
            >
              {syncing ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <History className="h-3.5 w-3.5 mr-1" />
              )}
              {syncing ? "Sincronizando..." : "Sincronizar respostas anteriores"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5 text-center leading-tight">
              Reprocessa todas as respostas já existentes no formulário
            </p>
          </div>

          {/* Remover integração */}
          <div className="pt-2 border-t">
            {showDeleteConfirm ? (
              <div className="space-y-2">
                <p className="text-xs text-destructive font-medium">Tem certeza? A configuração será removida.</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" className="flex-1 text-xs" onClick={deleteIntegration} disabled={saving}>
                    Confirmar remoção
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setShowDeleteConfirm(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover integração
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
