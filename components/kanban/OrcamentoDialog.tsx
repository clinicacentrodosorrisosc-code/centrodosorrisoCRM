"use client";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useBoard } from "@/hooks/kanban/useBoard";
import { useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@/lib/types/leads";
import {
  OrcamentoItem,
  PagamentoBaixa,
  OrcamentoLead,
  StatusOrcamento,
  MetodoPagamento,
  METODOS_PAGAMENTO_LABELS,
  STATUS_ORCAMENTO_LABELS,
  recalcularOrcamento,
} from "@/lib/types/orcamento";
import { parseReaisToCents } from "@/lib/money";
import { PROCEDIMENTOS_SUGERIDOS } from "./LeadFieldsForm";
import {
  Plus,
  Trash,
  CheckCircle,
  Receipt,
  CurrencyDollar,
  CreditCard,
  QrCode,
  Money,
  Check,
} from "@/lib/ui/icons";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  pipelineId: string;
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents || 0) / 100);
}

function centsToReais(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function OrcamentoDialog({ open, onOpenChange, lead, pipelineId }: Props) {
  const edit = useEditLead(pipelineId);
  const move = useMoveCard(pipelineId);
  const { data: boardData } = useBoard(pipelineId);
  const qc = useQueryClient();

  // Carrega orçamento existente ou inicializa padrão
  const customFields = (lead.custom_fields ?? {}) as Record<string, unknown>;
  const rawOrcamento = customFields.orcamento as OrcamentoLead | undefined;

  const [activeTab, setActiveTab] = useState<"itens" | "pagamentos">("itens");

  // Itens
  const [itens, setItens] = useState<OrcamentoItem[]>(() => {
    if (rawOrcamento?.itens && rawOrcamento.itens.length > 0) {
      return rawOrcamento.itens;
    }
    // Se não há orçamento, cria 1 item inicial com o valor do lead se houver
    const procInicial = String(customFields.procedimento ?? customFields.procedure ?? "Procedimento Odontológico");
    const val = lead.value_cents ?? 0;
    return [
      {
        id: "item_1",
        descricao: procInicial,
        quantidade: 1,
        valor_unitario_cents: val,
        valor_total_cents: val,
      },
    ];
  });

  // Pagamentos
  const [pagamentos, setPagamentos] = useState<PagamentoBaixa[]>(
    () => rawOrcamento?.pagamentos ?? [],
  );

  // Status e Desconto
  const [status, setStatus] = useState<StatusOrcamento>(
    () => rawOrcamento?.status ?? "rascunho",
  );
  const [descontoReais, setDescontoReais] = useState<string>(() =>
    centsToReais(rawOrcamento?.desconto_cents ?? 0),
  );
  const [aprovadoEm, setAprovadoEm] = useState<string | undefined>(
    () => rawOrcamento?.aprovado_em,
  );
  const [observacoes, setObservacoes] = useState<string>(
    () => rawOrcamento?.observacoes ?? "",
  );

  // Nova Baixa Form
  const [novoValorBaixa, setNovoValorBaixa] = useState("");
  const [novoMetodoBaixa, setNovoMetodoBaixa] = useState<MetodoPagamento>("pix");
  const [novaDataBaixa, setNovaDataBaixa] = useState(
    () => new Date().toISOString().split("T")[0]!,
  );
  const [novaObsBaixa, setNovaObsBaixa] = useState("");

  // Cálculos dinâmicos
  const descontoCents = parseReaisToCents(descontoReais) ?? 0;
  const orcamentoCalculado = recalcularOrcamento(
    itens,
    pagamentos,
    status,
    descontoCents,
    aprovadoEm,
    observacoes,
  );

  const percentualPago =
    orcamentoCalculado.total_cents > 0
      ? Math.min(
          100,
          Math.round(
            (orcamentoCalculado.total_pago_cents / orcamentoCalculado.total_cents) * 100,
          ),
        )
      : 0;

  // Adicionar Item
  const handleAddItem = () => {
    const novo: OrcamentoItem = {
      id: `item_${Date.now()}`,
      descricao: "",
      quantidade: 1,
      valor_unitario_cents: 0,
      valor_total_cents: 0,
    };
    setItens([...itens, novo]);
  };

  // Alterar Item
  const handleUpdateItem = (
    id: string,
    field: "descricao" | "quantidade" | "valorReais",
    value: string | number,
  ) => {
    setItens((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        let qtd = item.quantidade;
        let unitCents = item.valor_unitario_cents;

        if (field === "descricao") {
          return { ...item, descricao: String(value) };
        }
        if (field === "quantidade") {
          qtd = Math.max(1, Number(value) || 1);
        }
        if (field === "valorReais") {
          unitCents = parseReaisToCents(String(value)) ?? 0;
        }

        return {
          ...item,
          quantidade: qtd,
          valor_unitario_cents: unitCents,
          valor_total_cents: qtd * unitCents,
        };
      }),
    );
  };

  // Remover Item
  const handleRemoveItem = (id: string) => {
    if (itens.length <= 1) {
      toast.error("O orçamento deve conter pelo menos 1 item.");
      return;
    }
    setItens((prev) => prev.filter((i) => i.id !== id));
  };

  // Registrar Baixa Parcial
  const handleRegistrarBaixa = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseReaisToCents(novoValorBaixa);
    if (!cents || cents <= 0) {
      toast.error("Informe um valor válido para a baixa.");
      return;
    }

    if (cents > orcamentoCalculado.saldo_restante_cents) {
      toast.warning("O valor da baixa é maior que o saldo restante atual.");
    }

    const novaBaixa: PagamentoBaixa = {
      id: `pag_${Date.now()}`,
      data: novaDataBaixa,
      valor_cents: cents,
      metodo: novoMetodoBaixa,
      observacao: novaObsBaixa.trim() || undefined,
      criado_em: new Date().toISOString(),
    };

    const novosPagamentos = [novaBaixa, ...pagamentos];
    setPagamentos(novosPagamentos);
    setNovoValorBaixa("");
    setNovaObsBaixa("");

    // Se ainda estava em rascunho/enviado, aprova automaticamente ao receber pagamento
    if (status === "rascunho" || status === "enviado") {
      setStatus("aprovado");
      setAprovadoEm(new Date().toISOString());
    }

    toast.success(`Baixa de ${formatBRL(cents)} registrada!`);
  };

  // Excluir Baixa
  const handleRemoverBaixa = (id: string) => {
    setPagamentos((prev) => prev.filter((p) => p.id !== id));
    toast.info("Baixa de pagamento removida.");
  };

  // Aprovar Orçamento
  const handleAprovarOrcamento = () => {
    const agora = new Date().toISOString();
    setStatus("aprovado");
    setAprovadoEm(agora);
    toast.success("Orçamento marcado como APROVADO! 🎉");
  };

  // Salvar Orçamento no Banco
  const handleSalvar = async () => {
    const dadosFinais = recalcularOrcamento(
      itens,
      pagamentos,
      status,
      descontoCents,
      aprovadoEm,
      observacoes,
    );

    const summaryProcedimentos = dadosFinais.itens
      .filter((i) => i.descricao.trim())
      .map((i) => (i.quantidade > 1 ? `${i.quantidade}x ${i.descricao}` : i.descricao))
      .join(" + ");

    const patch = {
      value_cents: dadosFinais.total_cents,
      custom_fields: {
        ...(lead.custom_fields ?? {}),
        procedimento: summaryProcedimentos || (lead.custom_fields as Record<string, unknown> | undefined)?.procedimento || null,
        agendamento_status: "compareceu",
        orcamento: dadosFinais,
      },
    };

    try {
      await edit.mutateAsync({
        leadId: lead.id,
        patch: patch as never,
      });

      // Se a etapa atual não for Orçamento, move automaticamente para Orçamento
      const orcamentoStage = boardData?.stages?.find((s) =>
        /or[çc]amento|proposta|em\s*negocia[cç][aã]o/i.test(s.name),
      );
      if (orcamentoStage && lead.stage_id !== orcamentoStage.id) {
        await move.mutateAsync({
          leadId: lead.id,
          stageId: orcamentoStage.id,
          positionInStage: 0,
          expectedUpdatedAt: lead.updated_at,
        });
      }

      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["board", pipelineId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["pending-attendance-alerts"] });

      toast.success("Orçamento salvo, presença confirmada e lead movido para Orçamento!");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar orçamento.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 max-h-[90vh] flex flex-col">
        {/* Cabeçalho */}
        <DialogHeader className="border-b border-border bg-muted/40 p-4 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-base font-semibold text-text flex items-center gap-2">
                <Receipt className="text-primary" size={18} />
                Orçamento do Lead — {lead.title}
              </DialogTitle>
              <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                <span>Status:</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    STATUS_ORCAMENTO_LABELS[orcamentoCalculado.status].color
                  }`}
                >
                  {STATUS_ORCAMENTO_LABELS[orcamentoCalculado.status].label}
                </span>
                {orcamentoCalculado.aprovado_em && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    • Aprovado em{" "}
                    {new Date(orcamentoCalculado.aprovado_em).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            </div>

            {/* Botão de Aprovação Rápida */}
            {orcamentoCalculado.status !== "aprovado" &&
              orcamentoCalculado.status !== "quitado" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAprovarOrcamento}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1.5"
                >
                  <CheckCircle size={15} />
                  Aprovar Orçamento
                </Button>
              )}
          </div>

          {/* Cards Resumo Financeiro */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-border/60">
            <div className="rounded-lg border border-border bg-background p-2.5 text-center">
              <span className="block text-[11px] text-text-muted">Total do Orçamento</span>
              <span className="text-sm font-bold text-text tabular-nums">
                {formatBRL(orcamentoCalculado.total_cents)}
              </span>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-center">
              <span className="block text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                Total Recebido
              </span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatBRL(orcamentoCalculado.total_pago_cents)}
              </span>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-center">
              <span className="block text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                Saldo a Pagar
              </span>
              <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {formatBRL(orcamentoCalculado.saldo_restante_cents)}
              </span>
            </div>
            <div className="rounded-lg border border-border bg-background p-2.5 text-center flex flex-col justify-center">
              <div className="flex justify-between text-[11px] text-text-muted mb-1">
                <span>Progresso</span>
                <span className="font-bold text-text">{percentualPago}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all duration-300 ${
                    percentualPago === 100 ? "bg-emerald-500" : "bg-primary"
                  }`}
                  style={{ width: `${percentualPago}%` }}
                />
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Abas */}
        <div className="flex border-b border-border bg-background px-4 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("itens")}
            className={`border-b-2 px-3 py-2.5 transition-colors ${
              activeTab === "itens"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            📋 Procedimentos & Itens ({itens.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pagamentos")}
            className={`border-b-2 px-3 py-2.5 transition-colors flex items-center gap-1.5 ${
              activeTab === "pagamentos"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            💳 Baixas de Pagamento ({pagamentos.length})
            {orcamentoCalculado.total_pago_cents > 0 && (
              <span className="rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 text-[10px] font-bold">
                {formatBRL(orcamentoCalculado.total_pago_cents)}
              </span>
            )}
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "itens" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-text-muted px-1">
                  <span className="col-span-6">Procedimento / Tratamento</span>
                  <span className="col-span-2 text-center">Qtd</span>
                  <span className="col-span-2 text-right">Valor Unit. (R$)</span>
                  <span className="col-span-2 text-right">Subtotal</span>
                </div>

                {itens.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 gap-2 items-center rounded-lg border border-border bg-card p-2 text-xs"
                  >
                    {/* Descrição */}
                    <div className="col-span-6">
                      <Input
                        list="procs-orcamento"
                        value={item.descricao}
                        onChange={(e) =>
                          handleUpdateItem(item.id, "descricao", e.target.value)
                        }
                        placeholder="Nome do procedimento..."
                        className="h-8 text-xs"
                      />
                      <datalist id="procs-orcamento">
                        {PROCEDIMENTOS_SUGERIDOS.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>

                    {/* Quantidade */}
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantidade}
                        onChange={(e) =>
                          handleUpdateItem(item.id, "quantidade", e.target.value)
                        }
                        className="h-8 text-xs text-center"
                      />
                    </div>

                    {/* Valor Unitário */}
                    <div className="col-span-2">
                      <Input
                        inputMode="decimal"
                        defaultValue={centsToReais(item.valor_unitario_cents)}
                        onBlur={(e) =>
                          handleUpdateItem(item.id, "valorReais", e.target.value)
                        }
                        placeholder="0,00"
                        className="h-8 text-xs text-right"
                      />
                    </div>

                    {/* Subtotal & Remover */}
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <span className="font-semibold text-text tabular-nums">
                        {formatBRL(item.valor_total_cents)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-text-muted hover:text-destructive transition-colors p-1"
                        title="Remover item"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Ação Adicionar Item */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="h-8 text-xs gap-1"
                >
                  <Plus size={14} />
                  Adicionar Procedimento
                </Button>

                {/* Desconto */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="desconto" className="text-xs text-text-muted">
                    Desconto (R$):
                  </Label>
                  <Input
                    id="desconto"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={descontoReais}
                    onChange={(e) => setDescontoReais(e.target.value)}
                    className="h-8 w-24 text-xs text-right"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "pagamentos" && (
            <div className="space-y-5">
              {/* Formulário de Registro de Nova Baixa */}
              <form
                onSubmit={handleRegistrarBaixa}
                className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-3"
              >
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text flex items-center gap-1.5">
                  <CurrencyDollar className="text-emerald-500" size={16} />
                  Registrar Nova Baixa de Pagamento
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium">Valor Recebido (R$)*</Label>
                    <Input
                      required
                      inputMode="decimal"
                      placeholder="Ex: 500,00"
                      value={novoValorBaixa}
                      onChange={(e) => setNovoValorBaixa(e.target.value)}
                      className="h-8 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium">Forma de Pagamento*</Label>
                    <Select
                      value={novoMetodoBaixa}
                      onValueChange={(v) => setNovoMetodoBaixa(v as MetodoPagamento)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(METODOS_PAGAMENTO_LABELS).map(([k, label]) => (
                          <SelectItem key={k} value={k} className="text-xs">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium">Data do Pagamento*</Label>
                    <Input
                      type="date"
                      required
                      value={novaDataBaixa}
                      onChange={(e) => setNovaDataBaixa(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                  <div className="sm:col-span-3 space-y-1">
                    <Label className="text-[11px] font-medium">Observações / Comprovante</Label>
                    <Input
                      placeholder="Ex: Entrada via Pix Bradesco, Parcela 1/3..."
                      value={novaObsBaixa}
                      onChange={(e) => setNovaObsBaixa(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1 w-full"
                  >
                    <Check size={14} />
                    Dar Baixa
                  </Button>
                </div>
              </form>

              {/* Lista de Baixas Já Realizadas */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-text">
                  Histórico de Pagamentos Recebidos ({pagamentos.length})
                </h4>

                {pagamentos.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-text-muted">
                    Nenhum pagamento registrado ainda para este lead.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pagamentos.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                            {p.metodo === "pix" ? (
                              <QrCode size={16} />
                            ) : p.metodo === "dinheiro" ? (
                              <Money size={16} />
                            ) : (
                              <CreditCard size={16} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text">
                                {METODOS_PAGAMENTO_LABELS[p.metodo]}
                              </span>
                              <span className="text-[11px] text-text-muted">
                                • {new Date(p.data).toLocaleDateString("pt-BR")}
                              </span>
                            </div>
                            {p.observacao && (
                              <p className="text-[11px] text-text-muted">{p.observacao}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-sm">
                            + {formatBRL(p.valor_cents)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoverBaixa(p.id)}
                            className="text-text-muted hover:text-destructive p-1 transition-colors"
                            title="Remover baixa"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <DialogFooter className="border-t border-border bg-background p-3 flex justify-between items-center">
          <div className="text-xs text-text-muted">
            Total Final: <strong className="text-text font-bold">{formatBRL(orcamentoCalculado.total_cents)}</strong>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs"
            >
              Fechar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSalvar}
              disabled={edit.isPending}
              className="h-8 text-xs"
            >
              {edit.isPending ? "Salvando…" : "Salvar Orçamento"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
