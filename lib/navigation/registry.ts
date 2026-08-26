import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { ROLE_RANK, type Role } from "@/lib/auth/types";
import {
  Bell,
  BookOpen,
  Brain,
  Buildings,
  ChartBar,
  ChartLineUp,
  CheckSquare,
  ClipboardText,
  ClockCountdown,
  ClockCounterClockwise,
  FileText,
  Flag,
  FlowArrow,
  Funnel,
  Gauge,
  Inbox,
  Kanban,
  Key,
  Lightbulb,
  ListChecks,
  ListPlus,
  Lock,
  Palette,
  Plugs,
  PlugsConnected,
  PuzzlePiece,
  Receipt,
  Robot,
  ScalesSimple,
  ShieldCheck,
  Signpost,
  Storefront,
  UserCircle,
  Users,
  UploadSimple,
  UsersThree,
  WebhooksLogo,
} from "@/lib/ui/icons";

/**
 * Registro de navegaÃƒÂ§ÃƒÂ£o Ã¢â‚¬â€ a ÃƒÅ¡NICA lista de destinos do app do tenant.
 *
 * Antes disto, trÃƒÂªs listas descreviam o mesmo conjunto e divergiam: `NAV_ITEMS`
 * no Sidebar, `LINKS` no hub de ConfiguraÃƒÂ§ÃƒÂµes e `TABS` na ÃƒÂ¡rea de IA. Sete telas
 * sÃƒÂ³ eram alcanÃƒÂ§ÃƒÂ¡veis por dentro da prÃƒÂ³pria seÃƒÂ§ÃƒÂ£o e uma nÃƒÂ£o tinha link nenhum.
 *
 * Sidebar, hubs e a paleta Ã¢Å’ËœK sÃƒÂ£o PROJEÃƒâ€¡Ãƒâ€¢ES puras deste array Ã¢â‚¬â€ nenhum deles
 * decide o que existe, sÃƒÂ³ desenha o que sai daqui. Tela nova aparece nos trÃƒÂªs
 * sem editar trÃƒÂªs arquivos, e `tests/unit/navegacao-completude.test.ts` reprova
 * o CI se uma rota nascer fora daqui.
 *
 * Doutrina: docs/doctrine/sistema-vivo.md Ã¢â‚¬â€ "por qual porta se chega atÃƒÂ© mim?"
 */

export type NavGroupId = "atendimento" | "crm" | "ia" | "canais" | "analise" | "organizacao";

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /**
   * Hub do grupo, quando ele tem telas demais para caber no sidebar.
   * O rÃƒÂ³tulo ÃƒÂ© declarado junto do href porque nÃƒÂ£o ÃƒÂ© derivÃƒÂ¡vel: "Ver tudo em IA"
   * ÃƒÂ© ÃƒÂºtil, "Ver tudo em OrganizaÃƒÂ§ÃƒÂ£o" seria gratuito quando a tela jÃƒÂ¡ se chama
   * ConfiguraÃƒÂ§ÃƒÂµes e o usuÃƒÂ¡rio a conhece por esse nome.
   */
  hub?: { href: string; label: string };
}

export interface NavDestination {
  href: string;
  label: string;
  /** Aparece no card do hub e ÃƒÂ© texto buscÃƒÂ¡vel no Ã¢Å’ËœK. Nunca vazio. */
  description: string;
  icon: PhosphorIcon;
  group: NavGroupId;
  /** ObrigatÃƒÂ³ria em grupo com hub Ã¢â‚¬â€ ÃƒÂ© o agrupamento por jornada dentro dele. */
  section?: string;
  /** Ausente = viewer. Ver a regra de escolha abaixo. */
  minRole?: Role;
  /** Ausente = sÃƒÂ³ no hub. `true` = uso diÃƒÂ¡rio, sobe para o sidebar. */
  sidebar?: boolean;
  healthDot?: boolean;
}

