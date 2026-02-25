import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  Search,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  FileText,
  Palette,
  GitBranch,
  BarChart3,
  Tag,
  Trophy,
  Globe,
  CalendarDays,
  Mail,
  MessageSquare,
  Webhook,
  Settings,
  Shield,
  Users,
  Upload,
  Share2,
  Zap,
  BookOpen,
} from "lucide-react";

interface Section {
  id: string;
  icon: any;
  title: string;
  content: SubSection[];
}

interface SubSection {
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "1. Dashboard e Workspaces",
    content: [
      {
        title: "Acessando o Dashboard",
        body: `Ao fazer login, você é direcionado ao Dashboard principal. Aqui você visualiza todos os seus Workspaces (espaços de trabalho) e suas estatísticas gerais.\n\nCada workspace mostra a quantidade de formulários e respostas recebidas.`,
      },
      {
        title: "Criar um Workspace",
        body: `Clique no botão "+ Novo Workspace" no Dashboard. Digite o nome desejado e confirme. O workspace é seu ambiente de trabalho onde ficam seus formulários e configurações.`,
      },
      {
        title: "Editar e Excluir Workspace",
        body: `Passe o mouse sobre o card do workspace para ver os botões de edição (lápis) e exclusão (lixeira). Ao editar, você pode renomear o workspace. Ao excluir, todos os formulários dentro dele serão removidos permanentemente.`,
      },
      {
        title: "Modo Escuro",
        body: `No canto superior direito do Dashboard, clique no ícone de lua/sol para alternar entre modo claro e escuro. A preferência é salva automaticamente.`,
      },
    ],
  },
  {
    id: "forms",
    icon: FileText,
    title: "2. Criando Formulários",
    content: [
      {
        title: "Criar Formulário em Branco",
        body: `Dentro de um workspace, clique em "+ Novo Formulário" e selecione "Em branco". Um formulário vazio será criado para você personalizar.`,
      },
      {
        title: "Criar a Partir de Template",
        body: `Ao criar novo formulário, você pode escolher entre templates prontos:\n\n• Pesquisa de Satisfação (CSAT)\n• NPS (Net Promoter Score)\n• Quiz/Prova\n• Cadastro/Lead\n• Formulário de Feedback\n• Agendamento Inteligente\n\nCada template já vem pré-configurado com campos, scoring e tagging apropriados.`,
      },
      {
        title: "Criar com IA",
        body: `Descreva o formulário que deseja criar em texto ou por voz. A IA gerará automaticamente a estrutura de campos baseada na sua descrição.\n\nExemplo: "Crie um formulário de cadastro com nome, email, telefone e uma pergunta sobre interesse no produto."`,
      },
      {
        title: "Publicar Formulário",
        body: `Após editar seu formulário, clique em "Publicar" no editor. Isso cria uma versão publicada e gera o link de compartilhamento. Cada publicação cria uma nova versão, mantendo o histórico.`,
      },
      {
        title: "Duplicar e Restaurar",
        body: `No painel de formulários do workspace, use o menu de ações (três pontos) para duplicar ou arquivar um formulário. Formulários arquivados podem ser restaurados.`,
      },
    ],
  },
  {
    id: "editor",
    icon: FileText,
    title: "3. Editor de Formulários",
    content: [
      {
        title: "Tipos de Campos Disponíveis",
        body: `O TecForms oferece 24 tipos de campos organizados em categorias:\n\n**Contato:**\n• Informações de Contato (nome, email, telefone, CPF, CEP, endereço)\n• Site\n\n**Texto:**\n• Texto Curto\n• Texto Longo\n• Declaração (apenas exibição)\n\n**Escolha:**\n• Múltipla Escolha\n• Dropdown\n• Escolha de Imagem\n• Sim/Não\n• Jurídico (aceitar termos)\n• Caixa de Seleção\n\n**Classificação:**\n• NPS\n• Escala de Opinião\n• Avaliação com Estrelas\n• Ranking\n• Matriz\n\n**Outros:**\n• Número\n• Data\n• Envio de Arquivo\n• Tela de Boas-vindas\n• Tela Final\n• Grupo de Perguntas\n• Redirecionamento de URL\n• Agendamento`,
      },
      {
        title: "Configurando um Campo",
        body: `Ao clicar em um campo no editor, o painel lateral mostra suas configurações:\n\n• **Título**: o texto da pergunta\n• **Placeholder**: texto de exemplo\n• **Obrigatório**: se o respondente deve preencher\n• **Mídia**: adicione imagem ou vídeo (YouTube/Vimeo) à pergunta\n• **Opções**: para campos de múltipla escolha, dropdown, etc.`,
      },
      {
        title: "Reorganizando Campos",
        body: `Arraste e solte os campos na lista lateral esquerda para reordená-los. A numeração é atualizada automaticamente.`,
      },
      {
        title: "Tela de Boas-vindas",
        body: `Configure uma tela inicial com título, descrição, botão e imagem/logo. Ative nas configurações de tema do formulário.`,
      },
      {
        title: "Tela Final (End Screen)",
        body: `Personalize a tela que aparece após o envio:\n\n• Título (ex: "Obrigado!")\n• Descrição\n• Imagem (upload ou URL)\n• Botão com link (ex: "Responder novamente")\n\nVocê pode ter múltiplas telas finais condicionais por score ou outcome.`,
      },
      {
        title: "Campo de Agendamento",
        body: `O campo de agendamento permite que o respondente escolha data e horário disponíveis, integrado com Google Calendar. Configure:\n\n• Calendário Google vinculado\n• Dias da semana disponíveis\n• Horário de funcionamento\n• Duração do slot\n• Intervalo entre agendamentos\n• Gerar link Google Meet`,
      },
      {
        title: "Upload de Arquivo",
        body: `Configure quais tipos de arquivo o respondente pode enviar (PDF, imagens, documentos, etc.) e o tamanho máximo permitido (até 50MB).`,
      },
      {
        title: "Redirecionamento de URL",
        body: `O campo "Redirecionar para URL" redireciona automaticamente o respondente para uma URL externa ao chegar neste ponto do formulário.`,
      },
      {
        title: "Desfazer Exclusão",
        body: `Ao excluir um campo por engano, um toast aparece com a opção "Desfazer". Clique para restaurar o campo imediatamente.`,
      },
    ],
  },
  {
    id: "themes",
    icon: Palette,
    title: "4. Temas e Personalização",
    content: [
      {
        title: "Paletas de Cores",
        body: `Escolha entre 6+ paletas pré-definidas:\n\n• Clássico (branco/roxo)\n• Oceano (azul escuro/ciano)\n• Floresta (verde claro)\n• Sunset (laranja/coral)\n• Noturno (escuro/roxo)\n• Coral (rosa/vermelho)\n• Gradiente\n• Minimalista\n\nOu personalize cada cor individualmente.`,
      },
      {
        title: "Personalização de Cores",
        body: `Customize:\n\n• Cor de fundo\n• Cor do texto principal\n• Cor do texto secundário\n• Cor dos botões\n• Cor do texto dos botões`,
      },
      {
        title: "Fontes",
        body: `Escolha entre várias famílias tipográficas (Inter, Space Grotesk, Lora, Poppins, etc.). Ajuste tamanho, peso e estilo da fonte.`,
      },
      {
        title: "Imagem de Fundo",
        body: `Faça upload de uma imagem de fundo para o formulário. Configure o modo de dimensionamento (cover, contain, repeat) e adicione um overlay com opacidade ajustável para garantir legibilidade.`,
      },
    ],
  },
  {
    id: "logic",
    icon: GitBranch,
    title: "5. Lógica Condicional",
    content: [
      {
        title: "Como Funciona",
        body: `A lógica condicional permite criar caminhos diferentes no formulário baseados nas respostas. Acesse pelo menu "Lógica" no editor.\n\nPor exemplo: se o respondente escolher "Sim", pule para a pergunta 5. Se escolher "Não", vá para a pergunta 3.`,
      },
      {
        title: "Operadores Disponíveis",
        body: `• **Igual a**: resposta é exatamente o valor\n• **Diferente de**: resposta não é o valor\n• **Contém**: resposta contém o texto\n• **Maior que**: para números\n• **Menor que**: para números\n• **Está preenchido**: campo foi respondido\n• **Não está preenchido**: campo não foi respondido`,
      },
      {
        title: "Ações",
        body: `Para cada regra, defina a ação:\n\n• **Próximo campo**: segue normalmente\n• **Pular para**: vai direto para um campo específico\n• **Finalizar**: encerra o formulário imediatamente`,
      },
      {
        title: "Ação Padrão",
        body: `Defina o que acontece quando nenhuma regra é atendida (fallback). Pode ser seguir para o próximo campo ou pular para um específico.`,
      },
    ],
  },
  {
    id: "scoring",
    icon: BarChart3,
    title: "6. Pontuação (Scoring)",
    content: [
      {
        title: "Ativando Scoring",
        body: `No editor, acesse a aba "Scoring" para ativar o sistema de pontuação. Atribua pontos a cada opção de resposta nos campos de múltipla escolha, dropdown, rating, NPS, etc.`,
      },
      {
        title: "Faixas de Pontuação",
        body: `Crie faixas com min/max e rótulos:\n\nExemplo:\n• 0-30: "Insatisfeito"\n• 31-70: "Neutro"\n• 71-100: "Satisfeito"\n\nCada faixa pode ter uma tela final diferente.`,
      },
      {
        title: "Exibição do Score",
        body: `O score é calculado automaticamente ao completar o formulário e pode ser exibido na tela final. Também aparece no painel de respostas com gráficos de distribuição.`,
      },
    ],
  },
  {
    id: "tags",
    icon: Tag,
    title: "7. Tags e Classificação",
    content: [
      {
        title: "Sistema de Tags",
        body: `Ative o sistema de tagging no editor para classificar respostas automaticamente. Crie tags e vincule-as a opções de resposta.\n\nExemplo: Se o respondente escolher "Produto A", a tag "interesse-produto-a" é adicionada automaticamente.`,
      },
      {
        title: "Uso de Tags",
        body: `Tags são úteis para:\n\n• Filtrar respostas no painel\n• Disparar automações (ex: Unnichat)\n• Segmentar respondentes\n• Gerar relatórios por categoria`,
      },
    ],
  },
  {
    id: "outcomes",
    icon: Trophy,
    title: "8. Outcomes (Resultados)",
    content: [
      {
        title: "Definindo Outcomes",
        body: `Outcomes são resultados finais baseados nas respostas. Crie outcomes como "Aprovado", "Reprovado", "Perfil A", "Perfil B", etc.\n\nMapeie quais respostas levam a cada outcome.`,
      },
      {
        title: "Telas Finais por Outcome",
        body: `Cada outcome pode ter uma tela final personalizada. Exemplo:\n\n• Outcome "Aprovado" → Tela "Parabéns! Você passou!"\n• Outcome "Reprovado" → Tela "Infelizmente não atingiu a nota mínima."`,
      },
    ],
  },
  {
    id: "translations",
    icon: Globe,
    title: "9. Traduções Multiidioma",
    content: [
      {
        title: "Idiomas Suportados",
        body: `O TecForms suporta 3 idiomas:\n\n• Português (Brasil)\n• Espanhol (Argentina)\n• Inglês (EUA)\n\nA interface do formulário (botões, mensagens) é traduzida automaticamente.`,
      },
      {
        title: "Traduzindo Campos",
        body: `Use a IA para traduzir automaticamente os rótulos, opções e placeholders dos campos para outros idiomas. As traduções ficam armazenadas no schema do formulário.`,
      },
    ],
  },
  {
    id: "appointment",
    icon: CalendarDays,
    title: "10. Agendamento Inteligente",
    content: [
      {
        title: "Configuração",
        body: `O campo de agendamento se integra com Google Calendar para mostrar horários disponíveis em tempo real.\n\nConfigure:\n• Calendário Google a usar\n• Dias da semana disponíveis\n• Horário de funcionamento (ex: 8h às 18h)\n• Duração do slot (30, 45, 60, 90 ou 120 min)\n• Intervalo entre agendamentos\n• Quantos dias à frente mostrar`,
      },
      {
        title: "Google Meet",
        body: `Ative a opção "Gerar link Google Meet" para que cada agendamento crie automaticamente uma sala de reunião virtual.`,
      },
      {
        title: "Email de Confirmação",
        body: `Configure um email automático de confirmação com:\n• Assunto personalizado\n• Corpo com variáveis (data, horário, link do Meet)\n• Envio automático ao agendar`,
      },
      {
        title: "Cancelamento e Remarcação",
        body: `O sistema gera links únicos para cancelamento e remarcação. O respondente pode cancelar ou remarcar diretamente pelo link, sem precisar de login.`,
      },
    ],
  },
  {
    id: "email",
    icon: Mail,
    title: "11. Email Automático",
    content: [
      {
        title: "Configurando Email",
        body: `Nas integrações do formulário, configure templates de email para envio automático ao receber uma resposta.\n\nProvedores suportados:\n• Gmail (via Google OAuth)\n• Resend API`,
      },
      {
        title: "Templates de Email",
        body: `Crie múltiplos templates com:\n\n• Destinatário: respondente ou dono do formulário\n• Assunto personalizado\n• Corpo com variáveis\n• Imagem de header\n• Botão CTA (call-to-action)\n• Footer customizado`,
      },
      {
        title: "Variáveis Disponíveis",
        body: `Use variáveis nos templates:\n\n• {{form_name}} - nome do formulário\n• {{respondent_email}} - email do respondente\n• {{score}} - pontuação\n• {{outcome}} - resultado\n• {{tags}} - tags coletadas\n• {{answers}} - todas as respostas\n• {{field:LABEL}} - resposta de um campo específico\n• {{appointment_datetime}} - data/hora do agendamento\n• {{meet_link}} - link do Google Meet\n• {{calendar_link}} - link do evento`,
      },
    ],
  },
  {
    id: "integrations",
    icon: Zap,
    title: "12. Integrações",
    content: [
      {
        title: "Google Sheets",
        body: `Sincronize respostas automaticamente com uma planilha do Google Sheets.\n\n1. Conecte sua conta Google nas configurações do workspace\n2. Na aba de integrações do formulário, ative Google Sheets\n3. Uma planilha é criada automaticamente\n4. Cada nova resposta adiciona uma linha\n\nOs headers são gerados automaticamente baseados nos campos.`,
      },
      {
        title: "Unnichat (WhatsApp CRM)",
        body: `Integre com o Unnichat para automações de WhatsApp:\n\n1. Configure URL e Token nas settings do workspace\n2. Na integração do formulário, configure:\n   • Criar contato automaticamente\n   • Mapear campos (telefone, nome, email)\n   • Adicionar tags fixas ou condicionais\n   • Preencher campos customizados\n   • Criar deal/oportunidade no CRM\n\nA automação no Unnichat pode ser disparada pela tag adicionada.`,
      },
      {
        title: "WhatsApp (WAHA)",
        body: `Envie mensagens WhatsApp usando WAHA (WhatsApp HTTP API):\n\n1. Configure a URL do servidor WAHA e API key nas settings\n2. Crie templates de mensagem com variáveis\n3. Escolha enviar para o respondente ou para o owner\n4. As mensagens são enviadas automaticamente ao completar o formulário`,
      },
      {
        title: "ChatGuru",
        body: `Integre com ChatGuru para disparar mensagens WhatsApp via dialog:\n\n1. Configure a chave de acesso nas settings\n2. Mapeie os campos de telefone e nome\n3. Selecione o dialog a disparar\n4. A mensagem é enviada automaticamente`,
      },
      {
        title: "Webhooks",
        body: `Envie dados para qualquer sistema externo via webhooks:\n\n1. Crie um webhook com a URL de destino\n2. Escolha o evento: response.started ou response.completed\n3. Opcionalmente, adicione um secret para validação HMAC\n4. Teste o webhook antes de ativar\n\nO payload inclui form_id, response_id, answers, score, tags e metadata.`,
      },
    ],
  },
  {
    id: "responses",
    icon: BarChart3,
    title: "13. Painel de Respostas",
    content: [
      {
        title: "Visualizando Respostas",
        body: `No painel de respostas, veja todas as respostas recebidas em formato de tabela com:\n\n• Data/hora\n• Status (completa/pendente)\n• Score\n• Duração\n• Email do respondente\n• Resumo das respostas`,
      },
      {
        title: "Filtros e Ordenação",
        body: `Filtre respostas por:\n\n• Data (hoje, 7 dias, 30 dias, mês, personalizado)\n• Status (completa, pendente)\n• Range de score\n• Campo específico\n• Tags\n\nOrdene por data, status, score ou duração.`,
      },
      {
        title: "Gráficos e Estatísticas",
        body: `Visualize gráficos automáticos:\n\n• Distribuição de scores (barras)\n• Respostas ao longo do tempo (área)\n• Distribuição de outcomes (pizza)\n• Distribuição de tags (barras)\n• Respostas por campo (barras)`,
      },
      {
        title: "Exportar para CSV",
        body: `Exporte todas as respostas para CSV com seleção de colunas. Inclua ou exclua score, outcome, tags conforme necessário.`,
      },
      {
        title: "Notificações em Tempo Real",
        body: `Receba notificações em tempo real quando novas respostas chegam. O badge no menu mostra o contador de novas respostas.`,
      },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    title: "14. Configurações do Workspace",
    content: [
      {
        title: "Timezone",
        body: `Configure o fuso horário do workspace. Isso afeta os horários exibidos nos agendamentos e timestamps das respostas.\n\nOpções incluem Brasil, Argentina, EUA e Portugal.`,
      },
      {
        title: "Conexões Google",
        body: `Conecte sua conta Google para usar:\n\n• Gmail (envio de emails)\n• Google Calendar (agendamentos)\n• Google Sheets (sincronização de respostas)\n\nVá em Settings > Google e clique em "Conectar conta Google". Você pode conectar múltiplas contas.`,
      },
      {
        title: "Configuração de Email",
        body: `Escolha o provedor de email:\n\n• **Gmail**: use sua conta Google conectada (recomendado)\n• **Resend**: configure API key e email de remetente\n\nTeste o envio nas configurações para verificar se está funcionando.`,
      },
      {
        title: "Configuração Unnichat",
        body: `Configure a integração com Unnichat:\n\n• URL da API do Unnichat\n• Token de acesso (Bearer)\n• Mapeamento de telefones/canais\n\nO token deve ter permissão para criar contatos e adicionar tags.`,
      },
      {
        title: "Configuração WAHA",
        body: `Configure a integração com WAHA:\n\n• URL do servidor WAHA\n• Chave API\n• Sessão padrão\n• Número de telefone padrão`,
      },
    ],
  },
  {
    id: "deadlines",
    icon: Shield,
    title: "15. Prazos e Restrições",
    content: [
      {
        title: "Deadline de Formulário",
        body: `Configure data/hora de abertura e encerramento:\n\n• **Abertura**: o formulário só aceita respostas a partir desta data\n• **Encerramento**: o formulário para de aceitar respostas nesta data\n\nO respondente vê uma mensagem apropriada se tentar acessar fora do prazo.`,
      },
      {
        title: "Deduplicação",
        body: `Evite respostas duplicadas ativando a deduplicação.\n\nConfigure quais campos verificar (email, telefone, nome). Se uma resposta duplicada for detectada, o respondente é bloqueado com uma mensagem de erro.`,
      },
      {
        title: "Modo de Acesso",
        body: `• **Público**: qualquer pessoa com o link pode responder\n• **Email obrigatório**: o respondente deve informar seu email antes de iniciar`,
      },
    ],
  },
  {
    id: "share",
    icon: Share2,
    title: "16. Compartilhamento",
    content: [
      {
        title: "Link Público",
        body: `Cada formulário publicado tem um link único no formato:\n\nhttps://tecforms.tecace.com.br/f/seu-slug\n\nCompartilhe este link por email, WhatsApp, redes sociais ou incorpore em seu site.`,
      },
      {
        title: "Slug Personalizado",
        body: `O slug é gerado automaticamente baseado no nome do formulário, mas pode ser personalizado para URLs mais amigáveis.`,
      },
    ],
  },
  {
    id: "admin",
    icon: Users,
    title: "17. Administração",
    content: [
      {
        title: "Convidar Administradores",
        body: `No painel de Admin > Convites, envie convites para novos administradores do sistema.\n\nCada convite gera um link único com prazo de expiração. O convidado cria sua conta através do link.`,
      },
      {
        title: "Gerenciar Usuários",
        body: `Visualize todos os usuários, seus status, último acesso e permissões. Você pode banir ou remover usuários quando necessário.`,
      },
    ],
  },
];

