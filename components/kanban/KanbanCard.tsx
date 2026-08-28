"use client";
import { Draggable } from "@hello-pangea/dnd";
import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/types/leads";
import type { OrcamentoLead } from "@/lib/types/orcamento";
import { resolveCardState, stageAgeLabel, type CardInput } from "@/lib/kanban/card-state";
import { KanbanCardActions } from "./KanbanCardActions";
import { NextActionSlot } from "./NextActionSlot";
import { ReactivationSlot } from "./ReactivationSlot";
import { ConversaSlot } from "./ConversaSlot";
import { ScoreSlot } from "./ScoreSlot";
import {
  Calendar,
  Clock,
  User,
  Tag as TagIcon,
  DollarSign,
  Bot,
} from "lucide-react";

interface KanbanCardProps {
  /** O que o card mostra — explicitamente NÃO é a linha do banco. */
  card: CardInput;
  /** A linha do lead, só para o menu de ações (que muta o lead). */
  lead: Lead;
  index: number;
  pipelineId: string;
  isSelected?: boolean;
  /**
   * Contador de pulsos deste card (evento REMOTO). Muda a cada evento novo — é
   * a MUDANÇA que remonta o overlay e reinicia a animação; um booleano deixaria
   * o segundo evento dentro da janela passar despercebido.
   */
  pulseCount?: number;
  onSelect?: (leadId: string, additive: boolean) => void;
  /** Abrir o dossiê. Separado de `onSelect`: são gestos e intenções diferentes. */
  onOpen?: (leadId: string) => void;
}

function formatMoneyBRL(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "R$ 0,00";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `R$ ${(cents / 100).toFixed(0)}`;
  }
}

function formatAgendamentoDate(rawDate?: unknown, rawHora?: unknown): string | null {
  if (!rawDate || typeof rawDate !== "string") return null;
  let datePart = rawDate;
  if (rawDate.includes("T")) {
    datePart = rawDate.split("T")[0] || rawDate;
  }
  const parts = datePart.split("-");
  let formatted = datePart;
  if (parts.length === 3) {
    const [year, month, day] = parts;
    formatted = `${day}/${month}/${year}`;
  }
  if (rawHora && typeof rawHora === "string") {
    formatted += ` às ${rawHora}`;
  }
  return formatted;
}

