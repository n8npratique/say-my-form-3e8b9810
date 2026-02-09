import type { FieldLogic, LogicCondition } from "@/types/workflow";

export function evaluateCondition(condition: LogicCondition, answer: any): boolean {
  const val = typeof answer === "string" ? answer : String(answer ?? "");
  
  switch (condition.op) {
    case "equals":
      return val === String(condition.value);
    case "not_equals":
      return val !== String(condition.value);
    case "contains":
      return val.toLowerCase().includes(String(condition.value ?? "").toLowerCase());
    case "greater_than":
      return Number(answer) > Number(condition.value);
    case "less_than":
      return Number(answer) < Number(condition.value);
    case "is_set":
      return val !== "" && val !== "undefined" && val !== "null";
    case "is_not_set":
      return val === "" || val === "undefined" || val === "null";
    default:
      return false;
  }
}

export function getNextFieldId(
  currentFieldId: string,
  answer: any,
  logic: FieldLogic[] | undefined,
  fieldIds: string[]
): string | "end" | null {
  if (!logic) return null;

  const fieldLogic = logic.find((l) => l.field_id === currentFieldId);
  if (!fieldLogic) return null;

  for (const rule of fieldLogic.rules) {
    if (evaluateCondition(rule.condition, answer)) {
      if (rule.action.type === "end") return "end";
      if (rule.action.type === "jump_to" && rule.action.target) return rule.action.target;
      return null; // "next" — use default sequential
    }
  }

  if (fieldLogic.default_action.type === "end") return "end";
  if (fieldLogic.default_action.type === "jump_to" && fieldLogic.default_action.target) {
    return fieldLogic.default_action.target;
  }

  return null; // default next
}

export function calculateScore(
  answers: Record<string, any>,
  fieldScores: Record<string, Record<string, number>>
): number {
  let total = 0;
  for (const [fieldId, scoreMap] of Object.entries(fieldScores)) {
    const answer = answers[fieldId];
    if (answer && scoreMap[String(answer)] !== undefined) {
      total += scoreMap[String(answer)];
    }
  }
  return total;
}

export function collectTags(
  answers: Record<string, any>,
  fieldTags: Record<string, Record<string, string[]>>
): string[] {
  const tags = new Set<string>();
  for (const [fieldId, tagMap] of Object.entries(fieldTags)) {
    const answer = answers[fieldId];
    if (answer && tagMap[String(answer)]) {
      tagMap[String(answer)].forEach((t) => tags.add(t));
    }
  }
  return Array.from(tags);
}

export function determineOutcome(
  answers: Record<string, any>,
  fieldOutcomes: Record<string, Record<string, string>>
): string | null {
  const counts: Record<string, number> = {};
  for (const [fieldId, outcomeMap] of Object.entries(fieldOutcomes)) {
    const answer = answers[fieldId];
    if (answer && outcomeMap[String(answer)]) {
      const oid = outcomeMap[String(answer)];
      counts[oid] = (counts[oid] || 0) + 1;
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [oid, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = oid;
      bestCount = count;
    }
  }
  return best;
}
