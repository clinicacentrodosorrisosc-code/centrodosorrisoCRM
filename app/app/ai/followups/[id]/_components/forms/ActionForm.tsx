"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { actionConfigSchema } from "@/lib/followup/graph-schema";
import { MODOS_DA_ACAO, opcoes, type ModoDaAcao } from "@/lib/followup/vocabulario";
import { useMessageTemplates, type MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { useTemplates, type TemplateView } from "@/hooks/channels/useTemplates";

import type { ConfigOf } from "./shared";

/**
 * Seletor de modelo que integra os modelos do WhatsApp Oficial (Meta)
 * e os modelos rápidos do Inbox.
 */
function SeletorDeModelo({
  id,
  valor,
  onChange,
  permiteVazio,
  metaTemplates,
  inboxTemplates,
  isLoading,
}: {
  id: string;
  valor: string;
  onChange: (templateId: string) => void;
  permiteVazio: boolean;
  metaTemplates: TemplateView[];
  inboxTemplates: MessageTemplate[];
  isLoading: boolean;
}) {
  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando seus modelos…</p>;

  const totalTemplates = metaTemplates.length + inboxTemplates.length;

  if (totalTemplates === 0) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Nenhum modelo encontrado. Conecte o canal oficial e sincronize seus templates em <strong>Conexões → Canal Oficial</strong>.
      </div>
    );
  }

  const SEM_MODELO = "__nenhum__";
  return (
    <Select
      value={valor === "" ? SEM_MODELO : valor}
      onValueChange={(v) => onChange(v === SEM_MODELO ? "" : v)}
    >
      <SelectTrigger id={id} className="text-sm">
        <SelectValue placeholder="Escolha um modelo de mensagem" />
      </SelectTrigger>
      <SelectContent>
        {permiteVazio && <SelectItem value={SEM_MODELO}>Nenhum</SelectItem>}

        {metaTemplates.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-primary">
              WhatsApp Oficial (Templates Meta)
            </SelectLabel>
            {metaTemplates.map((m) => (
              <SelectItem key={`${m.name}-${m.language}`} value={m.name}>
                <div className="flex items-center gap-2">
                  <span className="text-xs">
                    {m.status === "APPROVED" ? "🟢" : "🟡"} <strong>{m.name}</strong> ({m.language})
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {inboxTemplates.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground">
              Modelos Rápidos (Inbox)
            </SelectLabel>
            {inboxTemplates.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                💬 {m.title}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

/**
 * Caixa de prévia do modelo selecionado com texto real e destaque de variáveis.
 */
function TemplatePreviewBox({
  templateId,
  metaTemplates,
  inboxTemplates,
}: {
  templateId: string;
  metaTemplates: TemplateView[];
  inboxTemplates: MessageTemplate[];
}) {
  if (!templateId) return null;

  const metaTpl = metaTemplates.find((m) => m.name === templateId);
  const inboxTpl = inboxTemplates.find((m) => m.id === templateId || m.title === templateId);

  // Extrair texto do template
  let rawText = "";
  let templateTitle = templateId;
  let isMeta = false;

  if (metaTpl) {
    isMeta = true;
    templateTitle = `${metaTpl.name} (${metaTpl.language || "pt_BR"})`;
    if (Array.isArray(metaTpl.previews) && metaTpl.previews.length > 0) {
      rawText = metaTpl.previews.map((p) => p.text).join("\n\n");
    }
  } else if (inboxTpl) {
    templateTitle = inboxTpl.title;
    rawText = inboxTpl.body ?? "";
  }

  // Renderizar o texto com as variáveis destacadas em tags coloridas
  const renderHighlightedText = (text: string) => {
    if (!text) {
      return (
        <span className="italic text-muted-foreground">
          Modelo oficial selecionado: <strong>{templateId}</strong>. As variáveis <code>{"{{1}}"}</code> e <code>{"{{2}}"}</code> serão substituídas pelo nome do paciente e data/hora do agendamento.
        </span>
      );
    }
    const parts = text.split(/(\{\{[a-zA-Z0-9_]+\}\})/g);
    return parts.map((part, idx) => {
      if (/^\{\{[a-zA-Z0-9_]+\}\}$/.test(part)) {
        return (
          <span
            key={idx}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 mx-0.5"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 truncate">
          💬 Texto do Modelo: <span className="text-primary font-bold">{templateTitle}</span>
        </span>
        {isMeta && (
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
            WhatsApp Oficial
          </span>
        )}
      </div>

      {/* Caixa estilo balão de WhatsApp */}
      <div className="rounded-md bg-background p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap border border-border shadow-sm">
        {renderHighlightedText(rawText)}
      </div>

      {/* Mapeamento de variáveis */}
      <div className="space-y-2 pt-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          📌 Variáveis dinâmicas preenchidas no envio:
        </p>
        <div className="grid grid-cols-1 gap-1.5 text-xs">
          <div className="flex items-center justify-between rounded bg-background px-2.5 py-1.5 border border-border">
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{"{{1}}"}</span>
            <span className="text-muted-foreground">➔</span>
            <span className="font-medium text-foreground">🏷️ Nome / Título do Lead</span>
          </div>
          <div className="flex items-center justify-between rounded bg-background px-2.5 py-1.5 border border-border">
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{"{{2}}"}</span>
            <span className="text-muted-foreground">➔</span>
            <span className="font-medium text-foreground">📅 Data e Hora da Consulta (ex: 23/08 às 14:30)</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground pt-1 leading-relaxed">
          Esses valores são obtidos automaticamente do card do Lead no momento do disparo.
        </p>
      </div>
    </div>
  );
}

export function ActionForm({
  config,
  onChange,
}: {
  config: ConfigOf<"action">;
  onChange: (c: ConfigOf<"action">) => void;
}) {
  const { data: modelosInbox, isLoading: loadingInbox } = useMessageTemplates();
  const { data: metaPayload, isLoading: loadingMeta } = useTemplates();

  const metaTemplates = (metaPayload as unknown as { data?: { templates?: TemplateView[] }; templates?: TemplateView[] })?.data?.templates
    ?? (metaPayload as unknown as { templates?: TemplateView[] })?.templates
    ?? [];
  const inboxTemplates = modelosInbox ?? [];
  const isLoading = loadingInbox || loadingMeta;

  const [mode, setMode] = useState(config.mode);
  const [promptHint, setPromptHint] = useState(config.mode === "ai_message" ? config.prompt_hint : "");
  const [fallbackTemplateId, setFallbackTemplateId] = useState(
    config.mode === "ai_message" ? (config.fallback_template_id ?? "") : "",
  );
  const [templateId, setTemplateId] = useState(config.mode === "template" ? config.template_id : "");
  const [error, setError] = useState<string | null>(null);

  const commit = (next: {
    mode: ModoDaAcao;
    promptHint: string;
    fallbackTemplateId: string;
    templateId: string;
  }) => {
    const candidate =
      next.mode === "ai_message"
        ? {
            mode: "ai_message" as const,
            prompt_hint: next.promptHint,
            ...(next.fallbackTemplateId.trim() ? { fallback_template_id: next.fallbackTemplateId } : {}),
          }
        : { mode: "template" as const, template_id: next.templateId };
    const parsed = actionConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Configuração inválida.");
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="action-mode">Como escrever a mensagem</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            const next = v as ModoDaAcao;
            setMode(next);
            commit({ mode: next, promptHint, fallbackTemplateId, templateId });
          }}
        >
          <SelectTrigger id="action-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opcoes(MODOS_DA_ACAO).map(({ valor, rotulo }) => (
              <SelectItem key={valor} value={valor}>
                {rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mode === "ai_message" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="action-prompt-hint">Instrução para a IA</Label>
            <Textarea
              id="action-prompt-hint"
              maxLength={1000}
              value={promptHint}
              onChange={(e) => {
                setPromptHint(e.target.value);
                commit({ mode, promptHint: e.target.value, fallbackTemplateId, templateId });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="action-fallback">Se a IA não conseguir escrever, mandar este modelo</Label>
            <SeletorDeModelo
              id="action-fallback"
              valor={fallbackTemplateId}
              permiteVazio
              metaTemplates={metaTemplates}
              inboxTemplates={inboxTemplates}
              isLoading={isLoading}
              onChange={(v) => {
                setFallbackTemplateId(v);
                commit({ mode, promptHint, fallbackTemplateId: v, templateId });
              }}
            />
          </div>

          {fallbackTemplateId && (
            <TemplatePreviewBox
              templateId={fallbackTemplateId}
              metaTemplates={metaTemplates}
              inboxTemplates={inboxTemplates}
            />
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="action-template-id">Modelo de mensagem</Label>
            <SeletorDeModelo
              id="action-template-id"
              valor={templateId}
              permiteVazio={false}
              metaTemplates={metaTemplates}
              inboxTemplates={inboxTemplates}
              isLoading={isLoading}
              onChange={(v) => {
                setTemplateId(v);
                commit({ mode, promptHint, fallbackTemplateId, templateId: v });
              }}
            />
          </div>

          {templateId && (
            <TemplatePreviewBox
              templateId={templateId}
              metaTemplates={metaTemplates}
              inboxTemplates={inboxTemplates}
            />
          )}
        </div>
      )}
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}

