import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";

interface Props {
  scores: number[];
}

export const ScoreDistributionChart = ({ scores }: Props) => {
  const data = useMemo(() => {
    if (scores.length === 0) return [];
    const max = Math.max(...scores);
    const bucketSize = 10;
    const bucketCount = Math.ceil((max + 1) / bucketSize);
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      range: `${i * bucketSize}–${(i + 1) * bucketSize - 1}`,
      count: 0,
    }));
    scores.forEach((s) => {
      const idx = Math.min(Math.floor(s / bucketSize), bucketCount - 1);
      buckets[idx].count++;
    });
    return buckets;
  }, [scores]);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Distribuição de Scores
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="range" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" name="Respostas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
