import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, ExternalLink, AlertTriangle, RefreshCw, Trash2, Plus, Clock, History } from "lucide-react";
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchData();
  }, [formId]);

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
    const config = (integration.config as any) || {};
    const { data } = await supabase
      .from("integrations")
      .update({ config: { ...config, enabled } } as any)
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
    const config = (integration.config as any) || {};
    const { spreadsheet_id: _, ...rest } = config;
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
        // Atualizar integração para refletir last_synced_at
        await fetchData();
      }
    } catch (err: any) {
      toast({ title: "Erro ao sincronizar", description: err.message, variant: "destructive" });
    }
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
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={recreateSpreadsheet}
                disabled={saving}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recriar planilha
              </Button>
            </div>
          ) : (integration.config as any)?.enabled ? (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              A planilha será criada na próxima resposta
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