/**
 * Grupos por OBJETIVO, na ordem de uso: o que se abre toda hora primeiro, o que
 * se ajusta uma vez por mÃƒÂªs por ÃƒÂºltimo.
 *
 * "AnÃƒÂ¡lise" e nÃƒÂ£o "Observabilidade": quem instala isto numa VPS ÃƒÂ© dono de PME,
 * nÃƒÂ£o engenheiro. E configurar o sistema (grupo IA) ÃƒÂ© atividade diferente de
 * observar o sistema funcionando (grupo AnÃƒÂ¡lise) Ã¢â‚¬â€ por isso EvoluÃƒÂ§ÃƒÂ£o da IA mora
 * aqui, e nÃƒÂ£o junto dos agentes.
 *
 * Hub sÃƒÂ³ onde o grupo passa de 4 telas. Abaixo disso ele cabe inteiro no
 * sidebar, e um hub de 3 itens seria sÃƒÂ³ um clique a mais para chegar onde jÃƒÂ¡
 * dava para chegar.
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: "atendimento", label: "Atendimento" },
  { id: "crm", label: "CRM" },
  { id: "ia", label: "Agente de IA", hub: { href: "/app/ai", label: "Ver tudo em IA" } },
  { id: "canais", label: "Canais" },
  { id: "analise", label: "AnÃƒÂ¡lise" },
  {
    id: "organizacao",
    label: "OrganizaÃƒÂ§ÃƒÂ£o",
    hub: { href: "/app/settings", label: "ConfiguraÃƒÂ§ÃƒÂµes" },
  },
];

/**
 * Grupo cujo hub vive no RODAPÃƒâ€° fixo do sidebar, fora da ÃƒÂ¡rea que rola.
 *
 * Medido em tela (1280Ãƒâ€”768, o notebook comum): com todos os grupos na ÃƒÂ¡rea
 * rolÃƒÂ¡vel, o conteÃƒÂºdo dava 1019px contra 663px visÃƒÂ­veis Ã¢â‚¬â€ ConfiguraÃƒÂ§ÃƒÂµes ficava
 * fora da dobra em TODAS as alturas testadas, inclusive 1080px. Ãƒâ€° o item que
 * mais se procura quando nÃƒÂ£o se acha algo; deixÃƒÂ¡-lo dependendo de scroll
 * recriaria, em outra forma, o problema que esta reorganizaÃƒÂ§ÃƒÂ£o veio resolver.
 */
export const GRUPO_NO_RODAPE: NavGroupId = "organizacao";

/**
 * Como `minRole` foi escolhido Ã¢â‚¬â€ medido tela a tela, nÃƒÂ£o estimado:
 *
 *   1. A pÃƒÂ¡gina redireciona por papel?  Ã¢â€ â€™ usa esse papel. Assim a navegaÃƒÂ§ÃƒÂ£o
 *      nunca mostra um link que morre em /403.
 *   2. NÃƒÂ£o redireciona, mas a navegaÃƒÂ§ÃƒÂ£o antiga jÃƒÂ¡ filtrava? Ã¢â€ â€™ mantÃƒÂ©m o filtro
 *      antigo, para esta mudanÃƒÂ§a reorganizar sem alterar quem vÃƒÂª o quÃƒÂª.
 *   3. Nenhum dos dois Ã¢â€ â€™ viewer.
 *
 * `ROLE_RANK` sÃƒÂ³ distingue papel dentro do tenant; capacidade interna da tela
 * (`canShare` em Respostas rÃƒÂ¡pidas, `canCompare` em Desempenho) NÃƒÆ’O ÃƒÂ© porta
 * fechada e por isso nÃƒÂ£o vira `minRole`.
 */
