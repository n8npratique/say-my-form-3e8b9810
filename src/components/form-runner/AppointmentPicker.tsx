import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CalendarClock, Check } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale/pt-BR";
import { es } from "date-fns/locale/es";
import type { FormField } from "@/types/workflow";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface SlotDay {
  date: string;
  times: string[];
}

interface AppointmentPickerProps {
  field: FormField;
  formId: string;
  onSelect: (value: { date: string; time: string; slot_start: string; slot_end: string }) => void;
  locale?: Locale;
}

export const AppointmentPicker = ({ field, formId, onSelect, locale }: AppointmentPickerProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [holdingSlot, setHoldingSlot] = useState(false);
  const [conflictTime, setConflictTime] = useState<string | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  const config = field.appointment_config;
  const i = t(locale);
  const calendarLocale = locale === "es-AR" ? es : locale === "en-US" ? undefined : ptBR;

  useEffect(() => {
    if (!config?.google_connection_id) {
      setError(i.appointmentNotConfigured);
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
      setError(i.appointmentError);
    }
    setLoading(false);
  };

  const handleSelectTime = async (time: string) => {
    if (!selectedDate || !config) return;
    setHoldingSlot(true);
    setConflictTime(null);

    const durationMin = config.slot_duration || 60;
    const slotStart = `${selectedDate}T${time}:00`;
    const startDate = new Date(slotStart);
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);
    const slotEnd = endDate.toISOString();

    // Create hold — check for conflict
    try {
      const { data } = await supabase.functions.invoke("check-availability", {
        body: {
          action: "hold",
          form_id: formId,
          field_id: field.id,
          slot_start: startDate.toISOString(),
          slot_end: slotEnd,
          session_id: sessionIdRef.current,
        },
      });

      if (data?.conflict) {
        // Slot was taken by another user — remove it from local state
        setSlots((prev) =>
          prev
            .map((day) =>
              day.date === selectedDate
                ? { ...day, times: day.times.filter((t) => t !== time) }
                : day
            )
            .filter((day) => day.times.length > 0)
        );
        setConflictTime(time);
        setHoldingSlot(false);
        return;
      }
    } catch {
      // Network error — continue best-effort
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

  // ── Derived data ──

  /** Set of available date strings (YYYY-MM-DD) for fast lookup */
  const availableDateSet = useMemo(() => new Set(slots.map((s) => s.date)), [slots]);

  /** Convert date string to Date object (local midnight) */
  const toDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  /** The Calendar `selected` Date object */
  const calendarSelected = selectedDate ? toDate(selectedDate) : undefined;

  /** Times for the selected date */
  const currentTimes = slots.find((s) => s.date === selectedDate)?.times || [];

  /** Disable any day NOT in our available set */
  const disabledMatcher = (date: Date) => {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return !availableDateSet.has(iso);
  };

  /** Month range for navigation limits */
  const monthRange = useMemo(() => {
    if (slots.length === 0) return { from: new Date(), to: new Date() };
    const first = toDate(slots[0].date);
    const last = toDate(slots[slots.length - 1].date);
    return { from: new Date(first.getFullYear(), first.getMonth(), 1), to: new Date(last.getFullYear(), last.getMonth() + 1, 0) };
  }, [slots]);

  // ── Formatters ──

  const formatLongDate = (dateStr: string): string => {
    const d = toDate(dateStr);
    const localeMap: Record<string, string> = { "pt-BR": "pt-BR", "es-AR": "es-AR", "en-US": "en-US" };
    const dtLocale = localeMap[locale || "pt-BR"] || "pt-BR";
    return d.toLocaleDateString(dtLocale, { weekday: "long", day: "numeric", month: "short" });
  };

  const formatEndTime = (time: string): string => {
    const durationMin = config?.slot_duration || 60;
    const [h, m] = time.split(":").map(Number);
    const total = h * 60 + m + durationMin;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  // ── Render states ──

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--runner-btn-bg)" }} />
        <span className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>
          {i.appointmentLoading}
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
          {i.appointmentNoSlots}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Calendar + Time Slots (side by side on desktop, stacked on mobile) ── */}
      <div className="flex flex-col sm:flex-row rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--runner-border, #e5e7eb)" }}>

        {/* Left: Mini calendar */}
        <div className="sm:border-r p-2 flex justify-center"
          style={{ borderColor: "var(--runner-border, #e5e7eb)" }}>
          <Calendar
            mode="single"
            locale={calendarLocale}
            selected={calendarSelected}
            onSelect={(date) => {
              if (!date) return;
              const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
              if (availableDateSet.has(iso)) {
                setSelectedDate(iso);
                setSelectedTime(null);
                setConflictTime(null);
              }
            }}
            disabled={disabledMatcher}
            fromMonth={monthRange.from}
            toMonth={monthRange.to}
            defaultMonth={calendarSelected || monthRange.from}
            classNames={{
              day_selected: "",
            }}
            modifiersStyles={{
              selected: {
                backgroundColor: "var(--runner-btn-bg)",
                color: "var(--runner-btn-text)",
                borderRadius: "9999px",
              },
            }}
          />
        </div>

        {/* Right: Time slots */}
        <div className="flex-1 p-4 min-w-0">
          {selectedDate ? (
            <>
              <p className="text-sm font-medium mb-3" style={{ color: "var(--runner-text)" }}>
                {formatLongDate(selectedDate)}
              </p>
              <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "280px", scrollbarWidth: "thin" }}>
                {currentTimes.length > 0 ? (
                  currentTimes.map((time) => {
                    const isSelected = time === selectedTime;
                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => handleSelectTime(time)}
                        disabled={holdingSlot}
                        className="w-full py-2.5 px-4 rounded-lg border text-sm font-medium transition-all text-left"
                        style={
                          isSelected
                            ? {
                                backgroundColor: "var(--runner-btn-bg)",
                                color: "var(--runner-btn-text)",
                                borderColor: "var(--runner-btn-bg)",
                              }
                            : {
                                borderColor: "var(--runner-border, #e5e7eb)",
                                color: "var(--runner-text)",
                              }
                        }
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = "var(--runner-btn-bg)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = "var(--runner-border, #e5e7eb)";
                          }
                        }}
                      >
                        {holdingSlot && isSelected ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          time
                        )}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm py-4 text-center" style={{ color: "var(--runner-text-secondary)" }}>
                    {i.appointmentNoTimesThisDay}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: "var(--runner-text-secondary)" }}>
                {i.appointmentSelectDay}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Conflict warning ── */}
      {conflictTime && (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
          style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}
        >
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>{i.appointmentConflict(conflictTime)}</span>
        </div>
      )}

      {/* ── Confirmation badge ── */}
      {selectedTime && selectedDate && (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
          style={{
            backgroundColor: "color-mix(in srgb, var(--runner-btn-bg) 12%, transparent)",
            color: "var(--runner-btn-bg)",
          }}
        >
          <Check className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            {formatLongDate(selectedDate)} &middot; {selectedTime} – {formatEndTime(selectedTime)}
          </span>
        </div>
      )}
    </div>
  );
};
