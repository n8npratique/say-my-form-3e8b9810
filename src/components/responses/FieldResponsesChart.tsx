import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ListChecks } from "lucide-react";

const CHOICE_TYPES = ["multiple_choice", "dropdown", "yes_no", "checkbox"];

interface SchemaField {
  id: string;
  type: string;
  label?: string;
  options?: string[];
}

interface Answer {
  field_key: string;
  value: any;
  value_text: string | null;
}

interface Props {
  fields: SchemaField[];
  fieldMap: Record<string, string>;
  allAnswers: Answer[];
}

export const FieldResponsesChart = ({ fields, fieldMap, allAnswers }: Props) => {
  const charts = useMemo(() => {
    const choiceFields = fields.filter((f) => CHOICE_TYPES.includes(f.type));
    return choiceFields.map((field) => {
      const counts: Record<string, number> = {};
      allAnswers
        .filter((a) => a.field_key === field.id)
        .forEach((a) => {
          const vals = Array.isArray(a.value) ? a.value : [a.value_text || a.value];
          vals.forEach((v: any) => {
            if (v != null) {
              const key = String(v);
              counts[key] = (counts[key] || 0) + 1;
            }
          });
        });
      const data = Object.entries(counts).map(([option, count]) => ({ option, count }));
      return { fieldId: field.id, label: fieldMap[field.id] || field.id, data };
    }).filter((c) => c.data.length > 0);
  }, [fields, fieldMap, allAnswers]);

  if (charts.length === 0) return null;

  return (
    <>
      {charts.map((chart) => (
        <Card key={chart.fieldId}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> {chart.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(150, chart.data.length * 40)}>
              <BarChart data={chart.data} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis dataKey="option" type="category" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" name="Respostas" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ))}
    </>
  );
};
