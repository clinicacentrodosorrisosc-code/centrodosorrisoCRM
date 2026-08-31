"use client";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateLead } from "@/hooks/kanban/useCreateLead";
import { useContactList } from "@/hooks/contacts/useContactList";
import { useCreateContact } from "@/hooks/contacts/useCreateContact";
import type { Stage } from "@/lib/kanban/types";
import type { Contact } from "@/lib/types/contacts";
import { createLeadSchema, type CreateLeadInput } from "@/lib/schemas/leads";
import { parseReaisToCents } from "@/lib/money";
import { useCadastros } from "@/hooks/settings/useCadastros";
import { EcoDoValor } from "./EcoDoValor";
import {
  Users,
  UserCircle,
  Plus,
  Check,
  MagnifyingGlass,
  Phone,
  WhatsappLogo,
  X,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface FormShape {
  title: string;
  description: string;
  source: string;
  procedimento: string;
  stage_id: string;
  valueReais: string;
  tagsRaw: string;
  expected_close_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipelineId: string;
  stages: Stage[];
  /** Vincula o lead criado a este contato de origem (ex.: painel do Inbox). */
  contactId?: string | null;
  /** Título inicial sugerido para o lead (ex.: nome do contato na conversa). */
  initialTitle?: string;
  initialContact?: Contact | null;
}

function defaultStageId(stages: Stage[]): string {
  const open = stages.find((s) => !s.is_won && !s.is_lost && !s.is_archived);
  return open?.id ?? stages[0]?.id ?? "";
}

export function NewLeadDialog({
  open,
  onOpenChange,
  pipelineId,
  stages,
  contactId,
  initialTitle,
  initialContact,
}: Props) {
  const create = useCreateLead(pipelineId);
  const createContact = useCreateContact();
  const { procedimentos: listaProcedimentos, fontes: listaFontes } = useCadastros();
  const initialStage = useMemo(() => defaultStageId(stages), [stages]);

  // Contato selecionado
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);

  // Busca de contatos existentes
  const { data: contactsData, isLoading: isLoadingContacts } = useContactList({
    search: contactSearch.trim() || undefined,
  });

  const contactsList = useMemo(() => {
    return contactsData?.pages.flatMap((page) => page.data) ?? [];
  }, [contactsData]);

  const form = useForm<FormShape>({
    defaultValues: {
      title: initialTitle ?? "",
      description: "",
      source: "WhatsApp",
      procedimento: "",
      stage_id: initialStage,
      valueReais: "",
      tagsRaw: "",
      expected_close_date: "",
    },
  });

  // Reset stage_id default if stages change while dialog mounted.
  useEffect(() => {
    if (!form.getValues("stage_id") && initialStage) {
      form.setValue("stage_id", initialStage);
    }
  }, [initialStage, form]);

  // Reseta os estados somente quando o diálogo ou seus valores iniciais mudam.
  // contactsList não pode ser dependência aqui: durante a busca, a query
  // troca a lista temporariamente e este efeito limparia contactSearch.
  useEffect(() => {
    if (open) {
      setContactSearch("");
      setIsCreatingContact(false);
      setNewContactName("");
      setNewContactPhone("");
      setContactError(null);

      const resolvedTitle = (initialTitle ?? "").trim() || (initialContact?.name ?? "");

      form.reset({
        title: resolvedTitle,
        description: "",
        source: "WhatsApp",
        procedimento: "",
        stage_id: initialStage,
        valueReais: "",
        tagsRaw: "",
        expected_close_date: "",
      });

      if (contactId && initialContact) {
        setSelectedContact(initialContact);
        if (!resolvedTitle && initialContact.name) {
          form.setValue("title", initialContact.name);
        }
      } else {
        setSelectedContact(null);
      }
    }
  }, [open, contactId, initialTitle, initialContact, initialStage, form]);

  // Quando o chamador fornece apenas contactId, completa a seleção depois que
  // a consulta de contatos retorna. Separar este efeito evita resetar a busca.
  useEffect(() => {
    if (!open || !contactId || initialContact || selectedContact) return;
    const found = contactsList.find((c) => c.id === contactId);
    if (found) {
      setSelectedContact(found);
      if (!form.getValues("title").trim() && found.name) {
        form.setValue("title", found.name);
      }
    }
  }, [open, contactId, initialContact, selectedContact, contactsList, form]);

  // Criação rápida de contato inline
  async function handleCreateNewContact() {
    if (!newContactName.trim()) {
      setContactError("O nome do contato é obrigatório.");
      return;
    }
    if (!newContactPhone.trim()) {
      setContactError("O telefone / WhatsApp do contato é obrigatório.");
      return;
    }

    try {
      const res = await createContact.mutateAsync({
        name: newContactName.trim(),
        phone_number: newContactPhone.trim(),
        source: form.getValues("source") || "manual",
      });

      const contact = res?.data?.contact;
      if (contact) {
        setSelectedContact(contact);
        setIsCreatingContact(false);
        setContactError(null);
        toast.success(`Contato "${contact.name}" cadastrado!`);

        // Auto-preenche título se estiver vazio
        if (!form.getValues("title").trim()) {
          form.setValue("title", contact.name || "Novo Lead");
        }
      }
    } catch {
      setContactError("Erro ao criar contato. Verifique os dados.");
    }
  }

  function handleSelectExistingContact(contact: Contact) {
    setSelectedContact(contact);
    setContactSearch("");
    setContactError(null);

    // Auto-preenche o título se estiver vazio
    if (!form.getValues("title").trim()) {
      const proc = form.getValues("procedimento").trim();
      const titleText = proc ? `${contact.name ?? "Lead"} - ${proc}` : (contact.name ?? "Novo Lead");
      form.setValue("title", titleText);
    }
  }

  async function onSubmit(values: FormShape) {
    const finalContactId = contactId ?? selectedContact?.id;

    if (!finalContactId) {
      setContactError("É obrigatório vincular um contato ao lead.");
      return;
    }

    const tags = values.tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const reais = values.valueReais.trim();
    let valueCents: number | null = null;
    if (reais.length > 0) {
      valueCents = parseReaisToCents(reais);
      if (valueCents === null) {
        form.setError("valueReais", { message: "Valor inválido" });
        return;
      }
    }

    const payload: Record<string, unknown> = {
      pipeline_id: pipelineId,
      stage_id: values.stage_id,
      title: values.title.trim(),
      contact_id: finalContactId,
      currency: "BRL",
      source: values.source.trim() || "WhatsApp",
      custom_fields: values.procedimento.trim() ? { procedimento: values.procedimento.trim() } : {},
      tags,
    };
    if (values.description.trim()) payload.description = values.description.trim();
    if (valueCents !== null) payload.value_cents = valueCents;
    if (values.expected_close_date) payload.expected_close_date = values.expected_close_date;

    const parsed = createLeadSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "Dados inválidos");
      return;
    }

    try {
      await create.mutateAsync(parsed.data as CreateLeadInput);
      toast.success("Lead criado com sucesso");
      form.reset({
        title: "",
        description: "",
        source: "WhatsApp",
        procedimento: "",
        stage_id: initialStage,
        valueReais: "",
        tagsRaw: "",
        expected_close_date: "",
      });
      setSelectedContact(null);
      onOpenChange(false);
    } catch {
      // toast already shown
    }
  }

  const stageId = form.watch("stage_id");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
          <DialogDescription>
            Cadastre uma oportunidade de venda atrelada a um contato específico.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* ========================================================= */}
          {/* SELEÇÃO OU CADASTRO DE CONTATO (OBRIGATÓRIO)             */}
          {/* ========================================================= */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <Users size={15} />
                Contato / Paciente <span className="text-destructive">*</span>
              </Label>
              {!contactId && selectedContact && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedContact(null)}
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Trocar contato
                </Button>
              )}
            </div>

            {/* Caso 1: Contato já selecionado */}
            {selectedContact ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs">
                    <Check size={14} weight="bold" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">
                      {selectedContact.name ?? "Contato sem nome"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      <Phone size={10} />
                      {selectedContact.phone_number ?? "Sem telefone"}
                    </p>
                  </div>
                </div>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  Vinculado
                </span>
              </div>
            ) : isCreatingContact ? (
              /* Caso 2: Formulário rápido de criação de novo contato */
              <div className="space-y-2.5 rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Plus size={12} /> Novo Contato
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreatingContact(false)}
                    className="h-5 w-5 p-0 text-muted-foreground"
                  >
                    <X size={12} />
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Input
                    placeholder="Nome completo do paciente *"
                    className="h-8 text-xs"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Input
                    placeholder="WhatsApp / Telefone (ex: 47999998888) *"
                    className="h-8 text-xs"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setIsCreatingContact(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={createContact.isPending}
                    onClick={handleCreateNewContact}
                  >
                    {createContact.isPending ? "Salvando..." : "Salvar e Vincular"}
                  </Button>
                </div>
              </div>
            ) : (
              /* Caso 3: Campo de busca de contato existente com sugestões */
              <div className="space-y-2">
                <div className="relative">
                  <MagnifyingGlass
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    placeholder="Buscar contato por nome ou telefone..."
                    className="h-8 pl-8 text-xs bg-background"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                  />
                </div>

                {/* Lista de resultados rápidos */}
                <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-background divide-y">
                  {isLoadingContacts ? (
                    <div className="p-2 text-center text-xs text-muted-foreground">
                      Buscando contatos...
                    </div>
                  ) : contactsList.length === 0 ? (
                    <div className="p-2.5 text-center text-xs text-muted-foreground">
                      Nenhum contato encontrado.
                    </div>
                  ) : (
                    contactsList.slice(0, 6).map((ct) => (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => handleSelectExistingContact(ct)}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {ct.name ?? "Sem nome"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {ct.phone_number ?? "Sem telefone"}
                          </p>
                        </div>
                        <span className="text-[10px] font-medium text-primary hover:underline">
                          Selecionar
                        </span>
                      </button>
                    ))
                  )}
                </div>

                {/* Botão para criar novo contato se não encontrar */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsCreatingContact(true);
                    setNewContactName(contactSearch);
                  }}
                  className="w-full h-8 text-xs gap-1.5 border-dashed"
                >
                  <Plus size={13} />
                  Cadastrar Novo Contato
                </Button>
              </div>
            )}

            {contactError && (
              <p className="text-xs font-semibold text-destructive mt-1">
                ⚠️ {contactError}
              </p>
            )}
          </div>

          {/* ========================================================= */}
          {/* DEMAIS CAMPOS DO LEAD                                     */}
          {/* ========================================================= */}
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs font-semibold">
              Título do Lead <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              className="h-8 text-xs"
              placeholder="Ex: Consulta Dra. Ana / Avaliação Alinhador"
              {...form.register("title", { required: true, minLength: 2 })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="source" className="text-xs font-semibold">
                Fonte (Origem)
              </Label>
              <Input
                id="source"
                list="new-lead-fontes"
                className="h-8 text-xs"
                placeholder="Ex: WhatsApp, Instagram..."
                {...form.register("source")}
              />
              <datalist id="new-lead-fontes">
                {listaFontes.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="procedimento" className="text-xs font-semibold">
                Procedimento
              </Label>
              <Input
                id="procedimento"
                list="new-lead-procedimentos"
                className="h-8 text-xs"
                placeholder="Ex: Clareamento, Alinhador..."
                {...form.register("procedimento")}
              />
              <datalist id="new-lead-procedimentos">
                {listaProcedimentos.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Etapa do Funil <span className="text-destructive">*</span>
            </Label>
            <Select
              value={stageId}
              onValueChange={(v) => form.setValue("stage_id", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages
                  .filter((s) => !s.is_archived)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valueReais" className="text-xs font-semibold">
                Valor Estimado (R$)
              </Label>
              <Input
                id="valueReais"
                inputMode="decimal"
                placeholder="0,00"
                className="h-8 text-xs font-semibold tabular-nums"
                {...form.register("valueReais")}
              />
              <EcoDoValor control={form.control} />
              {form.formState.errors.valueReais && (
                <p className="text-xs text-error-fg">
                  {form.formState.errors.valueReais.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expected_close_date" className="text-xs font-semibold">
                Fechamento previsto
              </Label>
              <Input
                id="expected_close_date"
                type="date"
                className="h-8 text-xs"
                {...form.register("expected_close_date")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-semibold">
              Descrição / Observações
            </Label>
            <Textarea
              id="description"
              rows={2}
              className="text-xs"
              placeholder="Contexto, observações, links…"
              {...form.register("description")}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
              className="h-8 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || !stageId || (!selectedContact && !contactId)}
              className="h-8 text-xs"
            >
              {create.isPending ? "Criando…" : "Criar Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