export const NAV_DESTINATIONS: NavDestination[] = [
  // ---- Atendimento Ã¢â‚¬â€ onde o operador passa o dia ----
  {
    href: "/app/dashboard",
    label: "Dashboard",
    description: "VisÃƒÂ£o geral da operaÃƒÂ§ÃƒÂ£o: conversas ativas, contatos, volume de negÃƒÂ³cios e tempo de resposta.",
    icon: Gauge,
    group: "atendimento",
    sidebar: true,
  },
  {
    href: "/app/inbox",
    label: "Inbox",
    description: "As conversas de WhatsApp, com vocÃƒÂª e a IA atendendo lado a lado.",
    icon: Inbox,
    group: "atendimento",
    sidebar: true,
  },
  {
    href: "/app/radar",
    label: "Radar",
    description: "Quem esfriou e ainda estÃƒÂ¡ aberto Ã¢â‚¬â€ o que corre risco de morrer sem resposta.",
    icon: ClockCountdown,
    group: "atendimento",
    sidebar: true,
  },
  {
    // Renomeado de "Templates": estes sÃƒÂ£o scripts do atendente, consumidos pelo
    // Composer do inbox. O nome "Templates" fica livre para os da Meta (HSM),
    // onde ÃƒÂ© o termo tÃƒÂ©cnico correto.
    href: "/app/templates",
    label: "Respostas rÃƒÂ¡pidas",
    description: "Scripts salvos para responder mais rÃƒÂ¡pido, seus ou da equipe.",
    icon: FileText,
    group: "atendimento",
    sidebar: true,
  },

  // ---- CRM Ã¢â‚¬â€ o funil ----
  {
    // Ã¢Å¡Â Ã¯Â¸Â ERA "Kanban", e a URL continua sendo. O nome saiu da interface porque o
    // produto tinha CINCO vocabulÃƒÂ¡rios para a mesma coisa Ã¢â‚¬â€ "Kanban" no menu,
    // "Pipelines" no tÃƒÂ­tulo desta tela, "Funis" no menu ao lado, "funil" em todo
    // o corpo dela e "quadro" no onboarding inteiro. TrÃƒÂªs deles no mesmo
    // viewport: o <h1> dizia "Pipelines", o estado vazio dizia "Sem pipelines
    // configurados" e o botÃƒÂ£o embaixo dizia "Criar meu primeiro funil".
    //
    // Ficou "Funis" porque ÃƒÂ© o que esta tela Ãƒâ€°: a lista dos funis, de onde se
    // abre o quadro de cada um. "Pipeline" ÃƒÂ© palavra de quem construiu o
    // sistema; "funil de vendas" ÃƒÂ© palavra de quem vende.
    href: "/app/kanban",
    label: "Funis",
    description: "Seus funis de venda Ã¢â‚¬â€ clique em um para abrir o quadro de clientes.",
    icon: Kanban,
    group: "crm",
    sidebar: true,
  },
  {
    href: "/app/contacts",
    label: "Contatos",
    description: "As pessoas do outro lado da conversa e seu histÃƒÂ³rico.",
    icon: Users,
    group: "crm",
    sidebar: true,
  },
  {
  {
    href: "/app/leads/importar",
    label: "Importar leads",
    description: "Importe leads do Kommo e escolha o funil e a etapa de destino.",
    icon: UploadSimple,
    group: "crm",
    sidebar: true,
  },
    href: "/app/tasks",
    label: "Tarefas & Agendamentos",
    description: "Lista e calendÃƒÂ¡rio unificado de tarefas internas e agendamentos de consultas com data e horÃƒÂ¡rio.",
    icon: CheckSquare,
    group: "crm",
    sidebar: true,
  },
  {
    // Estava enterrado em ConfiguraÃƒÂ§ÃƒÂµes e ninguÃƒÂ©m sabia que existia Ã¢â‚¬â€ o achado
    // que originou esta reorganizaÃƒÂ§ÃƒÂ£o. A URL nÃƒÂ£o muda; sÃƒÂ³ o lugar na navegaÃƒÂ§ÃƒÂ£o.
    //
    // Ã¢Å¡Â Ã¯Â¸Â ERA "Funis", nome que ele DISPUTAVA com o destino acima: os dois
    // listavam as mesmas linhas de `crm_pipelines`, lado a lado no mesmo grupo,
    // com nomes que nÃƒÂ£o diziam qual servia para quÃƒÂª. A diferenÃƒÂ§a real ÃƒÂ© o VERBO,
    // e ÃƒÂ© ela que o nome carrega agora: lÃƒÂ¡ se ABRE o funil, aqui se CONFIGURA o
    // que ele significa.
    href: "/app/settings/tenant/pipelines",
    label: "Etapas do funil",
    description: "As colunas de cada funil, o vocabulÃƒÂ¡rio do negÃƒÂ³cio e os motivos de perda.",
    icon: Funnel,
    group: "crm",
    minRole: "manager",
    sidebar: true,
  },

  // ---- Agente de IA Ã¢â‚¬â€ montar, ensinar, acompanhar ----
  {
    href: "/app/ai/agents",
    label: "Agentes",
    description: "Quem atende por vocÃƒÂª: instruÃƒÂ§ÃƒÂµes, modelo, ferramentas e publicaÃƒÂ§ÃƒÂ£o.",
    icon: Robot,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/followups",
    label: "Follow-ups",
    description: "Como o agente retoma uma conversa que esfriou, para nenhuma morrer no silÃƒÂªncio.",
    icon: FlowArrow,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/routers",
    label: "Roteadores",
    description: "Qual agente pega qual conversa, e quando o humano assume.",
    icon: Signpost,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/credentials",
    label: "Credenciais",
    description: "A chave do provedor de IA que os agentes usam para pensar.",
    icon: Key,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
  },
  {
    // O sistema chama modelo em 23 lugares e, atÃƒÂ© esta tela, a escolha vivia
    // espalhada por trÃƒÂªs pilhas de cÃƒÂ³digo e sete variÃƒÂ¡veis de ambiente Ã¢â‚¬â€ nÃƒÂ£o
    // havia onde responder "quem usa IA aqui, e com qual chave?".
    href: "/app/ai/providers",
    label: "Provedores",
    description: "Qual inteligÃƒÂªncia atende cada parte do sistema Ã¢â‚¬â€ e o que acontece se ela falhar.",
    icon: Plugs,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    // SEM `sidebar: true`, como as outras nove telas deste grupo. Adicionar as
    // duas telas novas ÃƒÂ  sidebar estourou a dobra em 900px Ã¢â‚¬â€ medido pelo e2e
    // `navegacao.spec.ts`, que existe justamente porque agrupar o menu o faz
    // crescer. Configurar provedor ÃƒÂ© tarefa de poucas vezes; o caminho ÃƒÂ© o hub
    // "Ver tudo em IA", igual a Credenciais, Conhecimento, MemÃƒÂ³ria e Skills.
  },
  {
    href: "/app/ai/knowledge/sources",
    label: "Conhecimento",
    description: "Os materiais que o agente consulta antes de responder sobre o seu negÃƒÂ³cio.",
    icon: BookOpen,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/memory",
    label: "MemÃƒÂ³ria",
    description: "O que o agente jÃƒÂ¡ aprendeu sobre a sua operaÃƒÂ§ÃƒÂ£o e reaproveita.",
    icon: Brain,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/skills",
    label: "Skills",
    description: "As aÃƒÂ§ÃƒÂµes que o agente pode executar sozinho durante o atendimento.",
    icon: PuzzlePiece,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/cases",
    label: "Casos",
    description: "Os atendimentos que o agente conduziu, do inÃƒÂ­cio ao desfecho.",
    icon: ClipboardText,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "agent",
  },
  {
    href: "/app/ai/inbox",
    label: "Alertas",
    description: "O que a IA encontrou e precisa de uma decisÃƒÂ£o sua.",
    icon: Flag,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    // Ãƒâ€œrfÃƒÂ£: nenhum lugar do app linkava para cÃƒÂ¡. O flywheel gerava propostas de
    // melhoria do agente e a fila sÃƒÂ³ era vista por quem soubesse a URL.
    href: "/app/ai/proposals",
    label: "Propostas",
    description: "Melhorias que a IA sugere para si mesma, esperando sua decisÃƒÂ£o.",
    icon: Lightbulb,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    // A tela de Uso responde "quanto gastei". Esta responde a pergunta que nÃƒÂ£o
    // tinha lugar nenhum: "o agente parou de responder, o que aconteceu?".
    // Antes da migration 0128 ela seria impossÃƒÂ­vel de construir com honestidade
    // Ã¢â‚¬â€ llm_calls sÃƒÂ³ registrava sucesso.
    href: "/app/ai/runs",
    label: "ExecuÃƒÂ§ÃƒÂµes",
    description: "O que a IA fez Ã¢â‚¬â€ e, quando falhou, o que aconteceu e o que fazer.",
    icon: ListChecks,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
    // Idem: fora da sidebar para o menu nÃƒÂ£o passar da dobra. Quem vem para cÃƒÂ¡
    // estÃƒÂ¡ diagnosticando, e chega pelo hub ou pelo link do aviso na Central.
  },
  {
    href: "/app/ai/usage",
    label: "Uso e orÃƒÂ§amento",
    description: "Quanto a IA consumiu e qual ÃƒÂ© o teto de gasto do mÃƒÂªs.",
    icon: Gauge,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
  },

  // ---- Canais Ã¢â‚¬â€ por onde as mensagens entram e saem ----
  {
    href: "/app/connections",
    label: "ConexÃƒÂµes",
    // Cobre os DOIS caminhos desde o PR #105: nÃƒÂºmero por QR e canal oficial da
    // Meta (com os templates dele), cada um numa aba. A descriÃƒÂ§ÃƒÂ£o cita "oficial"
    // e "Meta" de propÃƒÂ³sito Ã¢â‚¬â€ ÃƒÂ© por esses nomes que se procura no Ã¢Å’ËœK, e a busca
    // varre a descriÃƒÂ§ÃƒÂ£o alÃƒÂ©m do rÃƒÂ³tulo.
    description:
      "Seus nÃƒÂºmeros de WhatsApp: por QR ou canal oficial da Meta, com saÃƒÂºde, reconexÃƒÂ£o e templates.",
    icon: PlugsConnected,
    group: "canais",
    minRole: "admin",
    sidebar: true,
    healthDot: true,
  },

  {
    href: "/app/webhooks",
    label: "Webhooks",
    description: "Avise outros sistemas quando algo acontecer aqui dentro.",
    icon: WebhooksLogo,
    group: "canais",
    minRole: "manager",
    sidebar: true,
  },

  // ---- AnÃƒÂ¡lise Ã¢â‚¬â€ olhar o sistema funcionando ----
  {
    href: "/app/activities",
    label: "RelatÃƒÂ³rio de Atividades",
    description: "Linha do tempo e mÃƒÂ©tricas de tarefas concluÃƒÂ­das, atendimentos e aÃƒÂ§ÃƒÂµes realizadas.",
    icon: ListChecks,
    group: "analise",
    sidebar: true,
  },
  {
    href: "/app/metrics",
    label: "Desempenho",
    description: "Funil e performance por atendente nos ÃƒÂºltimos 30 dias.",
    icon: ChartBar,
    group: "analise",
    sidebar: true,
  },
  {
    // Observabilidade, nÃƒÂ£o configuraÃƒÂ§ÃƒÂ£o: por isso nÃƒÂ£o fica junto dos agentes.
    href: "/app/ai/evolution",
    label: "EvoluÃƒÂ§ÃƒÂ£o da IA",
    description: "Se o agente estÃƒÂ¡ melhorando, onde ele erra e o que falta ensinar.",
    icon: ChartLineUp,
    group: "analise",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/audit",
    label: "Audit Log",
    description: "Quem fez o quÃƒÂª, quando Ã¢â‚¬â€ o histÃƒÂ³rico que nÃƒÂ£o se apaga.",
    icon: ClockCounterClockwise,
    group: "analise",
    minRole: "manager",
    sidebar: true,
  },

  // ---- OrganizaÃƒÂ§ÃƒÂ£o Ã¢â‚¬â€ conta, empresa, acesso ----
  {
    href: "/app/settings/profile",
    label: "Perfil",
    description: "Seu nome, idioma, fuso horÃƒÂ¡rio e avatar.",
    icon: UserCircle,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/security",
    label: "SeguranÃƒÂ§a",
    description: "VerificaÃƒÂ§ÃƒÂ£o em duas etapas, cÃƒÂ³digos de recuperaÃƒÂ§ÃƒÂ£o e sessÃƒÂµes.",
    icon: ShieldCheck,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/notifications",
    label: "NotificaÃƒÂ§ÃƒÂµes",
    description: "Por onde e sobre o quÃƒÂª vocÃƒÂª quer ser avisado.",
    icon: Bell,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/team",
    label: "Equipe",
    description: "Quem trabalha aqui, com qual papel e quanta conversa cada um aguenta.",
    icon: UsersThree,
    group: "organizacao",
    section: "Sua empresa",
  },
  {
    // A porta que faltava (issue #144): rodÃƒÂ­zio de atendimento e restriÃƒÂ§ÃƒÂ£o de
    // visibilidade existiam inteiros no backend e nÃƒÂ£o tinham NENHUMA tela Ã¢â‚¬â€ sÃƒÂ³
    // dava para ligar com UPDATE ÃƒÂ  mÃƒÂ£o no banco.
    href: "/app/settings/atendimento",
    label: "DistribuiÃƒÂ§ÃƒÂ£o de atendimento",
    description: "Quem recebe cada cliente novo, e o que cada atendente enxerga.",
    icon: UsersThree,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "manager",
  },
  {
    href: "/app/settings/tenant",
    label: "OrganizaÃƒÂ§ÃƒÂ£o",
    description: "Dados da empresa, retenÃƒÂ§ÃƒÂ£o de dados e encarregado de LGPD.",
    icon: Buildings,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/settings/cadastros",
    label: "Procedimentos, Tags & Fontes",
    description: "CatÃƒÂ¡logo de procedimentos da clÃƒÂ­nica, tags dos cards e fontes de captaÃƒÂ§ÃƒÂ£o de pacientes.",
    icon: ListPlus,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "agent",
  },
  {
    href: "/app/settings/marca",
    label: "Marca",
    description: "O nome e a cor que sua empresa mostra dentro do sistema.",
    icon: Palette,
    group: "organizacao",
    section: "Sua empresa",
    // `admin` pelo mesmo motivo da linha de cima: o que se edita ali ÃƒÂ©
    // identidade da empresa, e dÃƒÂ¡-lo a `manager` o colocaria abaixo de billing e
    // de API tokens na mesma prancheta.
    minRole: "admin",
    // SEM `sidebar`: fica sÃƒÂ³ no hub. Trocar a marca ÃƒÂ© tarefa de uma vez, e
    // agrupar o menu jÃƒÂ¡ o fez crescer Ã¢â‚¬â€ duas telas a mais estouraram a dobra em
    // 900px, medido pelo e2e `navegacao.spec.ts`.
  },
  {
    href: "/app/settings/billing",
    label: "Billing",
    description: "Plano e cobranÃƒÂ§a.",
    icon: Receipt,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/lgpd/requests",
    label: "LGPD",
    description: "Pedidos de exportaÃƒÂ§ÃƒÂ£o e exclusÃƒÂ£o de dados feitos por clientes.",
    icon: ScalesSimple,
    group: "organizacao",
    section: "Dados e acesso",
    minRole: "admin",
  },
  {
    href: "/app/settings/api-tokens",
    label: "API Tokens",
    description: "Chaves para outro sistema conversar com o seu CRM.",
    icon: Lock,
    group: "organizacao",
    section: "Dados e acesso",
    minRole: "admin",
  },
];

