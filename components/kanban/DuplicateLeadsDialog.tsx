"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { encontrarGruposDuplicados, telefoneDoLead } from "@/lib/leads/duplicates";
import type { Lead } from "@/lib/types/leads";

type Campo = {
  key: "title" | "description" | "contact" | "value" | "owner" |
    "expected_close_date" | "tags" | "source" | "custom_fields";
  label: string;
};

const CAMPOS: Campo[] = [
  { key: "title", label: "Nome do card" },
  { key: "description", label: "Descrição" },
  { key: "contact", label: "Telefone" },
  { key: "value", label: "Orçamento" },
  { key: "owner", label: "Responsável" },
  { key: "expected_close_date", label: "Previsão de fechamento" },
  { key: "tags", label: "Etiquetas" },
  { key: "source", label: "Origem" },
  { key: "custom_fields", label: "Campos personalizados" },
];

function resumo(campo: Campo["key"], lead: Lead): string {
  if (campo === "title") return lead.title;
  if (campo === "description") return lead.description || "Sem descrição";
  if (campo === "contact") return telefoneDoLead(lead) || "Sem telefone";
  if (campo === "value") return lead.value_cents == null ? "Sem valor" :
    (lead.value_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: lead.currency ?? "BRL" });
  if (campo === "owner") return lead.owner_agent?.name ?? lead.owner_user_id?.slice(0, 8) ?? "Sem responsável";
  if (campo === "expected_close_date") return lead.expected_close_date ?? "Sem data";
  if (campo === "tags") return lead.tags.length ? lead.tags.join(", ") : "Sem etiquetas";
  if (campo === "source") return lead.source || "Sem origem";
  return Object.keys(lead.custom_fields ?? {}).length
    ? Object.keys(lead.custom_fields).length + " campo(s)" : "Sem campos personalizados";
}

