"use client";
import { Draggable } from "@hello-pangea/dnd";
import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { Check } from "@/lib/ui/icons";
import type { Lead } from "@/lib/types/leads";
import type { OrcamentoLead } from "@/lib/types/orcamento";
import { resolveCardState, stageAgeLabel, type CardInput } from "@/lib/kanban/card-state";
import type { CardLayout, CardLayoutField } from "@/lib/kanban/card-layout";
import { KanbanCardActions } from "./KanbanCardActions";
import { NextActionSlot } from "./NextActionSlot";
import { ReactivationSlot } from "./ReactivationSlot";
import { ConversaSlot } from "./ConversaSlot";
import { ScoreSlot } from "./ScoreSlot";

interface KanbanCardProps {
  /** O que o card mostra — explicitamente NÃO é a linha do banco. */
  card: CardInput;
  /** A linha do lead, só para o menu de ações (que muta o lead). */
  lead: Lead;
  index: number;
  pipelineId: string;
  stages?: Array<{ id: string; name: string }>;
  layout: CardLayout;
  isSelected?: boolean;
  /**
   * Contador de pulsos deste card (evento REMOTO). Muda a cada evento novo — é
   * a MUDANÇA que remonta o overlay e reinicia a animação; um booleano deixaria
   * o segundo evento dentro da janela passar despercebido.
   */
  pulseCount?: number;
  onSelect?: (leadId: string, additive: boolean) => void;
  selectionMode?: boolean;
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

function formatCustomValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const items = value.filter((item) => typeof item === "string" || typeof item === "number");
    return items.length > 0 ? items.join(", ") : null;
  }
  return null;
}
export function KanbanCard({
  card,
  lead,
  index,
  pipelineId,
  stages,
  layout,
  isSelected,
  pulseCount = 0,
  onSelect,
  selectionMode = false,
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

  function renderField(field: CardLayoutField) {
    if (field.startsWith("custom:")) {
      const value = formatCustomValue(custom[field.slice("custom:".length)]);
      return value ? <span title={value}>{value}</span> : null;
    }

    switch (field) {
      case "procedure":
        return procedimento !== "Sem produto" ? (
          <span className="dark:text-primary/90 text-primary" title={procedimento}>
            {procedimento}
          </span>
        ) : null;
      case "value":
        return effectiveCents && effectiveCents > 0 ? (
          <span className="font-semibold tabular-nums text-foreground">{valorFormatado}</span>
        ) : null;
      case "owner":
        return card.owner.name ? <span title={card.owner.name}>{card.owner.name}</span> : null;
      case "appointment":
        return agendamentoDataStr ? (
          <span
            className="text-emerald-600 dark:text-emerald-400"
            title={`Agendamento: ${agendamentoDataStr}`}
          >
            {agendamentoDataStr}
          </span>
        ) : null;
      case "source":
        return fonteBadge ? (
          <span
            className={cn(
              "inline-flex max-w-20 truncate rounded border px-1 text-[8px] font-medium leading-3",
              fonteBadge.className,
            )}
            title={`Fonte: ${fonteBadge.label}`}
          >
            {fonteBadge.label}
          </span>
        ) : null;
      case "tag": {
        const tag = leadTags[0];
        return tag ? (
          <span
            className="border-border/60 bg-secondary/80 inline-flex max-w-20 truncate rounded border px-1 text-[8px] leading-3 text-secondary-foreground"
            title={`Tag: ${tag}`}
          >
            {tag}
          </span>
        ) : null;
      }
      case "conversation":
        return lead.conversa ? <ConversaSlot conversa={lead.conversa} /> : null;
      case "stage_age":
        return age ? <span className="tabular-nums">{age}</span> : null;
      case "status":
        if (state.slot.type === "awaiting") {
          return (
            <NextActionSlot
              label={state.slot.label}
              leadId={card.id}
              approvedSeq={lead.next_action?.seq ?? -1}
              pipelineId={pipelineId}
            />
          );
        }
        if (state.slot.type === "reactivation") {
          return (
            <ReactivationSlot
              leadId={card.id}
              proposalId={state.slot.proposalId}
              expiresAt={state.slot.expiresAt}
              pipelineId={pipelineId}
            />
          );
        }
        if (state.slot.type === "meter") {
          return (
            <ScoreSlot
              probability={state.slot.probability}
              band={state.slot.band}
              reason={state.slot.reason}
              factors={state.slot.factors}
            />
          );
        }
        return state.slot.type === "cooling" ? (
          <span className="text-warning-fg">{state.slot.label}</span>
        ) : null;
    }
  }
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (selectionMode || e.metaKey || e.ctrlKey) {
      onSelect?.(card.id, true);
      return;
    }
    onOpen?.(card.id);
  };

  return (
    <Draggable draggableId={card.id} index={index} isDragDisabled={selectionMode}>
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
            "border-border/80 group relative cursor-pointer select-none overflow-hidden rounded-md border bg-surface",
            "p-1.5 shadow-xs transition-all duration-150",
            selectionMode && "pl-7",
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

          {selectionMode && (
            <button
              type="button"
              aria-label={isSelected ? `Remover ${card.title} da seleção` : `Selecionar ${card.title}`}
              aria-pressed={Boolean(isSelected)}
              onClick={(event) => {
                event.stopPropagation();
                onSelect?.(card.id, true);
              }}
              className={cn(
                "absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded border transition-colors",
                isSelected
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-surface hover:border-accent",
              )}
            >
              {isSelected && <Check size={12} weight="bold" />}
            </button>
          )}

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (selectionMode) {
                    onSelect?.(card.id, true);
                    return;
                  }
                  onOpen?.(card.id);
                }}
                className="leading-3.5 min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-foreground hover:underline"
                title={card.title}
              >
                {card.title}
              </button>
              <KanbanCardActions lead={lead} pipelineId={pipelineId} stages={stages} />
            </div>

            {layout.slots.length > 0 && (
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] leading-3 text-muted-foreground">
                {layout.slots.map((field) => {
                  const content = renderField(field);
                  if (content === null) return null;
                  return (
                    <span
                      key={field}
                      className={cn(
                        "min-w-0 max-w-full truncate",
                        field === "conversation" && "basis-full",
                        (field === "status" || field === "conversation") &&
                          "flex items-center gap-1",
                      )}
                    >
                      {content}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