export default function Training() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSub = (key: string) => {
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSections(new Set(SECTIONS.map((s) => s.id)));
    const allSubs = new Set<string>();
    SECTIONS.forEach((s) => s.content.forEach((_, i) => allSubs.add(`${s.id}-${i}`)));
    setExpandedSubs(allSubs);
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
    setExpandedSubs(new Set());
  };

  const lowerSearch = search.toLowerCase();
  const filtered = search
    ? SECTIONS.map((s) => ({
        ...s,
        content: s.content.filter(
          (sub) =>
            sub.title.toLowerCase().includes(lowerSearch) ||
            sub.body.toLowerCase().includes(lowerSearch)
        ),
      })).filter((s) => s.content.length > 0 || s.title.toLowerCase().includes(lowerSearch))
    : SECTIONS;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-display font-bold">Central de Treinamento</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>
              Expandir tudo
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Recolher tudo
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no treinamento... (ex: agendamento, email, lógica)"
            className="pl-10"
          />
        </div>

        {/* Intro */}
        {!search && (
          <div className="mb-8 p-6 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border">
            <h2 className="text-lg font-semibold mb-2">Bem-vindo ao Treinamento TecForms</h2>
            <p className="text-sm text-muted-foreground">
              Aqui você encontra tudo sobre o sistema: como criar formulários, configurar integrações,
              usar lógica condicional, scoring, tags, agendamentos e muito mais. Use a busca acima ou
              navegue pelas seções abaixo.
            </p>
          </div>
        )}

        {/* Sections */}
        <div className="space-y-3">
          {filtered.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSections.has(section.id);

            return (
              <div key={section.id} className="border rounded-xl overflow-hidden bg-card">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <Icon className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-semibold flex-1">{section.title}</span>
                  <span className="text-xs text-muted-foreground mr-2">
                    {section.content.length} {section.content.length === 1 ? "tópico" : "tópicos"}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t">
                    {section.content.map((sub, i) => {
                      const subKey = `${section.id}-${i}`;
                      const subExpanded = expandedSubs.has(subKey);

                      return (
                        <div key={subKey} className="border-b last:border-b-0">
                          <button
                            onClick={() => toggleSub(subKey)}
                            className="w-full flex items-center gap-3 px-7 py-3 text-left hover:bg-muted/30 transition-colors"
                          >
                            {subExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-sm font-medium">{sub.title}</span>
                          </button>
                          {subExpanded && (
                            <div className="px-12 pb-4 text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                              {sub.body.split("\n").map((line, li) => {
                                if (line.startsWith("**") && line.endsWith("**")) {
                                  return (
                                    <strong key={li} className="text-foreground block mt-2">
                                      {line.replace(/\*\*/g, "")}
                                    </strong>
                                  );
                                }
                                if (line.includes("**")) {
                                  const parts = line.split(/\*\*/g);
                                  return (
                                    <span key={li}>
                                      {parts.map((part, pi) =>
                                        pi % 2 === 1 ? (
                                          <strong key={pi} className="text-foreground">
                                            {part}
                                          </strong>
                                        ) : (
                                          <span key={pi}>{part}</span>
                                        )
                                      )}
                                      {"\n"}
                                    </span>
                                  );
                                }
                                return <span key={li}>{line}{"\n"}</span>;
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>Nenhum resultado encontrado para "{search}"</p>
          </div>
        )}
      </main>
    </div>
  );
}