export function DuplicateLeadsDialog({
  open, onOpenChange, leads, pipelineId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: Lead[];
  pipelineId: string;
}) {
  const qc = useQueryClient();
  const grupos = useMemo(() => encontrarGruposDuplicados(leads), [leads]);
  const [grupoIndex, setGrupoIndex] = useState(0);
  const grupo = useMemo(() => grupos[grupoIndex] ?? [], [grupos, grupoIndex]);
  const [principalId, setPrincipalId] = useState("");
  const [fontes, setFontes] = useState<Record<string, string>>({});
  const [confirmadoPara, setConfirmadoPara] = useState("");
  const [salvando, setSalvando] = useState(false);
  const grupoKey = grupo.map((lead) => lead.id).join("|");
  const principalEfetivo = grupo.some((lead) => lead.id === principalId)
    ? principalId
    : (grupo[0]?.id ?? "");
  const confirmado = confirmadoPara === grupoKey;
  const principal = grupo.find((lead) => lead.id === principalEfetivo) ?? grupo[0]!;

  function handleOpenChange(nextOpen: boolean) {
    setGrupoIndex(0);
    setPrincipalId("");
    setFontes({});
    setConfirmadoPara("");
    onOpenChange(nextOpen);
  }

  function escolherPrincipal(leadId: string) {
    setPrincipalId(leadId);
    setFontes(Object.fromEntries(CAMPOS.map((campo) => [campo.key, leadId])));
    setConfirmadoPara("");
  }

  function escolherFonte(campo: Campo["key"], leadId: string) {
    setFontes((atual) => ({ ...atual, [campo]: leadId }));
    setConfirmadoPara("");
  }

  function selecionarTodosDoCard(leadId: string) {
    setFontes(Object.fromEntries(CAMPOS.map((campo) => [campo.key, leadId])));
    setConfirmadoPara("");
  }

  function pularDuplicata() {
    if (grupoIndex + 1 < grupos.length) {
      setGrupoIndex((atual) => atual + 1);
      return;
    }
    handleOpenChange(false);
  }

  async function mesclar() {
    if (!principal || grupo.length < 2) return;
    const origem = (key: Campo["key"]) =>
      grupo.find((lead) => lead.id === fontes[key]) ?? principal;
    const titulo = origem("title");
    const descricao = origem("description");
    const contato = origem("contact");
    const valor = origem("value");
    const responsavel = origem("owner");
    const fechamento = origem("expected_close_date");
    const etiquetas = origem("tags");
    const source = origem("source");
    const personalizados = origem("custom_fields");

    setSalvando(true);
    try {
      await apiClient.post("/api/v1/leads/merge", {
        primary_lead_id: principal.id,
        secondary_lead_ids: grupo.filter((lead) => lead.id !== principal.id).map((lead) => lead.id),
        fields: {
          title: titulo.title,
          description: descricao.description,
          contact_id: contato.contact_id,
          value_cents: valor.value_cents,
          currency: valor.currency ?? "BRL",
          owner_user_id: responsavel.owner_user_id,
          owner_agent_id: responsavel.owner_agent_id,
          expected_close_date: fechamento.expected_close_date,
          tags: etiquetas.tags,
          source: source.source,
          source_metadata: source.source_metadata,
          custom_fields: personalizados.custom_fields,
        },
      });
      toast.success(grupo.length + " cards foram mesclados em um único lead.");
      await qc.invalidateQueries({ queryKey: ["board", pipelineId] });
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mesclar os cards.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-6xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle>Localizar e unir duplicatas</DialogTitle>
              <DialogDescription className="mt-1">
                Selecione a origem de cada dado. O card principal permanece e os demais serão excluídos após a transferência do histórico.
              </DialogDescription>
            </div>
            {grupos.length > 0 && (
              <p className="shrink-0 text-sm font-medium text-muted-foreground">
                {grupoIndex + 1} de {grupos.length}
              </p>
            )}
          </div>
        </DialogHeader>

        {grupos.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">Nenhuma duplicata encontrada neste funil.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A análise considera o telefone do contato e telefones preservados nos cards importados.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <div
              className="grid min-w-[880px]"
              style={{ gridTemplateColumns: "minmax(140px, .8fr) repeat(" + grupo.length + ", minmax(190px, 1fr)) minmax(220px, 1.15fr)" }}
            >
              <div className="border-b bg-muted/30 p-3 text-xs font-semibold text-muted-foreground">
                Comparar campos
              </div>
              {grupo.map((lead) => (
                <div key={lead.id} className="border-b border-l bg-muted/30 p-3">
                  <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      name={"principal-" + grupoKey}
                      checked={principalEfetivo === lead.id}
                      onChange={() => escolherPrincipal(lead.id)}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="min-w-0 break-words">{lead.title || "Sem nome"}</span>
                  </label>
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    {telefoneDoLead(lead) || "Sem telefone"}
                  </p>
                  <button
                    type="button"
                    className="mt-3 text-xs font-medium text-primary hover:underline"
                    onClick={() => selecionarTodosDoCard(lead.id)}
                  >
                    Manter tudo deste card
                  </button>
                </div>
              ))}
              <div className="border-b border-l bg-primary/5 p-3 text-xs font-semibold text-primary">
                Resultado final
              </div>

              {CAMPOS.flatMap((campo) => {
                const fonte = grupo.find((lead) => lead.id === fontes[campo.key]) ?? principal;
                return [
                  <div key={campo.key + "-label"} className="border-b bg-muted/20 p-3 text-xs font-semibold">
                    {campo.label}
                  </div>,
                  ...grupo.map((lead) => (
                    <label key={campo.key + "-" + lead.id} className="flex min-w-0 cursor-pointer items-start gap-2 border-b border-l p-3 text-sm hover:bg-muted/40">
                      <input
                        type="radio"
                        name={"campo-" + campo.key + "-" + grupoKey}
                        checked={fonte?.id === lead.id}
                        onChange={() => escolherFonte(campo.key, lead.id)}
                        className="mt-0.5 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 break-words">{resumo(campo.key, lead)}</span>
                    </label>
                  )),
                  <div key={campo.key + "-result"} className="min-w-0 border-b border-l bg-primary/5 p-3 text-sm">
                    <p className="break-words font-medium">{resumo(campo.key, fonte ?? principal)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Mantido deste card
                    </p>
                  </div>,
                ];
              })}
            </div>
          </div>
        )}

        {grupo.length > 1 && (
          <label className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-destructive"
              checked={confirmado}
              onChange={(event) => setConfirmadoPara(event.target.checked ? grupoKey : "")}
            />
            <span>
              Confirmo que os {grupo.length - 1} cards secundários podem ser excluídos permanentemente depois que seus dados e históricos forem transferidos.
            </span>
          </label>
        )}

        <DialogFooter className="flex-wrap justify-between gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <div className="flex flex-wrap gap-2">
            {grupos.length > 0 && (
              <Button variant="outline" onClick={pularDuplicata} disabled={salvando}>
                Pular esta duplicata
              </Button>
            )}
            <Button
              onClick={() => void mesclar()}
              disabled={salvando || grupo.length < 2 || !principalEfetivo || !confirmado}
            >
              {salvando ? "Unindo..." : "Unir esta duplicata"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
