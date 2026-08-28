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
import { Calendar, User, Bot } from "lucide-react";

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
    {
      bg: "bg-pink-100 dark:bg-pink-950/70 border-pink-200 dark:border-pink-800",
      text: "text-pink-600 dark:text-pink-300",
    },
    {
      bg: "bg-sky-100 dark:bg-sky-950/70 border-sky-200 dark:border-sky-800",
      text: "text-sky-600 dark:text-sky-300",
    },
    {
      bg: "bg-purple-100 dark:bg-purple-950/70 border-purple-200 dark:border-purple-800",
      text: "text-purple-600 dark:text-purple-300",
    },
    {
      bg: "bg-amber-100 dark:bg-amber-950/70 border-amber-200 dark:border-amber-800",
      text: "text-amber-600 dark:text-amber-300",
    },
    {
      bg: "bg-emerald-100 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-600 dark:text-emerald-300",
    },
    {
      bg: "bg-indigo-100 dark:bg-indigo-950/70 border-indigo-200 dark:border-indigo-800",
      text: "text-indigo-600 dark:text-indigo-300",
    },
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
    return {
      label: "Ads Facebook",
      className:
        "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    };
  }
  if (s.includes("insta") || s.includes("ig")) {
    return {
      label: "Instagram",
      className:
        "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800",
    };
  }
  if (s.includes("google") || s.includes("gads")) {
    return {
      label: "Google Ads",
      className:
        "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    };
  }
  if (s.includes("whats") || s.includes("waha")) {
    return {
      label: "WhatsApp",
      className:
        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    };
  }
  if (s.includes("indica")) {
    return {
      label: "Indicação",
      className:
        "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    };
  }
  if (s.includes("inbound") || s.includes("site") || s.includes("landing")) {
    return {
      label: "Inbound",
      className:
        "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
    };
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
      : (lead.value_cents ?? card.valueCents);
  const valorFormatado = formatMoneyBRL(effectiveCents);

  // Procedimento / Produto
  const procedimento =
    (typeof custom.procedimento === "string" && custom.procedimento.trim()) ||
    (typeof custom.procedure === "string" && custom.procedure.trim()) ||
    orcamento?.itens?.[0]?.descricao ||
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
      "",
  ).trim();
  const fonteBadge = getFonteBadge(rawFonte);

  // Tags do Lead
  const leadTags = Array.isArray(lead.tags) ? lead.tags : (card.tags ?? []);

  // Avatar
  const avatarTheme = getAvatarColor(card.title || "Lead");
  const initial = (card.title || "L").trim().charAt(0).toUpperCase();

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
            "border-border/80 group relative cursor-pointer select-none overflow-hidden rounded-lg border bg-surface",
            "p-2 shadow-xs transition-all duration-150",
            "hover:border-border-strong hover:shadow-sm",
            snapshot.isDragging && "ring-accent/40 z-50 rotate-1 shadow-md ring-2",
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

          <div className="flex min-w-0 items-start gap-2">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full border text-[11px] font-bold",
                avatarTheme.bg,
                avatarTheme.text,
              )}
              aria-hidden
            >
              {initial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.(card.id);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold leading-4 text-foreground hover:underline"
                  title={card.title}
                >
                  {card.title}
                </button>
                {age && (
                  <span className="text-muted-foreground/70 shrink-0 text-[9px] tabular-nums">
                    {age}
                  </span>
                )}
                <KanbanCardActions lead={lead} pipelineId={pipelineId} />
              </div>

              <div className="leading-3.5 mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px]">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    procedimento !== "Sem produto"
                      ? "dark:text-primary/90 text-primary"
                      : "text-muted-foreground/70",
                  )}
                  title={procedimento}
                >
                  {procedimento}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {valorFormatado}
                </span>
              </div>

              <div className="leading-3.5 mt-1 flex min-w-0 items-center gap-1.5 text-[9px] text-muted-foreground">
                <span className="flex min-w-0 items-center gap-1">
                  {card.owner.kind === "ai" ? (
                    <Bot className="h-2.5 w-2.5 shrink-0 text-purple-500" />
                  ) : (
                    <User className="h-2.5 w-2.5 shrink-0" />
                  )}
                  <span className="truncate">{card.owner.name || "Sem responsável"}</span>
                </span>
                {agendamentoDataStr && (
                  <span
                    className="ml-auto flex min-w-0 items-center gap-1 text-emerald-600 dark:text-emerald-400"
                    title={`Agendamento: ${agendamentoDataStr}`}
                  >
                    <Calendar className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{agendamentoDataStr}</span>
                  </span>
                )}
              </div>

              <div className="mt-1 flex min-w-0 items-center gap-1">
                {fonteBadge && (
                  <span
                    className={cn(
                      "inline-flex max-w-20 truncate rounded border px-1 py-px text-[9px] font-medium leading-3",
                      fonteBadge.className,
                    )}
                    title={`Fonte: ${fonteBadge.label}`}
                  >
                    {fonteBadge.label}
                  </span>
                )}
                {leadTags.slice(0, 1).map((tag) => (
                  <span
                    key={tag}
                    className="border-border/60 bg-secondary/80 inline-flex max-w-20 truncate rounded border px-1 py-px text-[9px] leading-3 text-secondary-foreground"
                    title={`Tag: ${tag}`}
                  >
                    {tag}
                  </span>
                ))}
                {leadTags.length > 1 && (
                  <span
                    className="text-[9px] text-muted-foreground"
                    title={leadTags.slice(1).join(", ")}
                  >
                    +{leadTags.length - 1}
                  </span>
                )}

                <span className="ml-auto flex shrink-0 items-center gap-1 text-[9px]">
                  {state.slot.type === "meter" ? (
                    <ScoreSlot
                      probability={state.slot.probability}
                      band={state.slot.band}
                      reason={state.slot.reason}
                      factors={state.slot.factors}
                    />
                  ) : state.slot.type === "cooling" ? (
                    <span className="max-w-24 truncate text-warning-fg" title={state.slot.label}>
                      {state.slot.label}
                    </span>
                  ) : state.slot.type === "idle" ? (
                    <span className="text-muted-foreground/70">Sem tarefas</span>
                  ) : null}
                  <ConversaSlot conversa={lead.conversa} compact />
                </span>
              </div>

              {(state.slot.type === "awaiting" || state.slot.type === "reactivation") && (
                <div className="border-border/50 mt-1 flex min-w-0 items-center gap-1 border-t pt-1 text-[9px]">
                  {state.slot.type === "awaiting" ? (
                    <NextActionSlot
                      label={state.slot.label}
                      leadId={card.id}
                      approvedSeq={lead.next_action?.seq ?? -1}
                      pipelineId={pipelineId}
                    />
                  ) : (
                    <ReactivationSlot
                      leadId={card.id}
                      proposalId={state.slot.proposalId}
                      expiresAt={state.slot.expiresAt}
                      pipelineId={pipelineId}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
