import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CalendarClock } from "lucide-react";
import type { FormField } from "@/types/workflow";

interface SlotDay {
  date: string;
  times: string[];
}

interface AppointmentPickerProps {
  field: FormField;
  formId: string;
  onSelect: (value: { date: string; time: string; slot_start: string; slot_end: string }) => void;
}

export const AppointmentPicker = ({ field, formId, onSelect }: AppointmentPickerProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [holdingSlot, setHoldingSlot] = useState(false);
  const sessionIdRef = useRef(crypto.randomUUID());

  const config = field.appointment_config;

  useEffect(() => {
    if (!config?.google_connection_id) {
      setError("Agendamento não configurado.");
      setLoading(false);
      return;
    }
    fetchAvailability();
  }, []);

  const fetchAvailability = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("check-availability", {
        body: {
          action: "check",
          form_id: formId,
          field_id: field.id,
          appointment_config: config,
          session_id: sessionIdRef.current,
        },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      setSlots(data?.available_slots || []);
      if (data?.available_slots?.length > 0) {
        setSelectedDate(data.available_slots[0].date);
      }
    } catch (err: any) {
      console.error("Availability error:", err);
      setError("Erro ao buscar horários disponíveis.");
    }
    setLoading(false);
  };

  const handleSelectTime = async (time: string) => {
    if (!selectedDate || !config) return;
    setHoldingSlot(true);

    const durationMin = config.slot_duration || 60;
    const slotStart = `${selectedDate}T${time}:00`;
    const startDate = new Date(slotStart);
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);
    const slotEnd = endDate.toISOString();

    // Create hold
    try {
      await supabase.functions.invoke("check-availability", {
        body: {
          action: "hold",
          form_id: formId,
          field_id: field.id,
          slot_start: startDate.toISOString(),
          slot_end: slotEnd,
          session_id: sessionIdRef.current,
        },
      });
    } catch {
      // Best effort — continue even if hold fails
    }

    setSelectedTime(time);
    setHoldingSlot(false);

    onSelect({
      date: selectedDate,
      time,
      slot_start: startDate.toISOString(),
      slot_end: slotEnd,
    });
  };

  const formatDateLabel = (dateStr: string): string => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const day = dayNames[date.getDay()];
    return `${day} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--runner-btn-bg)" }} />
        <span className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>
          Buscando horários disponíveis...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>{error}</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-8">
        <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>
          Nenhum horário disponível no momento.
        </p>
      </div>
    );
  }

  const currentTimes = slots.find((s) => s.date === selectedDate)?.times || [];

  return (
    <div className="space-y-4">
      {/* Day chips — horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
        {slots.map((day) => {
          const isActive = day.date === selectedDate;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => {
                setSelectedDate(day.date);
                setSelectedTime(null);
              }}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                isActive
                  ? "border-transparent shadow-sm"
                  : "border-border hover:border-current opacity-70 hover:opacity-100"
              }`}
              style={
                isActive
                  ? { backgroundColor: "var(--runner-btn-bg)", color: "var(--runner-btn-text)" }
                  : {}
              }
            >
              {formatDateLabel(day.date)}
              <span className="ml-1 text-xs opacity-60">({day.times.length})</span>
            </button>
          );
        })}
      </div>

      {/* Time grid */}
      {selectedDate && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {currentTimes.map((time) => {
            const isSelected = time === selectedTime;
            return (
              <button
                key={time}
                type="button"
                onClick={() => handleSelectTime(time)}
                disabled={holdingSlot}
                className={`py-3 rounded-lg border text-sm font-medium transition-all ${
                  isSelected
                    ? "border-transparent shadow-sm"
                    : "border-border hover:border-current"
                }`}
                style={
                  isSelected
                    ? { backgroundColor: "var(--runner-btn-bg)", color: "var(--runner-btn-text)" }
                    : {}
                }
              >
                {holdingSlot && isSelected ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  time
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedTime && (
        <p className="text-sm text-center" style={{ color: "var(--runner-text-secondary)" }}>
          Selecionado: <strong>{formatDateLabel(selectedDate!)}</strong> às <strong>{selectedTime}</strong>
        </p>
      )}
    </div>
  );
};