/**
 * ÃƒÅ¡nico ponto de decisÃƒÂ£o de permissÃƒÂ£o da navegaÃƒÂ§ÃƒÂ£o.
 *
 * Ãƒâ€° o que dispensa os sete `usePermission()` que o Sidebar chamava em sequÃƒÂªncia
 * Ã¢â‚¬â€ hooks nÃƒÂ£o rodam em laÃƒÂ§o condicional, entÃƒÂ£o cada permissÃƒÂ£o exigia sua linha.
 * Como funÃƒÂ§ÃƒÂ£o pura, um `.filter()` resolve todas.
 */
export function canSee(d: NavDestination, isPlatformAdmin: boolean, role: Role | null): boolean {
  if (isPlatformAdmin) return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[d.minRole ?? "viewer"];
}

/** ProjeÃƒÂ§ÃƒÂ£o do sidebar: sÃƒÂ³ o uso diÃƒÂ¡rio, agrupado, sem grupo vazio. */
export function sidebarGroups(
  isPlatformAdmin: boolean,
  role: Role | null,
): Array<{ group: NavGroup; items: NavDestination[] }> {
  return NAV_GROUPS.map((group) => ({
    group,
    items: NAV_DESTINATIONS.filter(
      (d) => d.group === group.id && d.sidebar && canSee(d, isPlatformAdmin, role),
    ),
  })).filter((g) => g.items.length > 0);
}

