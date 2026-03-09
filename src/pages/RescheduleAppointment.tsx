import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase, invokeEdgeFunction } from "@/integrations/supabase/client";
import { AppointmentPicker } from "@/components/form-runner/AppointmentPicker";
import { CalendarClock, CheckCircle2, AlertTriangle, Loader2, CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoPratique from "@/assets/logo-pratique.png";
import type { FormField, AppointmentConfig } from "@/types/workflow";

type RescheduleState =
  | "loading"
  | "ready"
  | "submitting"
  | "rescheduled"
  | "already_cancelled"
  | "not_found"
  | "no_event"
  | "error";

const RescheduleAppointment = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<RescheduleState>("loading");
  const [formName, setFormName] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [formId, setFormId] = useState("");
  const [appointmentField, setAppointmentField] = useState<FormField | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string; slot_start: string; slot_end: string } | null>(null);
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    if (token) loadInfo();
  }, [token]);

  const loadInfo = async () => {
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

    setFormId(response.form_id);

    // Fetch form name
    const { data: form } = await supabase
      .from("forms")
      .select("name, published_version_id")
      .eq("id", response.form_id)
      .maybeSingle();

    setFormName(form?.name || "");

    // Fetch appointment field config from schema
    if (form?.published_version_id) {
      const { data: version } = await supabase
        .from("form_versions")
        .select("schema")
        .eq("id", form.published_version_id)
        .maybeSingle();

      const schema = (version?.schema as any) || {};
      const fields: FormField[] = schema.fields || [];
      const apptField = fields.find((f) => f.type === "appointment");
      if (apptField) {
        setAppointmentField(apptField);
      }
    }

    // Get current appointment date
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

  const handleSlotSelect = (value: { date: string; time: string; slot_start: string; slot_end: string }) => {
    setSelectedSlot(value);
    const dt = new Date(value.slot_start);
    setNewDate(
      dt.toLocaleString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    );
  };

  const handleReschedule = async () => {
    if (!selectedSlot) return;
    setState("submitting");

    try {
      const { data, error } = await invokeEdgeFunction("reschedule-appointment", {
        session_token: token,
        new_slot_start: selectedSlot.slot_start,
        new_slot_end: selectedSlot.slot_end,
      });

      if (error) throw error;

      if (data?.rescheduled) {
        setState("rescheduled");
      } else {
        setErrorMsg(data?.reason || "Erro desconhecido");
        setState("error");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao reagendar");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <img src={logoPratique} alt="TecForms" className="h-10 w-10 mx-auto rounded-full" />
        </div>

        {state === "loading" && (
          <div className="space-y-3 text-center">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-gray-400" />
            <p className="text-gray-500">Carregando informações...</p>
          </div>
        )}

        {state === "ready" && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <CalendarClock className="h-12 w-12 mx-auto text-blue-500" />
              <h1 className="text-xl font-bold text-gray-900">Reagendar</h1>
              {formName && (
                <p className="text-gray-600 text-sm">
                  Formulário: <strong>{formName}</strong>
                </p>
              )}
              {appointmentDate && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Agendamento atual</p>
                  <p className="text-sm font-medium text-gray-800">{appointmentDate}</p>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-gray-600 mb-3">Escolha um novo horário:</p>
              {appointmentField && formId ? (
                <AppointmentPicker
                  field={appointmentField}
                  formId={formId}
                  onSelect={handleSlotSelect}
                  locale="pt-BR"
                />
              ) : (
                <p className="text-sm text-red-500">Configuração de agendamento não encontrada.</p>
              )}
            </div>

            {selectedSlot && (
              <div className="space-y-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-600">Novo horário selecionado</p>
                  <p className="text-sm font-medium text-blue-800">{newDate}</p>
                </div>
                <Button
                  onClick={handleReschedule}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Confirmar Reagendamento
                </Button>
              </div>
            )}
          </div>
        )}

        {state === "submitting" && (
          <div className="space-y-3 text-center">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-blue-500" />
            <p className="text-gray-600">Reagendando...</p>
          </div>
        )}

        {state === "rescheduled" && (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="h-14 w-14 mx-auto text-green-500" />
            <h1 className="text-xl font-bold text-gray-900">Reagendado!</h1>
            <p className="text-gray-600">
              Seu agendamento foi reagendado com sucesso.
            </p>
            {newDate && (
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-green-600">Novo horário</p>
                <p className="text-sm font-medium text-green-800">{newDate}</p>
              </div>
            )}
          </div>
        )}

        {state === "already_cancelled" && (
          <div className="space-y-4 text-center">
            <CalendarX2 className="h-14 w-14 mx-auto text-yellow-500" />
            <h1 className="text-xl font-bold text-gray-900">Cancelado</h1>
            <p className="text-gray-600">Este agendamento já foi cancelado e não pode ser reagendado.</p>
          </div>
        )}

        {state === "not_found" && (
          <div className="space-y-4 text-center">
            <AlertTriangle className="h-14 w-14 mx-auto text-gray-400" />
            <h1 className="text-xl font-bold text-gray-900">Link Inválido</h1>
            <p className="text-gray-600">Este link de reagendamento não é válido ou já expirou.</p>
          </div>
        )}

        {state === "no_event" && (
          <div className="space-y-4 text-center">
            <AlertTriangle className="h-14 w-14 mx-auto text-gray-400" />
            <h1 className="text-xl font-bold text-gray-900">Nenhum Agendamento</h1>
            <p className="text-gray-600">Nenhum agendamento encontrado para esta resposta.</p>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4 text-center">
            <AlertTriangle className="h-14 w-14 mx-auto text-red-500" />
            <h1 className="text-xl font-bold text-gray-900">Erro</h1>
            <p className="text-gray-600">Não foi possível reagendar.</p>
            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            <Button onClick={() => setState("ready")} variant="outline" className="w-full">
              Tentar Novamente
            </Button>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">TecForms</p>
      </div>
    </div>
  );
};

export default RescheduleAppointment;
