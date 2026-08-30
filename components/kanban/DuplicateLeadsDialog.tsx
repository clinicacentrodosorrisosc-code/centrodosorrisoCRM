"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { encontrarGruposDuplicados } from "@/lib/leads/duplicates";
import type { Lead } from "@/lib/types/leads";

type Campo = {
  key: "title" | "description" | "contact" | "value" | "owner" |
    "expected_close_date" | "tags" | "source" | "custom_fields";
  label: string;
};

const CAMPOS: Campo[] = [
  { key: "title", label: "Nome do card" },
  { key: "description", label: "Descrição" },
  { key: "contact", label: "Contato" },
  { key: "value", label: "Valor" },
  { key: "owner", label: "Responsável" },
  { key: "expected_close_date", label: "Previsão de fechamento" },
  { key: "tags", label: "Etiquetas" },
  { key: "source", label: "Origem" },
  { key: "custom_fields", label: "Campos personalizados" },
];

function resumo(campo: Campo["key"], lead: Lead): string {
  if (campo === "title") return lead.title;
  if (campo === "description") return lead.description || "Sem descrição";
  if (campo === "contact") return lead.contact_id ? `Contato ${lead.contact_id.slice(0, 8)}…` : "Sem contato";
  if (campo === "value") return lead.value_cents == null ? "Sem valor" :
    (lead.value_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: lead.currency ?? "BRL" });
  if (campo === "owner") return lead.owner_agent?.name ?? lead.owner_user_id?.slice(0, 8) ?? "Sem responsável";
  if (campo === "expected_close_date") return lead.expected_close_date ?? "Sem data";
  if (campo === "tags") return lead.tags.length ? lead.tags.join(", ") : "Sem etiquetas";
  if (campo === "source") return lead.source || "Sem origem";
  return Object.keys(lead.custom_fields ?? {}).length
    ? `${Object.keys(lead.custom_fields).length} campo(s)` : "Sem campos personalizados";
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

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setConfirmadoPara("");
    onOpenChange(nextOpen);
  }

  function escolherPrincipal(leadId: string) {
    setPrincipalId(leadId);
    setFontes(Object.fromEntries(CAMPOS.map((campo) => [campo.key, leadId])));
    setConfirmadoPara("");
  }

  async function mesclar() {
    const principal = grupo.find((lead) => lead.id === principalEfetivo);
    if (!principal || grupo.length < 2) return;
    const origem = (key: Campo["key"]) => grupo.find((lead) => lead.id === fontes[key]) ?? principal;
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
      toast.success(`${grupo.length} cards foram mesclados em um único lead.`);
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
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Encontrar e mesclar duplicatas</DialogTitle>
          <DialogDescription>
            Escolha o card principal e a origem de cada dado. Os demais cards serão excluídos permanentemente após a transferência do histórico.
          </DialogDescription>
        </DialogHeader>

        {grupos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma duplicata encontrada neste funil.</p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[220px_1fr]">
            <div className="space-y-2 overflow-y-auto border-r pr-3">
              {grupos.map((item, index) => (
                <button key={item[0]!.id} type="button" onClick={() => setGrupoIndex(index)}
                  className={`w-full rounded-md border p-3 text-left text-sm ${index === grupoIndex ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                  <span className="block font-medium">{item[0]!.title}</span>
                  <span className="text-xs text-muted-foreground">{item.length} cards</span>
                </button>
              ))}
            </div>

            <div className="space-y-4 overflow-y-auto pr-1">
              <div>
                <p className="mb-2 text-sm font-medium">Card principal</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {grupo.map((lead) => (
                    <label key={lead.id} className="flex cursor-pointer gap-2 rounded-md border p-3 text-sm">
                      <input type="radio" name="principal" checked={principalEfetivo === lead.id}
                        onChange={() => escolherPrincipal(lead.id)} />
                      <span><strong>{lead.title}</strong><small className="block text-muted-foreground">Criado em {new Date(lead.created_at).toLocaleDateString("pt-BR")}</small></span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Dados que serão mantidos</p>
                {CAMPOS.map((campo) => (
                  <label key={campo.key} className="grid items-center gap-2 rounded-md border p-3 text-sm sm:grid-cols-[180px_1fr]">
                    <span className="font-medium">{campo.label}</span>
                    <select className="h-9 rounded-md border bg-background px-2"
                      value={grupo.some((lead) => lead.id === fontes[campo.key])
                        ? fontes[campo.key]
                        : principalEfetivo}
                      onChange={(event) => setFontes((atual) => ({ ...atual, [campo.key]: event.target.value }))}>
                      {grupo.map((lead) => <option key={lead.id} value={lead.id}>{resumo(campo.key, lead)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
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
              Confirmo que os {grupo.length - 1} cards secundários podem ser excluídos
              permanentemente depois que seus dados e históricos forem transferidos.
            </span>
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="destructive" onClick={() => void mesclar()}
            disabled={salvando || grupo.length < 2 || !principalEfetivo || !confirmado}>
            {salvando ? "Mesclando…" : `Mesclar e excluir ${Math.max(0, grupo.length - 1)} secundário(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
