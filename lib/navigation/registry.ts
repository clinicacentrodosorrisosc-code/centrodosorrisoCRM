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
  UsersThree,
  WebhooksLogo,
} from "@/lib/ui/icons";

/**
 * Registro de navegaÃ§Ã£o â€” a ÃšNICA lista de destinos do app do tenant.
 *
 * Antes disto, trÃªs listas descreviam o mesmo conjunto e divergiam: `NAV_ITEMS`
 * no Sidebar, `LINKS` no hub de ConfiguraÃ§Ãµes e `TABS` na Ã¡rea de IA. Sete telas
 * sÃ³ eram alcanÃ§Ã¡veis por dentro da prÃ³pria seÃ§Ã£o e uma nÃ£o tinha link nenhum.
 *
 * Sidebar, hubs e a paleta âŒ˜K sÃ£o PROJEÃ‡Ã•ES puras deste array â€” nenhum deles
 * decide o que existe, sÃ³ desenha o que sai daqui. Tela nova aparece nos trÃªs
 * sem editar trÃªs arquivos, e `tests/unit/navegacao-completude.test.ts` reprova
 * o CI se uma rota nascer fora daqui.
 *
 * Doutrina: docs/doctrine/sistema-vivo.md â€” "por qual porta se chega atÃ© mim?"
 */

export type NavGroupId = "atendimento" | "crm" | "ia" | "canais" | "analise" | "organizacao";

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /**
   * Hub do grupo, quando ele tem telas demais para caber no sidebar.
   * O rÃ³tulo Ã© declarado junto do href porque nÃ£o Ã© derivÃ¡vel: "Ver tudo em IA"
   * Ã© Ãºtil, "Ver tudo em OrganizaÃ§Ã£o" seria gratuito quando a tela jÃ¡ se chama
   * ConfiguraÃ§Ãµes e o usuÃ¡rio a conhece por esse nome.
   */
  hub?: { href: string; label: string };
}

export interface NavDestination {
  href: string;
  label: string;
  /** Aparece no card do hub e Ã© texto buscÃ¡vel no âŒ˜K. Nunca vazio. */
  description: string;
  icon: PhosphorIcon;
  group: NavGroupId;
  /** ObrigatÃ³ria em grupo com hub â€” Ã© o agrupamento por jornada dentro dele. */
  section?: string;
  /** Ausente = viewer. Ver a regra de escolha abaixo. */
  minRole?: Role;
  /** Ausente = sÃ³ no hub. `true` = uso diÃ¡rio, sobe para o sidebar. */
  sidebar?: boolean;
  healthDot?: boolean;
}

/**
 * Grupos por OBJETIVO, na ordem de uso: o que se abre toda hora primeiro, o que
 * se ajusta uma vez por mÃªs por Ãºltimo.
 *
 * "AnÃ¡lise" e nÃ£o "Observabilidade": quem instala isto numa VPS Ã© dono de PME,
 * nÃ£o engenheiro. E configurar o sistema (grupo IA) Ã© atividade diferente de
 * observar o sistema funcionando (grupo AnÃ¡lise) â€” por isso EvoluÃ§Ã£o da IA mora
 * aqui, e nÃ£o junto dos agentes.
 *
 * Hub sÃ³ onde o grupo passa de 4 telas. Abaixo disso ele cabe inteiro no
 * sidebar, e um hub de 3 itens seria sÃ³ um clique a mais para chegar onde jÃ¡
 * dava para chegar.
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: "atendimento", label: "Atendimento" },
  { id: "crm", label: "CRM" },
  { id: "ia", label: "Agente de IA", hub: { href: "/app/ai", label: "Ver tudo em IA" } },
  { id: "canais", label: "Canais" },
  { id: "analise", label: "AnÃ¡lise" },
  {
    id: "organizacao",
    label: "OrganizaÃ§Ã£o",
    hub: { href: "/app/settings", label: "ConfiguraÃ§Ãµes" },
  },
];

/**
 * Grupo cujo hub vive no RODAPÃ‰ fixo do sidebar, fora da Ã¡rea que rola.
 *
 * Medido em tela (1280Ã—768, o notebook comum): com todos os grupos na Ã¡rea
 * rolÃ¡vel, o conteÃºdo dava 1019px contra 663px visÃ­veis â€” ConfiguraÃ§Ãµes ficava
 * fora da dobra em TODAS as alturas testadas, inclusive 1080px. Ã‰ o item que
 * mais se procura quando nÃ£o se acha algo; deixÃ¡-lo dependendo de scroll
 * recriaria, em outra forma, o problema que esta reorganizaÃ§Ã£o veio resolver.
 */
export const GRUPO_NO_RODAPE: NavGroupId = "organizacao";

