import type { FormField } from "@/types/workflow";
import type { ContactFieldKey } from "@/types/workflow";

export interface FieldOption {
  value: string;  // "field-uuid" or "field-uuid::phone"
  label: string;  // "Telefone" or "Contato → Telefone"
}

const SUBFIELD_LABELS: Record<ContactFieldKey, string> = {
  first_name: "Nome",
  last_name: "Sobrenome",
  email: "Email",
  phone: "Telefone",
  cpf: "CPF",
  cep: "CEP",
  address: "Endereço",
};

const FILTER_MAP: Record<string, ContactFieldKey[]> = {
  phone: ["phone"],
  name: ["first_name", "last_name"],
  email: ["email"],
};

/**
 * Expands form fields into selectable options for integration dropdowns.
 *
 * For regular fields (short_text, phone, etc.) → returns { value: id, label }.
 * For contact_info → expands each active sub-field matching the filter,
 * using the "fieldId::subkey" notation (e.g. "uuid::phone").
 *
 * @param filter - "phone" | "name" | "email" | "all"
 */
export function expandFieldOptions(
  fields: FormField[],
  filter: "phone" | "name" | "email" | "all"
): FieldOption[] {
  const result: FieldOption[] = [];

  for (const f of fields) {
    if (f.type === "contact_info") {
      const activeSubFields = f.contact_fields ?? [];
      const allowed = filter === "all" ? activeSubFields : activeSubFields.filter((k) => FILTER_MAP[filter]?.includes(k));

      for (const subkey of allowed) {
        result.push({
          value: `${f.id}::${subkey}`,
          label: `${f.label || "Contato"} → ${SUBFIELD_LABELS[subkey] ?? subkey}`,
        });
      }
    } else {
      // Regular fields: include based on filter type
      if (filter === "phone" && ["phone", "short_text"].includes(f.type)) {
        result.push({ value: f.id, label: f.label || f.type });
      } else if (filter === "name" && ["short_text"].includes(f.type)) {
        result.push({ value: f.id, label: f.label || f.type });
      } else if (filter === "email" && ["email", "short_text"].includes(f.type)) {
        result.push({ value: f.id, label: f.label || f.type });
      } else if (filter === "all" && !["welcome_screen", "end_screen", "statement"].includes(f.type)) {
        result.push({ value: f.id, label: f.label || f.type });
      }
    }
  }

  return result;
}
