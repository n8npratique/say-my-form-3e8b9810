import type { FormField } from "@/types/workflow";

function formatPipedValue(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    // Contact info objects: prefer "first_name last_name"
    if (value.first_name || value.last_name) {
      return [value.first_name, value.last_name].filter(Boolean).join(" ");
    }
    return Object.values(value).filter(Boolean).join(", ");
  }
  return String(value);
}

/**
 * Resolves `{{...}}` placeholders in text with previous answers.
 *
 * Supported patterns:
 *  - `{{field_id}}`      — matches by field ID directly
 *  - `{{field:Label}}`   — matches by "field:" prefix + field label
 *  - `{{Label}}`         — matches by field label (case-insensitive)
 */
export function resolveAnswerPiping(
  text: string,
  answers: Record<string, any>,
  fields: FormField[],
): string {
  if (!text || !text.includes("{{")) return text;

  return text.replace(/\{\{(.+?)\}\}/g, (_match, key: string) => {
    const trimmed = key.trim();

    // 1. Direct field ID match
    if (answers[trimmed] !== undefined) {
      return formatPipedValue(answers[trimmed]);
    }

    // 2. "field:Label" pattern
    if (trimmed.toLowerCase().startsWith("field:")) {
      const label = trimmed.slice(6).trim();
      const field = fields.find(
        (f) => f.label.toLowerCase() === label.toLowerCase(),
      );
      if (field && answers[field.id] !== undefined) {
        return formatPipedValue(answers[field.id]);
      }
    }

    // 3. Match by label directly (case-insensitive)
    const fieldByLabel = fields.find(
      (f) => f.label.toLowerCase() === trimmed.toLowerCase(),
    );
    if (fieldByLabel && answers[fieldByLabel.id] !== undefined) {
      return formatPipedValue(answers[fieldByLabel.id]);
    }

    // Fallback: replace with empty string
    return "";
  });
}
