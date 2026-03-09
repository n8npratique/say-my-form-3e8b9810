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
          { id: f4, type: "contact_info", label: "Dados de Contato", required: false, contact_fields: ["first_name", "email", "phone"] },
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
          { id: f4, type: "contact_info", label: "Dados de Contato", required: false, contact_fields: ["first_name", "email", "phone"] },
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
        { id: crypto.randomUUID(), type: "contact_info", label: "Informações de Contato", required: true, contact_fields: ["first_name", "last_name", "email", "phone"] },
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
          { id: crypto.randomUUID(), type: "contact_info", label: "Dados de Contato", required: false, contact_fields: ["first_name", "email", "phone"] },
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

  // ── 6. Jump Simples — Triagem Sim/Não ───────────────────────────────────
  {
    id: "jump-simple",
    name: "Triagem Sim/Não (Jump Simples)",
    description: "Exemplo de jump simples: uma pergunta Sim/Não que direciona para caminhos diferentes.",
    icon: "GitBranch",
    category: "Exemplos de Jump",
    themeColors: ["#ECFDF5", "#10B981", "#065F46"],
    buildSchema: (): FormSchema => {
      const welcome = crypto.randomUUID();
      const q1 = crypto.randomUUID();
      const q2_sim = crypto.randomUUID();
      const q3_sim = crypto.randomUUID();
      const q2_nao = crypto.randomUUID();
      const endOk = crypto.randomUUID();
      const endNao = crypto.randomUUID();
      return {
        fields: [
          { id: welcome, type: "welcome_screen", label: "Pesquisa de Interesse", required: false, placeholder: "Responda rapidinho para te direcionarmos!" },
          { id: q1, type: "yes_no", label: "Você tem interesse em nossos serviços?", required: true },
          { id: q2_sim, type: "multiple_choice", label: "Qual serviço te interessa?", required: true, options: ["Consultoria", "Treinamento", "Suporte técnico"] },
          { id: q3_sim, type: "contact_info", label: "Deixe seu contato para retorno", required: true, contact_fields: ["first_name", "email", "phone"] },
          { id: q2_nao, type: "long_text", label: "O que podemos melhorar para te atender?", required: false },
          { id: endOk, type: "end_screen", label: "Obrigado pelo interesse! Entraremos em contato em breve.", required: false },
          { id: endNao, type: "end_screen", label: "Agradecemos seu feedback! Até a próxima.", required: false },
        ],
        logic: [
          {
            field_id: q1,
            rules: [
              { condition: { op: "equals", value: "Sim" }, action: { type: "jump_to", target: q2_sim } },
              { condition: { op: "equals", value: "Não" }, action: { type: "jump_to", target: q2_nao } },
            ],
            default_action: { type: "next" },
          },
          {
            field_id: q3_sim,
            rules: [{ condition: { op: "always" }, action: { type: "jump_to", target: endOk } }],
            default_action: { type: "jump_to", target: endOk },
          },
          {
            field_id: q2_nao,
            rules: [{ condition: { op: "always" }, action: { type: "jump_to", target: endNao } }],
            default_action: { type: "jump_to", target: endNao },
          },
        ],
        theme: getTheme("Floresta"),
      };
    },
  },

  // ── 7. Jump Intermediário — Qualificação de Lead ──────────────────────
  {
    id: "jump-intermediate",
    name: "Qualificação de Lead (Jump Intermediário)",
    description: "Ramificação por setor e porte da empresa com telas finais diferentes.",
    icon: "GitBranch",
    category: "Exemplos de Jump",
    themeColors: ["#EFF6FF", "#3B82F6", "#1E40AF"],
    buildSchema: (): FormSchema => {
      const welcome = crypto.randomUUID();
      const qNome = crypto.randomUUID();
      const qSetor = crypto.randomUUID();
      const qPorteTech = crypto.randomUUID();
      const qPorteSaude = crypto.randomUUID();
      const qPorteOutro = crypto.randomUUID();
      const qOrcamento = crypto.randomUUID();
      const qContato = crypto.randomUUID();
      const endEnterprise = crypto.randomUUID();
      const endPME = crypto.randomUUID();
      return {
        fields: [
          { id: welcome, type: "welcome_screen", label: "Qualificação de Lead", required: false, placeholder: "Nos ajude a entender sua necessidade para oferecer a melhor solução." },
          { id: qNome, type: "short_text", label: "Qual é o nome da sua empresa?", required: true },
          { id: qSetor, type: "dropdown", label: "Qual o setor da sua empresa?", required: true, options: ["Tecnologia", "Saúde", "Educação", "Varejo", "Outro"] },
          { id: qPorteTech, type: "multiple_choice", label: "Quantos funcionários na área de TI?", required: true, options: ["1 a 10", "11 a 50", "51 a 200", "Mais de 200"] },
          { id: qPorteSaude, type: "multiple_choice", label: "Qual o tipo de unidade?", required: true, options: ["Consultório", "Clínica", "Hospital", "Laboratório"] },
          { id: qPorteOutro, type: "multiple_choice", label: "Porte da empresa", required: true, options: ["MEI/Micro", "Pequena", "Média", "Grande"] },
          { id: qOrcamento, type: "dropdown", label: "Faixa de orçamento mensal", required: true, options: ["Até R$ 1.000", "R$ 1.000 a R$ 5.000", "R$ 5.000 a R$ 20.000", "Acima de R$ 20.000"] },
          { id: qContato, type: "contact_info", label: "Dados para contato", required: true, contact_fields: ["first_name", "last_name", "email", "phone"] },
          { id: endEnterprise, type: "end_screen", label: "Perfeito! Nosso time Enterprise entrará em contato em até 24h.", required: false },
          { id: endPME, type: "end_screen", label: "Obrigado! Confira seu email com nossos planos para PME.", required: false },
        ],
        logic: [
          {
            field_id: qSetor,
            rules: [
              { condition: { op: "equals", value: "Tecnologia" }, action: { type: "jump_to", target: qPorteTech } },
              { condition: { op: "equals", value: "Saúde" }, action: { type: "jump_to", target: qPorteSaude } },
            ],
            default_action: { type: "jump_to", target: qPorteOutro },
          },
          {
            field_id: qPorteTech,
            rules: [{ condition: { op: "always" }, action: { type: "jump_to", target: qOrcamento } }],
            default_action: { type: "jump_to", target: qOrcamento },
          },
          {
            field_id: qPorteSaude,
            rules: [{ condition: { op: "always" }, action: { type: "jump_to", target: qOrcamento } }],
            default_action: { type: "jump_to", target: qOrcamento },
          },
          {
            field_id: qPorteOutro,
            rules: [{ condition: { op: "always" }, action: { type: "jump_to", target: qOrcamento } }],
            default_action: { type: "jump_to", target: qOrcamento },
          },
          {
            field_id: qOrcamento,
            rules: [
              { condition: { op: "equals", value: "Acima de R$ 20.000" }, action: { type: "jump_to", target: qContato } },
              { condition: { op: "equals", value: "R$ 5.000 a R$ 20.000" }, action: { type: "jump_to", target: qContato } },
            ],
            default_action: { type: "next" },
          },
          {
            field_id: qContato,
            rules: [],
            default_action: { type: "jump_to", target: endEnterprise },
          },
        ],
        tagging: {
          enabled: true,
          tags: ["tech", "saude", "pme", "enterprise"],
          field_tags: {
            [qSetor]: { "Tecnologia": ["tech"], "Saúde": ["saude"] },
            [qOrcamento]: { "Acima de R$ 20.000": ["enterprise"], "R$ 5.000 a R$ 20.000": ["enterprise"], "R$ 1.000 a R$ 5.000": ["pme"], "Até R$ 1.000": ["pme"] },
          },
        },
        theme: getTheme("Oceano"),
      };
    },
  },

  // ── 8. Jump Complexo — Diagnóstico Completo ────────────────────────────
  {
    id: "jump-complex",
    name: "Diagnóstico Empresarial (Jump Complexo)",
    description: "Formulário com múltiplas ramificações, scoring, tagging e outcomes baseados nas respostas.",
    icon: "GitBranch",
    category: "Exemplos de Jump",
    themeColors: ["#FDF2F8", "#EC4899", "#9D174D"],
    buildSchema: (): FormSchema => {
      const welcome = crypto.randomUUID();
      const qObj = crypto.randomUUID();
      // Caminho Marketing
      const qMktCanal = crypto.randomUUID();
      const qMktBudget = crypto.randomUUID();
      const qMktEquipe = crypto.randomUUID();
      // Caminho Vendas
      const qVendasCRM = crypto.randomUUID();
      const qVendasMeta = crypto.randomUUID();
      const qVendasEquipe = crypto.randomUUID();
      // Caminho Operações
      const qOpsProcess = crypto.randomUUID();
      const qOpsAuto = crypto.randomUUID();
      // Comum
      const qSatisf = crypto.randomUUID();
      const qContato = crypto.randomUUID();
      // End screens
      const endMktAvancado = crypto.randomUUID();
      const endMktIniciante = crypto.randomUUID();
      const endVendasPro = crypto.randomUUID();
      const endVendasBasico = crypto.randomUUID();
      const endOps = crypto.randomUUID();

      return {
        fields: [
          { id: welcome, type: "welcome_screen", label: "Diagnóstico Empresarial", required: false, placeholder: "Descubra como otimizar sua empresa em 2 minutos." },
          { id: qObj, type: "multiple_choice", label: "Qual área da empresa você quer melhorar?", required: true, options: ["Marketing Digital", "Vendas", "Operações e Processos"] },
          // Marketing path
          { id: qMktCanal, type: "checkbox", label: "Quais canais de marketing você usa?", required: true, options: ["Google Ads", "Facebook/Instagram Ads", "SEO", "Email Marketing", "TikTok", "LinkedIn"] },
          { id: qMktBudget, type: "dropdown", label: "Qual o investimento mensal em marketing?", required: true, options: ["Até R$ 2.000", "R$ 2.000 a R$ 10.000", "R$ 10.000 a R$ 50.000", "Acima de R$ 50.000"] },
          { id: qMktEquipe, type: "yes_no", label: "Você tem uma equipe dedicada de marketing?", required: true },
          // Vendas path
          { id: qVendasCRM, type: "yes_no", label: "Sua empresa usa CRM?", required: true },
          { id: qVendasMeta, type: "number", label: "Qual a meta de faturamento mensal? (em R$)", required: true },
          { id: qVendasEquipe, type: "dropdown", label: "Tamanho da equipe de vendas", required: true, options: ["Somente eu", "2 a 5 pessoas", "6 a 20 pessoas", "Mais de 20 pessoas"] },
          // Operações path
          { id: qOpsProcess, type: "multiple_choice", label: "Qual o principal gargalo?", required: true, options: ["Processos manuais", "Falta de integração", "Comunicação interna", "Gestão de estoque"] },
          { id: qOpsAuto, type: "yes_no", label: "Já usa ferramentas de automação?", required: true },
          // Comum
          { id: qSatisf, type: "nps", label: "De 0 a 10, quão satisfeito está com os resultados atuais?", required: true },
          { id: qContato, type: "contact_info", label: "Deixe seu contato para receber o diagnóstico", required: true, contact_fields: ["first_name", "email", "phone"] },
          // End screens
          { id: endMktAvancado, type: "end_screen", label: "Seu marketing está avançado! Vamos escalar juntos. Confira o diagnóstico no seu email.", required: false },
          { id: endMktIniciante, type: "end_screen", label: "Identificamos oportunidades de crescimento no seu marketing. Confira as recomendações no email.", required: false },
          { id: endVendasPro, type: "end_screen", label: "Sua estrutura de vendas é profissional! Vamos otimizar os resultados.", required: false },
          { id: endVendasBasico, type: "end_screen", label: "Há muito potencial para melhorar suas vendas. Veja nossas dicas no email!", required: false },
          { id: endOps, type: "end_screen", label: "Recebemos seu diagnóstico de operações. Confira as recomendações de automação no email.", required: false },
        ],
        logic: [
          // Objetivo -> ramifica para área
          {
            field_id: qObj,
            rules: [
              { condition: { op: "equals", value: "Marketing Digital" }, action: { type: "jump_to", target: qMktCanal } },
              { condition: { op: "equals", value: "Vendas" }, action: { type: "jump_to", target: qVendasCRM } },
              { condition: { op: "equals", value: "Operações e Processos" }, action: { type: "jump_to", target: qOpsProcess } },
            ],
            default_action: { type: "next" },
          },
          // Marketing -> satisfação
          {
            field_id: qMktEquipe,
            rules: [{ condition: { op: "always" }, action: { type: "jump_to", target: qSatisf } }],
            default_action: { type: "jump_to", target: qSatisf },
          },
          // Vendas -> satisfação
          {
            field_id: qVendasEquipe,
            rules: [{ condition: { op: "always" }, action: { type: "jump_to", target: qSatisf } }],
            default_action: { type: "jump_to", target: qSatisf },
          },
          // Operações -> satisfação
          {
            field_id: qOpsAuto,
            rules: [{ condition: { op: "always" }, action: { type: "jump_to", target: qSatisf } }],
            default_action: { type: "jump_to", target: qSatisf },
          },
        ],
        scoring: {
          enabled: true,
          field_scores: {
            [qMktBudget]: { "Até R$ 2.000": 10, "R$ 2.000 a R$ 10.000": 30, "R$ 10.000 a R$ 50.000": 60, "Acima de R$ 50.000": 90 },
            [qMktEquipe]: { "Sim": 50, "Não": 10 },
            [qVendasCRM]: { "Sim": 50, "Não": 10 },
            [qVendasEquipe]: { "Somente eu": 10, "2 a 5 pessoas": 30, "6 a 20 pessoas": 60, "Mais de 20 pessoas": 90 },
            [qSatisf]: { "0": 0, "1": 10, "2": 20, "3": 30, "4": 40, "5": 50, "6": 60, "7": 70, "8": 80, "9": 90, "10": 100 },
          },
          ranges: [
            { min: 0, max: 30, label: "Iniciante" },
            { min: 31, max: 60, label: "Intermediário" },
            { min: 61, max: 100, label: "Avançado" },
          ],
        },
        tagging: {
          enabled: true,
          tags: ["marketing", "vendas", "operacoes", "budget-alto", "sem-crm", "sem-automacao"],
          field_tags: {
            [qObj]: { "Marketing Digital": ["marketing"], "Vendas": ["vendas"], "Operações e Processos": ["operacoes"] },
            [qMktBudget]: { "Acima de R$ 50.000": ["budget-alto"], "R$ 10.000 a R$ 50.000": ["budget-alto"] },
            [qVendasCRM]: { "Não": ["sem-crm"] },
            [qOpsAuto]: { "Não": ["sem-automacao"] },
          },
        },
        outcomes: {
          enabled: true,
          definitions: [
            { id: "mkt-avancado", label: "Marketing Avançado", end_screen_id: endMktAvancado },
            { id: "mkt-iniciante", label: "Marketing Iniciante", end_screen_id: endMktIniciante },
            { id: "vendas-pro", label: "Vendas Profissional", end_screen_id: endVendasPro },
            { id: "vendas-basico", label: "Vendas Básico", end_screen_id: endVendasBasico },
            { id: "ops", label: "Operações", end_screen_id: endOps },
          ],
          field_outcomes: {
            [qObj]: {
              "Marketing Digital": "mkt-avancado",
              "Vendas": "vendas-pro",
              "Operações e Processos": "ops",
            },
            [qMktEquipe]: { "Sim": "mkt-avancado", "Não": "mkt-iniciante" },
            [qVendasCRM]: { "Sim": "vendas-pro", "Não": "vendas-basico" },
          },
        },
        theme: getTheme("Gradiente"),
      };
    },
  },

  // ── 9. Agendamento Inteligente ───────────────────────────────────────────
  {
    id: "scheduling",
    name: "Agendamento Inteligente",
    description: "Aulas experimentais, consultas ou reuniões — o cliente escolhe horários livres do seu Google Calendar.",
    icon: "CalendarClock",
    category: "Serviços",
    themeColors: ["#F0FDF4", "#16A34A", "#166534"],
    buildSchema: (): FormSchema => ({
      fields: [
        { id: crypto.randomUUID(), type: "contact_info", label: "Seus dados", required: true, contact_fields: ["first_name", "last_name", "email", "phone"] },
        { id: crypto.randomUUID(), type: "dropdown", label: "Tipo de aula", required: true, options: ["Musculação", "Funcional", "Pilates", "Yoga", "Spinning"] },
        {
          id: crypto.randomUUID(),
          type: "appointment",
          label: "Escolha o melhor horário",
          required: true,
          appointment_config: {
            google_connection_id: "",
            calendar_id: "primary",
            available_days: [1, 2, 3, 4, 5, 6],
            start_time: "06:00",
            end_time: "21:00",
            slot_duration: 60,
            horizon_days: 14,
            buffer_minutes: 15,
            event_title: "{{form_name}} — {{field:Tipo de aula}}",
            event_description: "Aula experimental agendada pelo TecForms",
            add_respondent: true,
            add_meet: false,
            timezone: "America/Sao_Paulo",
            confirmation_email_enabled: true,
            confirmation_email_subject: "Confirmação de agendamento - {{form_name}}",
            confirmation_email_body: "",
          },
        },
        { id: crypto.randomUUID(), type: "long_text", label: "Observações ou restrições médicas", required: false },
      ],
      theme: getTheme("Floresta"),
    }),
  },
];
