import type { FormSchema } from "@/types/workflow";
import { THEME_PALETTES } from "@/lib/formTheme";

function getTheme(name: string) {
  return THEME_PALETTES.find((p) => p.name === name)?.theme ?? THEME_PALETTES[0].theme;
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  themeColors: string[]; // hex colors for preview dots
  buildSchema: () => FormSchema;
}

export const FORM_TEMPLATES: FormTemplate[] = [
  // ── 1. Pesquisa de Satisfação ──────────────────────────────────────────
  {
    id: "csat",
    name: "Pesquisa de Satisfação",
    description: "Meça o nível de satisfação dos seus clientes com uma pesquisa CSAT.",
    icon: "Star",
    category: "Avaliação",
    themeColors: ["#FFFFFF", "#7C3AED", "#6B7280"],
    buildSchema: (): FormSchema => {
      const f1 = crypto.randomUUID();
      const f2 = crypto.randomUUID();
      const f3 = crypto.randomUUID();
      const f4 = crypto.randomUUID();
      return {
        fields: [
          { id: f1, type: "rating", label: "Como você avalia nosso atendimento?", required: true },
          { id: f2, type: "opinion_scale", label: "Qual a probabilidade de nos recomendar?", required: true, options: ["0","1","2","3","4","5","6","7","8","9","10"] },
          { id: f3, type: "long_text", label: "O que podemos melhorar?", required: false },
          { id: f4, type: "email", label: "Seu e-mail (opcional)", required: false },
        ],
        scoring: {
          enabled: true,
          field_scores: {
            [f1]: { "1": 0, "2": 25, "3": 50, "4": 75, "5": 100 },
            [f2]: { "0": 0, "1": 10, "2": 20, "3": 30, "4": 40, "5": 50, "6": 60, "7": 70, "8": 80, "9": 90, "10": 100 },
          },
          ranges: [
            { min: 0, max: 40, label: "Insatisfeito" },
            { min: 41, max: 70, label: "Neutro" },
            { min: 71, max: 100, label: "Satisfeito" },
          ],
        },
        theme: getTheme("Clássico"),
      };
    },
  },

  // ── 2. NPS ──────────────────────────────────────────────────────────────
  {
    id: "nps",
    name: "NPS — Net Promoter Score",
    description: "Meça a lealdade dos clientes com a pergunta padrão NPS e classifique automaticamente.",
    icon: "ThumbsUp",
    category: "Avaliação",
    themeColors: ["#0F172A", "#0EA5E9", "#94A3B8"],
    buildSchema: (): FormSchema => {
      const f1 = crypto.randomUUID();
      const f2 = crypto.randomUUID();
      const f3 = crypto.randomUUID();
      const f4 = crypto.randomUUID();
      const options = ["Preço", "Qualidade do produto", "Atendimento", "Facilidade de uso", "Outro"];
      return {
        fields: [
          { id: f1, type: "nps", label: "Em uma escala de 0 a 10, qual a probabilidade de recomendar nossa empresa a um amigo?", required: true },
          { id: f2, type: "multiple_choice", label: "Qual o principal motivo da sua nota?", required: false, options },
          { id: f3, type: "long_text", label: "Comentários adicionais", required: false },
          { id: f4, type: "email", label: "Seu e-mail (opcional)", required: false },
        ],
        tagging: {
          enabled: true,
          tags: ["Detrator", "Neutro", "Promotor"],
          field_tags: {
            [f1]: {
              "0": ["Detrator"], "1": ["Detrator"], "2": ["Detrator"],
              "3": ["Detrator"], "4": ["Detrator"], "5": ["Detrator"],
              "6": ["Detrator"],
              "7": ["Neutro"], "8": ["Neutro"],
              "9": ["Promotor"], "10": ["Promotor"],
            },
          },
        },
        theme: getTheme("Oceano"),
      };
    },
  },

  // ── 3. Quiz / Prova ──────────────────────────────────────────────────────
  {
    id: "quiz",
    name: "Quiz / Prova",
    description: "Crie um quiz com pontuação automática e feedback baseado no resultado.",
    icon: "GraduationCap",
    category: "Educação",
    themeColors: ["#7C3AED", "#EC4899", "#FFFFFF"],
    buildSchema: (): FormSchema => {
      const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
      const questions = [
        { label: "Qual é a capital do Brasil?", options: ["São Paulo", "Brasília", "Rio de Janeiro", "Salvador"], correct: "Brasília" },
        { label: "Quanto é 7 × 8?", options: ["54", "56", "48", "64"], correct: "56" },
        { label: "Qual elemento tem símbolo 'O'?", options: ["Ouro", "Osmio", "Oxigênio", "Órbita"], correct: "Oxigênio" },
        { label: "Em que ano o Brasil foi descoberto?", options: ["1498", "1500", "1502", "1510"], correct: "1500" },
        { label: "Qual linguagem é usada para estilizar páginas web?", options: ["Java", "Python", "CSS", "C++"], correct: "CSS" },
      ];
      const field_scores: Record<string, Record<string, number>> = {};
      questions.forEach((q, i) => {
        field_scores[ids[i]] = {};
        q.options.forEach((opt) => {
          field_scores[ids[i]][opt] = opt === q.correct ? 20 : 0;
        });
      });
      return {
        fields: questions.map((q, i) => ({
          id: ids[i], type: "multiple_choice" as const,
          label: q.label, required: true, options: q.options,
        })),
        scoring: {
          enabled: true,
          field_scores,
          ranges: [
            { min: 0, max: 40, label: "Precisa melhorar" },
            { min: 41, max: 70, label: "Bom" },
            { min: 71, max: 100, label: "Excelente" },
          ],
        },
        theme: getTheme("Gradiente"),
      };
    },
  },

  // ── 4. Cadastro / Lead ───────────────────────────────────────────────────
  {
    id: "lead",
    name: "Cadastro / Lead",
    description: "Capture leads qualificados com campos de contato e informações adicionais.",
    icon: "UserPlus",
    category: "Captação",
    themeColors: ["#FAFAFA", "#18181B", "#71717A"],
    buildSchema: (): FormSchema => ({
      fields: [
        { id: crypto.randomUUID(), type: "contact_info", label: "Informações de Contato", required: true, contact_fields: ["first_name", "last_name"] },
        { id: crypto.randomUUID(), type: "email", label: "E-mail", required: true },
        { id: crypto.randomUUID(), type: "phone", label: "Telefone", required: false },
        { id: crypto.randomUUID(), type: "short_text", label: "Empresa", required: false, placeholder: "Nome da sua empresa" },
        { id: crypto.randomUUID(), type: "dropdown", label: "Como nos conheceu?", required: false, options: ["Redes Sociais", "Google", "Indicação de amigo", "Evento", "Outro"] },
        { id: crypto.randomUUID(), type: "legal", label: "Aceito os termos de uso e política de privacidade.", required: true },
      ],
      theme: getTheme("Minimalista"),
    }),
  },

  // ── 5. Formulário de Feedback ────────────────────────────────────────────
  {
    id: "feedback",
    name: "Formulário de Feedback",
    description: "Colete feedback detalhado por área e classifique automaticamente com tags.",
    icon: "MessageSquare",
    category: "Avaliação",
    themeColors: ["#FFF1F2", "#E11D48", "#9F1239"],
    buildSchema: (): FormSchema => {
      const f1 = crypto.randomUUID();
      const areaOptions = ["Produto", "Suporte", "Vendas", "Financeiro"];
      const tagMap: Record<string, string[]> = {
        Produto: ["feedback-produto"],
        Suporte: ["feedback-suporte"],
        Vendas: ["feedback-vendas"],
        Financeiro: ["feedback-financeiro"],
      };
      return {
        fields: [
          { id: f1, type: "multiple_choice", label: "Qual área você quer avaliar?", required: true, options: areaOptions },
          { id: crypto.randomUUID(), type: "rating", label: "Como você avalia essa área?", required: true },
          { id: crypto.randomUUID(), type: "long_text", label: "Descreva sua experiência", required: false },
          { id: crypto.randomUUID(), type: "yes_no", label: "Podemos entrar em contato para saber mais?", required: false },
          { id: crypto.randomUUID(), type: "email", label: "Seu e-mail", required: false },
        ],
        tagging: {
          enabled: true,
          tags: ["feedback-produto", "feedback-suporte", "feedback-vendas", "feedback-financeiro"],
          field_tags: { [f1]: tagMap },
        },
        theme: getTheme("Coral"),
      };
    },
  },

  // ── 6. Agendamento ───────────────────────────────────────────────────────
  {
    id: "scheduling",
    name: "Agendamento",
    description: "Permita que clientes solicitem agendamentos com data, horário e observações.",
    icon: "CalendarDays",
    category: "Serviços",
    themeColors: ["#F0FDF4", "#16A34A", "#166534"],
    buildSchema: (): FormSchema => ({
      fields: [
        { id: crypto.randomUUID(), type: "short_text", label: "Seu nome completo", required: true },
        { id: crypto.randomUUID(), type: "email", label: "E-mail", required: true },
        { id: crypto.randomUUID(), type: "phone", label: "Telefone", required: true },
        { id: crypto.randomUUID(), type: "date", label: "Data preferida", required: true },
        { id: crypto.randomUUID(), type: "dropdown", label: "Horário preferido", required: true, options: ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"] },
        { id: crypto.randomUUID(), type: "long_text", label: "Observações adicionais", required: false },
      ],
      theme: getTheme("Floresta"),
    }),
  },
];
