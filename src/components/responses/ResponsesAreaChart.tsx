import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  responses: { started_at: string; completed_at: string | null; status: string }[];
}

export const ResponsesAreaChart = ({ responses }: Props) => {
  const data = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = startOfDay(subDays(new Date(), 29 - i));
      return { date: d, label: format(d, "dd/MM", { locale: ptBR }), count: 0 };
    });
    responses.forEach((r) => {
      const d = startOfDay(new Date(r.started_at));
      const bucket = days.find((b) => b.date.getTime() === d.getTime());
      if (bucket) bucket.count++;
    });
    return days.map(({ label, count }) => ({ label, count }));
  }, [responses]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Respostas por Dia (30 dias)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ left: -10, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="label"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              interval={4}
            />
            <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              name="Respostas"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="hsl(var(--primary) / 0.15)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