function getAvatarColor(name: string): { bg: string; text: string } {
  const colors: Array<{ bg: string; text: string }> = [
    { bg: "bg-pink-100 dark:bg-pink-950/70 border-pink-200 dark:border-pink-800", text: "text-pink-600 dark:text-pink-300" },
    { bg: "bg-sky-100 dark:bg-sky-950/70 border-sky-200 dark:border-sky-800", text: "text-sky-600 dark:text-sky-300" },
    { bg: "bg-purple-100 dark:bg-purple-950/70 border-purple-200 dark:border-purple-800", text: "text-purple-600 dark:text-purple-300" },
    { bg: "bg-amber-100 dark:bg-amber-950/70 border-amber-200 dark:border-amber-800", text: "text-amber-600 dark:text-amber-300" },
    { bg: "bg-emerald-100 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-800", text: "text-emerald-600 dark:text-emerald-300" },
    { bg: "bg-indigo-100 dark:bg-indigo-950/70 border-indigo-200 dark:border-indigo-800", text: "text-indigo-600 dark:text-indigo-300" },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  const idx = Math.abs(hash) % colors.length;
  return colors[idx] ?? colors[0]!;
}

function getFonteBadge(source?: string | null) {
  if (!source || !source.trim()) return null;
  const s = source.toLowerCase();
  if (s.includes("face") || s.includes("fb")) {
    return { label: "Ads Facebook", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" };
  }
  if (s.includes("insta") || s.includes("ig")) {
    return { label: "Instagram", className: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800" };
  }
  if (s.includes("google") || s.includes("gads")) {
    return { label: "Google Ads", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" };
  }
  if (s.includes("whats") || s.includes("waha")) {
    return { label: "WhatsApp", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" };
  }
  if (s.includes("indica")) {
    return { label: "Indicação", className: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800" };
  }
  if (s.includes("inbound") || s.includes("site") || s.includes("landing")) {
    return { label: "Inbound", className: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800" };
  }
  return { label: source, className: "bg-secondary text-secondary-foreground border-border" };
}

export function KanbanCard({
  card,
  lead,
  index,
  pipelineId,
  isSelected,
  pulseCount = 0,
  onSelect,
  onOpen,
}: KanbanCardProps) {
  const state = resolveCardState(card);
  const age = stageAgeLabel(card.hoursInStage);

  const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
  const orcamento = custom.orcamento as OrcamentoLead | undefined;

  // Valor total: orçamento detalhado ou valor do lead
  const effectiveCents =
    orcamento?.total_cents !== undefined && orcamento.total_cents > 0
      ? orcamento.total_cents
      : lead.value_cents ?? card.valueCents;
  const valorFormatado = formatMoneyBRL(effectiveCents);

  // Procedimento / Produto
  const procedimento =
    (typeof custom.procedimento === "string" && custom.procedimento.trim()) ||
    (typeof custom.procedure === "string" && custom.procedure.trim()) ||
    (orcamento?.itens?.[0]?.descricao) ||
    "Sem produto";

  // Data de Agendamento
  const agendamentoDataStr = formatAgendamentoDate(
    custom.agendamento_data || lead.expected_close_date,
    custom.agendamento_hora,
  );

  // Fonte
  const rawFonte = String(
    lead.source ||
    (lead.source_metadata as Record<string, unknown>)?.utm_source ||
    custom.fonte ||
    ""
  ).trim();
  const fonteBadge = getFonteBadge(rawFonte);

  // Tags do Lead
  const leadTags = Array.isArray(lead.tags) ? lead.tags : card.tags ?? [];

  // Metadados de Anúncio
  const sourceMeta = (lead.source_metadata ?? {}) as Record<string, unknown>;
  const adHeadline = String(custom.ad_headline ?? sourceMeta.headline ?? "").trim();

  // Avatar
  const avatarTheme = getAvatarColor(card.title || "Lead");
  const initial = (card.title || "L").trim().charAt(0).toUpperCase();
  const shortId = `#${card.id.replace(/-/g, "").slice(-4).toUpperCase()}`;

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey) {
      onSelect?.(card.id, true);
      return;
    }
    onOpen?.(card.id);
  };

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          role="group"
          aria-label={`Lead: ${card.title}`}
          onClick={handleClick}
          title={leadTags.length > 0 ? `Tags: ${leadTags.join(", ")}` : undefined}
          className={cn(
            "group relative overflow-hidden rounded-lg border border-border/80 bg-surface cursor-pointer select-none",
            "p-2.5 shadow-xs transition-all duration-150",
            "hover:border-border-strong hover:shadow-sm",
            snapshot.isDragging && "rotate-1 shadow-md ring-2 ring-accent/40 z-50",
            isSelected && "ring-2 ring-accent",
          )}
        >
          {pulseCount > 0 && (
            <span
              key={pulseCount}
              aria-hidden
              data-pulse={pulseCount}
              className="card-pulse pointer-events-none absolute inset-0"
            />
          )}

          {/* Borda de estado lateral */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-1",
              state.border === "accent" && "bg-accent",
              state.border === "warning" && "bg-amber-500",
              state.border === "neutral" && "bg-transparent",
            )}
          />

          {/* 1. Header do Card: Avatar, Nome, Procedimento e Código/ID */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              {/* Avatar Redondo */}
              <div
                className={cn(
                  "h-7 w-7 rounded-full border flex items-center justify-center font-bold text-[11px] shrink-0 select-none shadow-2xs",
                  avatarTheme.bg,
                  avatarTheme.text,
                )}
              >
                {initial}
              </div>

              {/* Nome do Paciente + Procedimento */}
              <div className="flex flex-col min-w-0 flex-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.(card.id);
                  }}
                  className="text-left font-bold text-sm leading-tight text-foreground truncate hover:underline"
                  title={card.title}
                >
                  {card.title}
                </button>
                <span
                  className={cn(
                    "text-[11px] truncate mt-0.5 font-medium",
                    procedimento !== "Sem produto"
                      ? "text-primary dark:text-primary/90"
                      : "text-muted-foreground/70",
                  )}
                  title={procedimento}
                >
                  {procedimento}
                </span>
              </div>
            </div>

            {/* Código/ID e Menu de Ações */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="sr-only">
                {shortId}
              </span>
              <KanbanCardActions lead={lead} pipelineId={pipelineId} />
            </div>
          </div>

          {/* 2. Informações Detalhadas: Responsável, Valor, Agendamento, Atividades */}
          <div className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
            {/* Responsável / Atendente */}
            <div className="flex items-center gap-1.5 text-foreground/90 font-medium truncate">
              {card.owner.kind === "ai" ? (
                <Bot className="h-3.5 w-3.5 text-purple-500 shrink-0" />
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="truncate text-[11px]">
                {card.owner.name || "Sem responsável"}
              </span>
            </div>

            {/* Valor do Negócio */}
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs text-primary font-bold tabular-nums">
                {valorFormatado}
              </span>
            </div>

            {/* Data de Agendamento (se houver) */}
            {agendamentoDataStr && (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{agendamentoDataStr}</span>
              </div>
            )}

            {/* Próxima Ação ou Status Operacional */}
            {state.slot.type === "awaiting" ? (
              <NextActionSlot
                label={state.slot.label}
                leadId={card.id}
                approvedSeq={lead.next_action?.seq ?? -1}
                pipelineId={pipelineId}
              />
            ) : state.slot.type === "reactivation" ? (
              <ReactivationSlot
                leadId={card.id}
                proposalId={state.slot.proposalId}
                expiresAt={state.slot.expiresAt}
                pipelineId={pipelineId}
              />
            ) : state.slot.type === "meter" ? (
              <ScoreSlot
                probability={state.slot.probability}
                band={state.slot.band}
                reason={state.slot.reason}
                factors={state.slot.factors}
              />
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {state.slot.type === "cooling"
                    ? state.slot.label
                    : "Sem atividades pendentes"}
                </span>
              </div>
            )}
          </div>

          {/* Atalho de conversa do WhatsApp */}
          <div className="mt-1">
            <ConversaSlot conversa={lead.conversa} />
          </div>

          {/* 3. Rodapé do Card: Tags, Fonte e Tempo no Estágio */}
          <div className="mt-1.5 pt-1.5 border-t border-border/50 flex items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1 overflow-hidden max-w-[210px]">
              {/* Badge de Fonte */}
              {fonteBadge && (
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border",
                    fonteBadge.className,
                  )}
                  title={`Fonte: ${fonteBadge.label}`}
                >
                  {fonteBadge.label}
                </span>
              )}

              {/* Badge de Campanha/Anúncio Meta Ads */}
              {adHeadline && (
                <span
                  className="hidden"
                  title={`Campanha / Anúncio: ${adHeadline}`}
                >
                  📢 {adHeadline}
                </span>
              )}

              {/* Badges de Tags */}
              {leadTags.slice(0, 1).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-md bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground border border-border/60 truncate max-w-[90px]"
                  title={`Tag: ${t}`}
                >
                  {t}
                </span>
              ))}

              {leadTags.length > 1 && (
                <span
                  className="text-[9px] font-bold text-muted-foreground"
                  title={`Mais ${leadTags.length - 1} tags: ${leadTags.slice(1).join(", ")}`}
                >
                  +{leadTags.length - 1}
                </span>
              )}
            </div>

            {/* Ícone de Tag e Idade no Estágio */}
            <div className="flex items-center gap-1 shrink-0 text-muted-foreground/70">
              <TagIcon className="h-3 w-3" />
              <span className="text-[10px] tabular-nums">
                {age ? `${age}` : ""}
              </span>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
