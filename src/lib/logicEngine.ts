import type { FieldLogic, LogicCondition } from "@/types/workflow";

export function evaluateCondition(condition: LogicCondition, answer: any): boolean {
  // "always" operator - unconditional jump
  if (condition.op === "always") return true;

  // Normalize answer
  const isArray = Array.isArray(answer);
  const isObject = typeof answer === "object" && answer !== null && !isArray;

  // For is_set / is_not_set, handle all types
  if (condition.op === "is_set") {
    if (answer == null) return false;
    if (isArray) return answer.length > 0;
    if (isObject) return Object.values(answer).some((v) => v != null && v !== "");
    const s = String(answer);
    return s !== "" && s !== "undefined" && s !== "null";
  }
  if (condition.op === "is_not_set") {
    return !evaluateCondition({ op: "is_set" }, answer);
  }

  const condValue = String(condition.value ?? "");

  // Array answers (checkbox, ranking)
  if (isArray) {
    switch (condition.op) {
      case "equals":
        return answer.some((item: any) => String(item) === condValue);
      case "not_equals":
        return !answer.some((item: any) => String(item) === condValue);
      case "contains":
        return answer.some((item: any) =>
          String(item).toLowerCase().includes(condValue.toLowerCase())
        );
      case "greater_than":
        return answer.length > Number(condition.value);
      case "less_than":
        return answer.length < Number(condition.value);
      default:
        return false;
    }
  }

  // Object answers (contact_info)
  if (isObject) {
    const values = Object.values(answer).map((v) => String(v ?? ""));
    switch (condition.op) {
      case "equals":
        return values.some((v) => v === condValue);
      case "not_equals":
        return !values.some((v) => v === condValue);
      case "contains":
        return values.some((v) => v.toLowerCase().includes(condValue.toLowerCase()));
      default:
        return false;
    }
  }

  // Scalar (string, number, boolean)
  const val = String(answer ?? "");

  switch (condition.op) {
    case "equals":
      return val === condValue;
    case "not_equals":
      return val !== condValue;
    case "contains":
      return val.toLowerCase().includes(condValue.toLowerCase());
    case "greater_than":
      return Number(answer) > Number(condition.value);
    case "less_than":
      return Number(answer) < Number(condition.value);
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

export function validateLogic(
  logic: FieldLogic[],
  fieldIds: string[]
): { fieldId: string; issue: string }[] {
  const issues: { fieldId: string; issue: string }[] = [];
  for (const l of logic) {
    if (!fieldIds.includes(l.field_id)) {
      issues.push({ fieldId: l.field_id, issue: "Campo de origem não existe" });
      continue;
    }
    for (const rule of l.rules) {
      if (rule.action.type === "jump_to" && rule.action.target) {
        if (!fieldIds.includes(rule.action.target)) {
          issues.push({ fieldId: l.field_id, issue: `Target "${rule.action.target}" não existe` });
        }
      }
    }
    if (l.default_action.type === "jump_to" && l.default_action.target) {
      if (!fieldIds.includes(l.default_action.target)) {
        issues.push({ fieldId: l.field_id, issue: `Default target "${l.default_action.target}" não existe` });
      }
    }
  }
  return issues;
}
