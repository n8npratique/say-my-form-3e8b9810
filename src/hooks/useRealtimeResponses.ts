import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RealtimeResponse {
  id: string;
  form_id: string;
  started_at: string;
  status: string;
  meta: any;
}

interface UseRealtimeResponsesOptions {
  formId?: string;
  /** Optional: list of form IDs to watch (multi-form mode, e.g. Dashboard) */
  formIds?: string[];
}

export function useRealtimeResponses({ formId, formIds }: UseRealtimeResponsesOptions = {}) {
  const [newCount, setNewCount] = useState(0);
  const [lastResponse, setLastResponse] = useState<RealtimeResponse | null>(null);
  const [recentResponses, setRecentResponses] = useState<RealtimeResponse[]>([]);

  const resetCount = useCallback(() => {
    setNewCount(0);
  }, []);

  useEffect(() => {
    // Build filter if scoped to a single form
    const filter = formId ? `form_id=eq.${formId}` : undefined;
    const channelName = formId
      ? `responses:${formId}`
      : formIds
      ? `responses:multi:${formIds.join(",").slice(0, 60)}`
      : "responses:all";

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "responses",
          ...(filter ? { filter } : {}),
        },
        (payload: any) => {
          const newResponse = payload.new as RealtimeResponse;

          // If multi-form mode, filter by the provided formIds list
          if (formIds && !formIds.includes(newResponse.form_id)) return;

          setNewCount((c) => c + 1);
          setLastResponse(newResponse);
          setRecentResponses((prev) => [newResponse, ...prev].slice(0, 10));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [formId, formIds?.join(",")]);

  return { newCount, lastResponse, recentResponses, resetCount };
}