/**
 * ProjeÃƒÂ§ÃƒÂ£o do hub: TODAS as telas do grupo Ã¢â‚¬â€ inclusive as que jÃƒÂ¡ estÃƒÂ£o no
 * sidebar. O hub ÃƒÂ© inventÃƒÂ¡rio, nÃƒÂ£o sobra; ÃƒÂ© onde se descobre o que existe.
 *
 * A ordem das seÃƒÂ§ÃƒÂµes ÃƒÂ© a de primeira apariÃƒÂ§ÃƒÂ£o no registro, entÃƒÂ£o reordenar a
 * jornada ÃƒÂ© reordenar o array Ã¢â‚¬â€ nÃƒÂ£o hÃƒÂ¡ uma segunda lista para manter em sincronia.
 */
export function hubSections(
  group: NavGroupId,
  isPlatformAdmin: boolean,
  role: Role | null,
): Array<{ section: string; items: NavDestination[] }> {
  const porSecao = new Map<string, NavDestination[]>();
  for (const d of NAV_DESTINATIONS) {
    if (d.group !== group || !canSee(d, isPlatformAdmin, role)) continue;
    const secao = d.section ?? "";
    const atual = porSecao.get(secao);
    if (atual) atual.push(d);
    else porSecao.set(secao, [d]);
  }
  return [...porSecao.entries()].map(([section, items]) => ({ section, items }));
}

/** ProjeÃƒÂ§ÃƒÂ£o do Ã¢Å’ËœK: todo destino visÃƒÂ­vel, do sidebar ou nÃƒÂ£o. */
export function searchable(isPlatformAdmin: boolean, role: Role | null): NavDestination[] {
  return NAV_DESTINATIONS.filter((d) => canSee(d, isPlatformAdmin, role));
}
