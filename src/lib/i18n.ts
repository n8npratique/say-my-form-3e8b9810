export type Locale = "pt-BR" | "es-AR" | "en-US";

export interface Translations {
  // Runner navigation
  next: string;
  ok: string;
  continue: string;
  submit: string;
  questionOf: string; // "1 → 5"

  // Placeholders
  typeYourAnswer: string;
  websiteExample: string;
  numberExample: string;

  // Yes/No
  yes: string;
  no: string;

  // NPS
  notLikely: string;
  veryLikely: string;

  // Contact fields
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
  contactCpf: string;
  contactCep: string;
  contactAddress: string;

  // Appointment picker
  appointmentNotConfigured: string;
  appointmentLoading: string;
  appointmentNoSlots: string;
  appointmentNoTimesThisDay: string;
  appointmentSelectDay: string;
  appointmentError: string;
  appointmentConflict: (time: string) => string;

  // Completion
  thankYou: string;
  responseSent: string;
  yourScore: string;

  // Duplicate
  duplicateTitle: string;

  // Email gate
  emailGateTitle: string;
  emailGatePlaceholder: string;
  emailGateSubmit: string;
}

const ptBR: Translations = {
  next: "Próximo",
  ok: "OK",
  continue: "Continuar",
  submit: "Enviar",
  questionOf: "→",

  typeYourAnswer: "Digite sua resposta...",
  websiteExample: "Ex: https://www.seusite.com.br",
  numberExample: "Ex: 1234",

  yes: "Sim",
  no: "Não",

  notLikely: "Nada provável",
  veryLikely: "Muito provável",

  contactFirstName: "Nome",
  contactLastName: "Sobrenome",
  contactEmail: "E-mail",
  contactPhone: "Telefone",
  contactCpf: "CPF",
  contactCep: "CEP",
  contactAddress: "Endereço",

  appointmentNotConfigured: "Agendamento não configurado.",
  appointmentLoading: "Buscando horários disponíveis...",
  appointmentNoSlots: "Nenhum horário disponível no momento.",
  appointmentNoTimesThisDay: "Nenhum horário neste dia.",
  appointmentSelectDay: "Selecione um dia no calendário.",
  appointmentError: "Erro ao buscar horários disponíveis.",
  appointmentConflict: (time) => `O horário ${time} acabou de ser reservado por outra pessoa. Escolha outro.`,

  thankYou: "Obrigado!",
  responseSent: "Suas respostas foram enviadas com sucesso.",
  yourScore: "Sua pontuação",

  duplicateTitle: "Resposta duplicada",

  emailGateTitle: "Insira seu e-mail para começar",
  emailGatePlaceholder: "seunome@provedor.com",
  emailGateSubmit: "Começar",
};

const esAR: Translations = {
  next: "Siguiente",
  ok: "OK",
  continue: "Continuar",
  submit: "Enviar",
  questionOf: "→",

  typeYourAnswer: "Escriba su respuesta...",
  websiteExample: "Ej: https://www.sitio.com.ar",
  numberExample: "Ej: 1234",

  yes: "Sí",
  no: "No",

  notLikely: "Nada probable",
  veryLikely: "Muy probable",

  contactFirstName: "Nombre",
  contactLastName: "Apellido",
  contactEmail: "Correo electrónico",
  contactPhone: "Teléfono",
  contactCpf: "DNI",
  contactCep: "Código postal",
  contactAddress: "Dirección",

  appointmentNotConfigured: "Agenda no configurada.",
  appointmentLoading: "Buscando horarios disponibles...",
  appointmentNoSlots: "No hay horarios disponibles en este momento.",
  appointmentNoTimesThisDay: "Sin horarios en este día.",
  appointmentSelectDay: "Seleccione un día en el calendario.",
  appointmentError: "Error al buscar horarios disponibles.",
  appointmentConflict: (time) => `El horario ${time} acaba de ser reservado por otra persona. Elija otro.`,

  thankYou: "¡Gracias!",
  responseSent: "Sus respuestas fueron enviadas con éxito.",
  yourScore: "Su puntuación",

  duplicateTitle: "Respuesta duplicada",

  emailGateTitle: "Ingrese su correo para comenzar",
  emailGatePlaceholder: "nombre@proveedor.com",
  emailGateSubmit: "Comenzar",
};

const enUS: Translations = {
  next: "Next",
  ok: "OK",
  continue: "Continue",
  submit: "Submit",
  questionOf: "of",

  typeYourAnswer: "Type your answer...",
  websiteExample: "E.g.: https://www.yoursite.com",
  numberExample: "E.g.: 1234",

  yes: "Yes",
  no: "No",

  notLikely: "Not likely",
  veryLikely: "Very likely",

  contactFirstName: "First name",
  contactLastName: "Last name",
  contactEmail: "Email",
  contactPhone: "Phone",
  contactCpf: "ID Number",
  contactCep: "ZIP Code",
  contactAddress: "Address",

  appointmentNotConfigured: "Scheduling not configured.",
  appointmentLoading: "Loading available times...",
  appointmentNoSlots: "No available times at the moment.",
  appointmentNoTimesThisDay: "No times available for this day.",
  appointmentSelectDay: "Select a day on the calendar.",
  appointmentError: "Error loading available times.",
  appointmentConflict: (time) => `The ${time} slot was just booked by someone else. Please choose another.`,

  thankYou: "Thank you!",
  responseSent: "Your responses have been submitted successfully.",
  yourScore: "Your score",

  duplicateTitle: "Duplicate response",

  emailGateTitle: "Enter your email to begin",
  emailGatePlaceholder: "you@provider.com",
  emailGateSubmit: "Start",
};

const translations: Record<Locale, Translations> = {
  "pt-BR": ptBR,
  "es-AR": esAR,
  "en-US": enUS,
};

export function t(locale: Locale | undefined): Translations {
  return translations[locale || "pt-BR"] || translations["pt-BR"];
}

/** date-fns locale imports mapped by our locale keys */
export function getDateLocale(locale: Locale | undefined) {
  // Returns the import path string — caller handles dynamic import
  // For now we map to static locale objects
  switch (locale) {
    case "es-AR": return undefined; // react-day-picker defaults work for Spanish with custom formatters
    case "en-US": return undefined; // English is react-day-picker default
    default: return undefined;      // pt-BR is handled by date-fns/locale/pt-BR
  }
}

/** Default timezone suggestion for a locale */
export function defaultTimezoneForLocale(locale: Locale): string {
  switch (locale) {
    case "es-AR": return "America/Argentina/Buenos_Aires";
    case "en-US": return "America/New_York";
    default: return "America/Sao_Paulo";
  }
}

export const LOCALE_OPTIONS = [
  { value: "pt-BR" as Locale, label: "Português (Brasil)", flag: "🇧🇷" },
  { value: "es-AR" as Locale, label: "Español (Argentina)", flag: "🇦🇷" },
  { value: "en-US" as Locale, label: "English (US)", flag: "🇺🇸" },
];
