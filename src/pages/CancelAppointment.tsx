import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CalendarX2, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoPratique from "@/assets/logo-pratique.png";

type CancelState =
  | "loading"
  | "ready"
  | "confirming"
  | "cancelled"
  | "already_cancelled"
  | "not_found"
  | "no_event"
  | "error";

const CancelAppointment = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<CancelState>("loading");
  const [formName, setFormName] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (token) loadAppointmentInfo();
  }, [token]);

  const loadAppointmentInfo = async () => {
    // Fetch response by session_token
    const { data: response } = await supabase
      .from("responses")
      .select("id, status, meta, form_id")
      .eq("session_token", token!)
      .maybeSingle();

    if (!response) {
      setState("not_found");
      return;
    }

    if (response.status === "cancelled") {
      setState("already_cancelled");
      return;
    }

    const meta = (response.meta as any) || {};
    if (!meta.calendar_event_id) {
      setState("no_event");
      return;
    }

    // Fetch form name
    const { data: form } = await supabase
      .from("forms")
      .select("name")
      .eq("id", response.form_id)
      .maybeSingle();

    setFormName(form?.name || "");

    // Try to find appointment date from response answers
    const { data: answers } = await supabase
      .from("response_answers")
      .select("value")
      .eq("response_id", response.id);

    for (const ans of answers || []) {
      const val = typeof ans.value === "string"
        ? (() => { try { return JSON.parse(ans.value); } catch { return null; } })()
        : ans.value;
      if (val && val.slot_start) {
        const date = new Date(val.slot_start);
        setAppointmentDate(
          date.toLocaleString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })
        );
        break;
      }
    }

    setState("ready");
  };

  const handleCancel = async () => {
    setState("confirming");
    try {
      const { data, error } = await supabase.functions.invoke("cancel-appointment", {
        body: { session_token: token },
      });

      if (error) throw error;

      if (data?.cancelled) {
        setState("cancelled");
      } else if (data?.reason === "already_cancelled") {
        setState("already_cancelled");
      } else {
        setErrorMsg(data?.reason || "Erro desconhecido");
        setState("error");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao cancelar");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center space-y-6">
        <img src={logoPratique} alt="TecForms" className="h-10 w-10 mx-auto rounded-full" />

        {state === "loading" && (
          <div className="space-y-3">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-gray-400" />
            <p className="text-gray-500">Carregando informações...</p>
          </div>
        )}

        {state === "ready" && (
          <div className="space-y-4">
            <CalendarX2 className="h-14 w-14 mx-auto text-red-500" />
            <h1 className="text-xl font-bold text-gray-900">Cancelar Agendamento</h1>
            {formName && (
              <p className="text-gray-600">
                Formulário: <strong>{formName}</strong>
              </p>
            )}
            {appointmentDate && (
              <p className="text-gray-600">
                Data: <strong>{appointmentDate}</strong>
              </p>
            )}
            <p className="text-sm text-gray-500">
              Tem certeza que deseja cancelar este agendamento? O evento será removido do calendário.
            </p>
            <Button
              onClick={handleCancel}
              variant="destructive"
              className="w-full"
            >
              Confirmar Cancelamento
            </Button>
          </div>
        )}

        {state === "confirming" && (
          <div className="space-y-3">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-red-500" />
            <p className="text-gray-600">Cancelando agendamento...</p>
          </div>
        )}

        {state === "cancelled" && (
          <div className="space-y-4">
            <CheckCircle2 className="h-14 w-14 mx-auto text-green-500" />
            <h1 className="text-xl font-bold text-gray-900">Agendamento Cancelado</h1>
            <p className="text-gray-600">
              Seu agendamento foi cancelado com sucesso. O evento foi removido do calendário.
            </p>
          </div>
        )}

        {state === "already_cancelled" && (
          <div className="space-y-4">
            <AlertTriangle className="h-14 w-14 mx-auto text-yellow-500" />
            <h1 className="text-xl font-bold text-gray-900">Já Cancelado</h1>
            <p className="text-gray-600">Este agendamento já foi cancelado anteriormente.</p>
          </div>
        )}

        {state === "not_found" && (
          <div className="space-y-4">
            <AlertTriangle className="h-14 w-14 mx-auto text-gray-400" />
            <h1 className="text-xl font-bold text-gray-900">Link Inválido</h1>
            <p className="text-gray-600">Este link de cancelamento não é válido ou já expirou.</p>
          </div>
        )}

        {state === "no_event" && (
          <div className="space-y-4">
            <AlertTriangle className="h-14 w-14 mx-auto text-gray-400" />
            <h1 className="text-xl font-bold text-gray-900">Nenhum Agendamento</h1>
            <p className="text-gray-600">Nenhum agendamento encontrado para esta resposta.</p>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4">
            <AlertTriangle className="h-14 w-14 mx-auto text-red-500" />
            <h1 className="text-xl font-bold text-gray-900">Erro</h1>
            <p className="text-gray-600">Não foi possível cancelar o agendamento.</p>
            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            <Button onClick={handleCancel} variant="outline" className="w-full">
              Tentar Novamente
            </Button>
          </div>
        )}

        <p className="text-xs text-gray-400">TecForms</p>
      </div>
    </div>
  );
};

export default CancelAppointment;
