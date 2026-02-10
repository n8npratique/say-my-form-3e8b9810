import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, RefreshCw, Link2, Unlink, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  formId: string;
}

export const GoogleSheetsIntegration = ({ formId }: Props) => {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Respostas");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | null>(null);

  useEffect(() => {
    loadIntegration();
  }, [formId]);

  const loadIntegration = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("integrations")
      .select("id, config")
      .eq("form_id", formId)
      .eq("type", "google_sheets")
      .maybeSingle();

    if (data) {
      const config = data.config as any;
      setConnected(true);
      setIntegrationId(data.id);
      setSpreadsheetId(config?.spreadsheet_id || "");
      setSheetName(config?.sheet_name || "Respostas");
    }
    setLoading(false);
  };

  const handleConnect = async () => {
    if (!spreadsheetId.trim()) {
      toast({ title: "Informe o ID da planilha", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (integrationId) {
        await supabase
          .from("integrations")
          .update({ config: { spreadsheet_id: spreadsheetId.trim(), sheet_name: sheetName.trim() || "Respostas" } as any })
          .eq("id", integrationId);
      } else {
        const { data } = await supabase
          .from("integrations")
          .insert({
            form_id: formId,
            type: "google_sheets",
            config: { spreadsheet_id: spreadsheetId.trim(), sheet_name: sheetName.trim() || "Respostas" } as any,
          })
          .select("id")
          .single();
        if (data) setIntegrationId(data.id);
      }
      setConnected(true);
      toast({ title: "Google Sheets conectado!" });
    } catch {
      toast({ title: "Erro ao salvar integração", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!integrationId) return;
    setSaving(true);
    try {
      await supabase.from("integrations").delete().eq("id", integrationId);
      setConnected(false);
      setIntegrationId(null);
      setSpreadsheetId("");
      setSheetName("Respostas");
      toast({ title: "Integração removida" });
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { form_id: formId, sync_all: true },
      });
      if (error) throw error;
      toast({ title: `${data?.synced || 0} respostas sincronizadas!` });
    } catch (err: any) {
      toast({ title: "Erro ao sincronizar", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sheet className="h-4 w-4 text-green-600" />
          Google Sheets
          {connected && <Badge variant="outline" className="text-xs text-green-600 border-green-600">Conectado</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Spreadsheet ID</Label>
          <Input
            placeholder="Cole o ID da planilha aqui"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            disabled={saving}
            className="text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Nome da aba</Label>
          <Input
            placeholder="Respostas"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            disabled={saving}
            className="text-xs"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {connected ? (
            <>
              <Button size="sm" variant="outline" onClick={handleConnect} disabled={saving}>
                <Link2 className="h-3 w-3 mr-1" /> Atualizar
              </Button>
              <Button size="sm" onClick={handleSyncAll} disabled={syncing}>
                {syncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Sincronizar Tudo
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={saving}>
                <Unlink className="h-3 w-3 mr-1" /> Desconectar
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleConnect} disabled={saving || !spreadsheetId.trim()}>
              <Link2 className="h-3 w-3 mr-1" /> Conectar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