/**
 * Como `minRole` foi escolhido â€” medido tela a tela, nÃ£o estimado:
 *
 *   1. A pÃ¡gina redireciona por papel?  â†’ usa esse papel. Assim a navegaÃ§Ã£o
 *      nunca mostra um link que morre em /403.
 *   2. NÃ£o redireciona, mas a navegaÃ§Ã£o antiga jÃ¡ filtrava? â†’ mantÃ©m o filtro
 *      antigo, para esta mudanÃ§a reorganizar sem alterar quem vÃª o quÃª.
 *   3. Nenhum dos dois â†’ viewer.
 *
 * `ROLE_RANK` sÃ³ distingue papel dentro do tenant; capacidade interna da tela
 * (`canShare` em Respostas rÃ¡pidas, `canCompare` em Desempenho) NÃƒO Ã© porta
 * fechada e por isso nÃ£o vira `minRole`.
 */
export const NAV_DESTINATIONS: NavDestination[] = [
  // ---- Atendimento â€” onde o operador passa o dia ----
  {
    href: "/app/dashboard",
    label: "Dashboard",
    description: "VisÃ£o geral da operaÃ§Ã£o: conversas ativas, contatos, volume de negÃ³cios e tempo de resposta.",
    icon: Gauge,
    group: "atendimento",
    sidebar: true,
  },
  {
    href: "/app/inbox",
    label: "Inbox",
    description: "As conversas de WhatsApp, com vocÃª e a IA atendendo lado a lado.",
    icon: Inbox,
    group: "atendimento",
    sidebar: true,
  },
  {
    href: "/app/radar",
    label: "Radar",
    description: "Quem esfriou e ainda estÃ¡ aberto â€” o que corre risco de morrer sem resposta.",
    icon: ClockCountdown,
    group: "atendimento",
    sidebar: true,
  },
  {
    // Renomeado de "Templates": estes sÃ£o scripts do atendente, consumidos pelo
    // Composer do inbox. O nome "Templates" fica livre para os da Meta (HSM),
    // onde Ã© o termo tÃ©cnico correto.
    href: "/app/templates",
    label: "Respostas rÃ¡pidas",
    description: "Scripts salvos para responder mais rÃ¡pido, seus ou da equipe.",
    icon: FileText,
    group: "atendimento",
    sidebar: true,
  },

  // ---- CRM â€” o funil ----
  {
    // âš ï¸ ERA "Kanban", e a URL continua sendo. O nome saiu da interface porque o
    // produto tinha CINCO vocabulÃ¡rios para a mesma coisa â€” "Kanban" no menu,
    // "Pipelines" no tÃ­tulo desta tela, "Funis" no menu ao lado, "funil" em todo
    // o corpo dela e "quadro" no onboarding inteiro. TrÃªs deles no mesmo
    // viewport: o <h1> dizia "Pipelines", o estado vazio dizia "Sem pipelines
    // configurados" e o botÃ£o embaixo dizia "Criar meu primeiro funil".
    //
    // Ficou "Funis" porque Ã© o que esta tela Ã‰: a lista dos funis, de onde se
    // abre o quadro de cada um. "Pipeline" Ã© palavra de quem construiu o
    // sistema; "funil de vendas" Ã© palavra de quem vende.
    href: "/app/kanban",
    label: "Funis",
    description: "Seus funis de venda â€” clique em um para abrir o quadro de clientes.",
    icon: Kanban,
    group: "crm",
    sidebar: true,
  },
  {
    href: "/app/contacts",
    label: "Contatos",
    description: "As pessoas do outro lado da conversa e seu histÃ³rico.",
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
    description: "Lista e calendÃ¡rio unificado de tarefas internas e agendamentos de consultas com data e horÃ¡rio.",
    icon: CheckSquare,
    group: "crm",
    sidebar: true,
  },
  {
    // Estava enterrado em ConfiguraÃ§Ãµes e ninguÃ©m sabia que existia â€” o achado
    // que originou esta reorganizaÃ§Ã£o. A URL nÃ£o muda; sÃ³ o lugar na navegaÃ§Ã£o.
    //
    // âš ï¸ ERA "Funis", nome que ele DISPUTAVA com o destino acima: os dois
    // listavam as mesmas linhas de `crm_pipelines`, lado a lado no mesmo grupo,
    // com nomes que nÃ£o diziam qual servia para quÃª. A diferenÃ§a real Ã© o VERBO,
    // e Ã© ela que o nome carrega agora: lÃ¡ se ABRE o funil, aqui se CONFIGURA o
    // que ele significa.
    href: "/app/settings/tenant/pipelines",
    label: "Etapas do funil",
    description: "As colunas de cada funil, o vocabulÃ¡rio do negÃ³cio e os motivos de perda.",
    icon: Funnel,
    group: "crm",
    minRole: "manager",
    sidebar: true,
  },

  // ---- Agente de IA â€” montar, ensinar, acompanhar ----
  {
    href: "/app/ai/agents",
    label: "Agentes",
    description: "Quem atende por vocÃª: instruÃ§Ãµes, modelo, ferramentas e publicaÃ§Ã£o.",
    icon: Robot,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/followups",
    label: "Follow-ups",
    description: "Como o agente retoma uma conversa que esfriou, para nenhuma morrer no silÃªncio.",
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
    // O sistema chama modelo em 23 lugares e, atÃ© esta tela, a escolha vivia
    // espalhada por trÃªs pilhas de cÃ³digo e sete variÃ¡veis de ambiente â€” nÃ£o
    // havia onde responder "quem usa IA aqui, e com qual chave?".
    href: "/app/ai/providers",
    label: "Provedores",
    description: "Qual inteligÃªncia atende cada parte do sistema â€” e o que acontece se ela falhar.",
    icon: Plugs,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    // SEM `sidebar: true`, como as outras nove telas deste grupo. Adicionar as
    // duas telas novas Ã  sidebar estourou a dobra em 900px â€” medido pelo e2e
    // `navegacao.spec.ts`, que existe justamente porque agrupar o menu o faz
    // crescer. Configurar provedor Ã© tarefa de poucas vezes; o caminho Ã© o hub
    // "Ver tudo em IA", igual a Credenciais, Conhecimento, MemÃ³ria e Skills.
  },
  {
    href: "/app/ai/knowledge/sources",
    label: "Conhecimento",
    description: "Os materiais que o agente consulta antes de responder sobre o seu negÃ³cio.",
    icon: BookOpen,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/memory",
    label: "MemÃ³ria",
    description: "O que o agente jÃ¡ aprendeu sobre a sua operaÃ§Ã£o e reaproveita.",
    icon: Brain,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/skills",
    label: "Skills",
    description: "As aÃ§Ãµes que o agente pode executar sozinho durante o atendimento.",
    icon: PuzzlePiece,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/cases",
    label: "Casos",
    description: "Os atendimentos que o agente conduziu, do inÃ­cio ao desfecho.",
    icon: ClipboardText,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "agent",
  },
  {
    href: "/app/ai/inbox",
    label: "Alertas",
    description: "O que a IA encontrou e precisa de uma decisÃ£o sua.",
    icon: Flag,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    // Ã“rfÃ£: nenhum lugar do app linkava para cÃ¡. O flywheel gerava propostas de
    // melhoria do agente e a fila sÃ³ era vista por quem soubesse a URL.
    href: "/app/ai/proposals",
    label: "Propostas",
    description: "Melhorias que a IA sugere para si mesma, esperando sua decisÃ£o.",
    icon: Lightbulb,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    // A tela de Uso responde "quanto gastei". Esta responde a pergunta que nÃ£o
    // tinha lugar nenhum: "o agente parou de responder, o que aconteceu?".
    // Antes da migration 0128 ela seria impossÃ­vel de construir com honestidade
    // â€” llm_calls sÃ³ registrava sucesso.
    href: "/app/ai/runs",
    label: "ExecuÃ§Ãµes",
    description: "O que a IA fez â€” e, quando falhou, o que aconteceu e o que fazer.",
    icon: ListChecks,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
    // Idem: fora da sidebar para o menu nÃ£o passar da dobra. Quem vem para cÃ¡
    // estÃ¡ diagnosticando, e chega pelo hub ou pelo link do aviso na Central.
  },
  {
    href: "/app/ai/usage",
    label: "Uso e orÃ§amento",
    description: "Quanto a IA consumiu e qual Ã© o teto de gasto do mÃªs.",
    icon: Gauge,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
  },

  // ---- Canais â€” por onde as mensagens entram e saem ----
  {
    href: "/app/connections",
    label: "ConexÃµes",
    // Cobre os DOIS caminhos desde o PR #105: nÃºmero por QR e canal oficial da
    // Meta (com os templates dele), cada um numa aba. A descriÃ§Ã£o cita "oficial"
    // e "Meta" de propÃ³sito â€” Ã© por esses nomes que se procura no âŒ˜K, e a busca
    // varre a descriÃ§Ã£o alÃ©m do rÃ³tulo.
    description:
      "Seus nÃºmeros de WhatsApp: por QR ou canal oficial da Meta, com saÃºde, reconexÃ£o e templates.",
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

  // ---- AnÃ¡lise â€” olhar o sistema funcionando ----
  {
    href: "/app/activities",
    label: "RelatÃ³rio de Atividades",
    description: "Linha do tempo e mÃ©tricas de tarefas concluÃ­das, atendimentos e aÃ§Ãµes realizadas.",
    icon: ListChecks,
    group: "analise",
    sidebar: true,
  },
  {
    href: "/app/metrics",
    label: "Desempenho",
    description: "Funil e performance por atendente nos Ãºltimos 30 dias.",
    icon: ChartBar,
    group: "analise",
    sidebar: true,
  },
  {
    // Observabilidade, nÃ£o configuraÃ§Ã£o: por isso nÃ£o fica junto dos agentes.
    href: "/app/ai/evolution",
    label: "EvoluÃ§Ã£o da IA",
    description: "Se o agente estÃ¡ melhorando, onde ele erra e o que falta ensinar.",
    icon: ChartLineUp,
    group: "analise",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/audit",
    label: "Audit Log",
    description: "Quem fez o quÃª, quando â€” o histÃ³rico que nÃ£o se apaga.",
    icon: ClockCounterClockwise,
    group: "analise",
    minRole: "manager",
    sidebar: true,
  },

  // ---- OrganizaÃ§Ã£o â€” conta, empresa, acesso ----
  {
    href: "/app/settings/profile",
    label: "Perfil",
    description: "Seu nome, idioma, fuso horÃ¡rio e avatar.",
    icon: UserCircle,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/security",
    label: "SeguranÃ§a",
    description: "VerificaÃ§Ã£o em duas etapas, cÃ³digos de recuperaÃ§Ã£o e sessÃµes.",
    icon: ShieldCheck,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/notifications",
    label: "NotificaÃ§Ãµes",
    description: "Por onde e sobre o quÃª vocÃª quer ser avisado.",
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
    // A porta que faltava (issue #144): rodÃ­zio de atendimento e restriÃ§Ã£o de
    // visibilidade existiam inteiros no backend e nÃ£o tinham NENHUMA tela â€” sÃ³
    // dava para ligar com UPDATE Ã  mÃ£o no banco.
    href: "/app/settings/atendimento",
    label: "DistribuiÃ§Ã£o de atendimento",
    description: "Quem recebe cada cliente novo, e o que cada atendente enxerga.",
    icon: UsersThree,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "manager",
  },
  {
    href: "/app/settings/tenant",
    label: "OrganizaÃ§Ã£o",
    description: "Dados da empresa, retenÃ§Ã£o de dados e encarregado de LGPD.",
    icon: Buildings,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/settings/cadastros",
    label: "Procedimentos, Tags & Fontes",
    description: "CatÃ¡logo de procedimentos da clÃ­nica, tags dos cards e fontes de captaÃ§Ã£o de pacientes.",
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
    // `admin` pelo mesmo motivo da linha de cima: o que se edita ali Ã©
    // identidade da empresa, e dÃ¡-lo a `manager` o colocaria abaixo de billing e
    // de API tokens na mesma prancheta.
    minRole: "admin",
    // SEM `sidebar`: fica sÃ³ no hub. Trocar a marca Ã© tarefa de uma vez, e
    // agrupar o menu jÃ¡ o fez crescer â€” duas telas a mais estouraram a dobra em
    // 900px, medido pelo e2e `navegacao.spec.ts`.
  },
  {
    href: "/app/settings/billing",
    label: "Billing",
    description: "Plano e cobranÃ§a.",
    icon: Receipt,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/lgpd/requests",
    label: "LGPD",
    description: "Pedidos de exportaÃ§Ã£o e exclusÃ£o de dados feitos por clientes.",
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
 * Ãšnico ponto de decisÃ£o de permissÃ£o da navegaÃ§Ã£o.
 *
 * Ã‰ o que dispensa os sete `usePermission()` que o Sidebar chamava em sequÃªncia
 * â€” hooks nÃ£o rodam em laÃ§o condicional, entÃ£o cada permissÃ£o exigia sua linha.
 * Como funÃ§Ã£o pura, um `.filter()` resolve todas.
 */
export function canSee(d: NavDestination, isPlatformAdmin: boolean, role: Role | null): boolean {
  if (isPlatformAdmin) return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[d.minRole ?? "viewer"];
}

/** ProjeÃ§Ã£o do sidebar: sÃ³ o uso diÃ¡rio, agrupado, sem grupo vazio. */
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
 * ProjeÃ§Ã£o do hub: TODAS as telas do grupo â€” inclusive as que jÃ¡ estÃ£o no
 * sidebar. O hub Ã© inventÃ¡rio, nÃ£o sobra; Ã© onde se descobre o que existe.
 *
 * A ordem das seÃ§Ãµes Ã© a de primeira apariÃ§Ã£o no registro, entÃ£o reordenar a
 * jornada Ã© reordenar o array â€” nÃ£o hÃ¡ uma segunda lista para manter em sincronia.
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

/** ProjeÃ§Ã£o do âŒ˜K: todo destino visÃ­vel, do sidebar ou nÃ£o. */
export function searchable(isPlatformAdmin: boolean, role: Role | null): NavDestination[] {
  return NAV_DESTINATIONS.filter((d) => canSee(d, isPlatformAdmin, role));
}
