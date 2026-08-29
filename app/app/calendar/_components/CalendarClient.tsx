"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CalendarEvent, CalendarEventType, CalendarMember } from "@/lib/calendar/types";
import { ArrowsClockwise, CalendarBlank, CaretLeft, CaretRight, ClockCounterClockwise, Plus, Sliders } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { EventDialog } from "./EventDialog";

interface LeadOption { id: string; title: string; contact_id: string | null }
interface ContactOption { id: string; name: string | null; display_name: string | null }
interface Connection { id: string; user_id: string; provider_email: string | null; status: string; last_synced_at: string | null; last_error_code: string | null }
interface HistoryEntry { id: string; event_id: string; action: string; actor_type: string; reason: string | null; after_state: Record<string, unknown> | null; created_at: string }

function memberName(member: CalendarMember | undefined): string {
  return member?.full_name || "Sem responsável";
}

function formatPeriod(anchor: Date, view: "month" | "week"): string {
  if (view === "month") return format(anchor, "MMMM 'de' yyyy", { locale: ptBR });
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = endOfWeek(anchor, { weekStartsOn: 1 });
  return `${format(start, "d MMM", { locale: ptBR })} – ${format(end, "d MMM yyyy", { locale: ptBR })}`;
}

export function CalendarClient({ defaultTab = "agenda", googleResult = null }: { defaultTab?: string; googleResult?: string | null }) {
  const [tab, setTab] = useState(defaultTab);
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<CalendarEventType[]>([]);
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const range = useMemo(() => {
    if (view === "month") {
      return {
        from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
        to: addDays(endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }), 1),
      };
    }
    return { from: startOfWeek(anchor, { weekStartsOn: 1 }), to: addDays(endOfWeek(anchor, { weekStartsOn: 1 }), 1) };
  }, [anchor, view]);

  const loadContext = useCallback(async () => {
    const [contextRes, typesRes] = await Promise.all([
      fetch("/api/v1/calendar/context"),
      fetch("/api/v1/calendar/event-types"),
    ]);
    const contextJson = await contextRes.json();
    const typesJson = await typesRes.json();
    if (!contextRes.ok) throw new Error(contextJson.error?.message ?? "Não foi possível carregar as agendas.");
    setMembers(contextJson.data.members ?? []);
    setLeads(contextJson.data.leads ?? []);
    setContacts(contextJson.data.contacts ?? []);
    setConnections(contextJson.data.connections ?? []);
    setCurrentUserId(contextJson.data.current_user_id ?? "");
    if (typesRes.ok) setEventTypes(typesJson.data.event_types ?? []);
  }, []);

  const loadEvents = useCallback(async () => {
    const query = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
    if (memberFilter !== "all") query.set("assigned_user_id", memberFilter);
    if (typeFilter !== "all") query.set("event_type_id", typeFilter);
    const response = await fetch(`/api/v1/calendar?${query}`);
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message ?? "Não foi possível carregar o Calendar.");
    setEvents(json.data.events ?? []);
  }, [range, memberFilter, typeFilter]);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/v1/calendar/history?limit=150");
    const json = await response.json();
    if (response.ok) setHistory(json.data.history ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadContext(), loadEvents(), loadHistory()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar o Calendar.");
    } finally {
      setLoading(false);
    }
  }, [loadContext, loadEvents, loadHistory]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all([loadContext(), loadEvents(), loadHistory()])
        .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Não foi possível carregar o Calendar."); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [loadContext, loadEvents, loadHistory]);

  const days = useMemo(() => eachDayOfInterval({ start: range.from, end: addDays(range.to, -1) }), [range]);
  const memberMap = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const typeMap = useMemo(() => new Map(eventTypes.map((item) => [item.id, item])), [eventTypes]);

  function openNew(date = new Date()) {
    const selected = new Date(date);
    if (selected.getHours() === 0 && selected.getMinutes() === 0) selected.setHours(9, 0, 0, 0);
    setSelectedDate(selected);
    setSelectedEvent(null);
    setDialogOpen(true);
  }

  function openEvent(event: CalendarEvent) {
    setSelectedEvent(event);
    setSelectedDate(new Date(event.starts_at));
    setDialogOpen(true);
  }

  function navigate(direction: -1 | 1) {
    setAnchor((current) => view === "month" ? (direction < 0 ? subMonths(current, 1) : addMonths(current, 1)) : (direction < 0 ? subWeeks(current, 1) : addWeeks(current, 1)));
  }

  const fieldClass = "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  const actionLabels: Record<string, string> = { created: "criou", updated: "alterou", cancelled: "cancelou", completed: "concluiu", synced: "sincronizou", sync_failed: "teve falha ao sincronizar", imported: "importou do Google" };

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarBlank size={23} className="text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Agendas da equipe, leads e compromissos externos em uma visão única.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><ArrowsClockwise size={15} className={cn("mr-1.5", loading && "animate-spin")} />Atualizar</Button>
          <Button size="sm" onClick={() => openNew()}><Plus size={15} className="mr-1.5" />Novo agendamento</Button>
        </div>
      </div>

      {googleResult === "connected" ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Conta Google conectada. A primeira sincronização foi iniciada.</div> : null}
      {googleResult === "error" ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">A conexão com o Google não foi concluída. Confira as credenciais OAuth e tente novamente.</div> : null}

      {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-fit bg-muted/70">
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="types">Categorias</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="mt-3">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Hoje</Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Período anterior" onClick={() => navigate(-1)}><CaretLeft size={17} /></Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Próximo período" onClick={() => navigate(1)}><CaretRight size={17} /></Button>
                <h2 className="ml-2 min-w-[190px] text-sm font-semibold capitalize sm:text-base">{formatPeriod(anchor, view)}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Sliders size={16} className="text-muted-foreground" />
                <select aria-label="Filtrar por pessoa" className={fieldClass} value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
                  <option value="all">Todas as pessoas</option>
                  {members.map((member) => <option key={member.user_id} value={member.user_id}>{memberName(member)}</option>)}
                </select>
                <select aria-label="Filtrar por categoria" className={fieldClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">Todas as categorias</option>
                  {eventTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
                <div className="flex rounded-md border bg-background p-0.5">
                  <button type="button" onClick={() => setView("month")} className={cn("rounded px-3 py-1.5 text-xs font-medium", view === "month" ? "bg-muted text-foreground" : "text-muted-foreground")}>Mês</button>
                  <button type="button" onClick={() => setView("week")} className={cn("rounded px-3 py-1.5 text-xs font-medium", view === "week" ? "bg-muted text-foreground" : "text-muted-foreground")}>Semana</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b bg-muted/10 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <div key={day} className="py-2">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayEvents = events.filter((event) => isSameDay(new Date(event.starts_at), day));
                return (
                  <div key={day.toISOString()} className={cn("group min-h-[118px] border-b border-r p-1.5 transition-colors hover:bg-muted/20", view === "week" && "min-h-[460px]", !isSameMonth(day, anchor) && view === "month" && "bg-muted/15 text-muted-foreground")} onDoubleClick={() => openNew(day)}>
                    <div className="mb-1 flex items-center justify-between">
                      <button type="button" onClick={() => openNew(day)} className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium hover:bg-muted", isToday(day) && "bg-foreground text-background hover:bg-foreground")}>{format(day, "d")}</button>
                      <button type="button" aria-label={`Novo agendamento em ${format(day, "dd/MM")}`} className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus:opacity-100" onClick={() => openNew(day)}><Plus size={13} /></button>
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map((event) => {
                        const member = event.assigned_user_id ? memberMap.get(event.assigned_user_id) : undefined;
                        const type = event.event_type_id ? typeMap.get(event.event_type_id) : undefined;
                        const color = event.color_hex || member?.color_hex || type?.color_hex || "#64748B";
                        return (
                          <button key={event.id} type="button" onClick={() => openEvent(event)} className={cn("w-full rounded-md border bg-background px-2 py-1.5 text-left shadow-sm transition hover:-translate-y-px hover:shadow", event.status === "cancelled" && "opacity-50 line-through")} style={{ borderLeft: `3px solid ${color}` }}>
                            <span className="block truncate text-[11px] font-semibold">{format(new Date(event.starts_at), "HH:mm")} · {event.title}</span>
                            {view === "week" ? <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{memberName(member)}{type ? ` · ${type.name}` : ""}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t bg-muted/10 px-4 py-3">
              {members.map((member) => <button type="button" key={member.user_id} onClick={() => setMemberFilter(member.user_id)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: member.color_hex }} />{memberName(member)}</button>)}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4"><h2 className="font-semibold">Histórico de agendamentos</h2><p className="text-sm text-muted-foreground">Criações, mudanças, cancelamentos e sincronizações em ordem cronológica.</p></div>
            <div className="divide-y">
              {history.length === 0 ? <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</div> : history.map((entry) => (
                <div key={entry.id} className="flex gap-3 px-5 py-3.5">
                  <div className="mt-0.5 rounded-full bg-muted p-2"><ClockCounterClockwise size={15} /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm"><span className="font-medium">{entry.actor_type === "google" ? "Google Calendar" : entry.actor_type === "agent" ? "Agente" : "Equipe"}</span> {actionLabels[entry.action] ?? entry.action} <span className="font-medium">{String(entry.after_state?.title ?? "um agendamento")}</span></p>{entry.reason ? <p className="text-xs text-muted-foreground">{entry.reason}</p> : null}</div>
                  <time className="whitespace-nowrap text-xs text-muted-foreground">{format(new Date(entry.created_at), "dd/MM/yyyy HH:mm")}</time>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="types" className="mt-3"><EventTypesPanel eventTypes={eventTypes} onSaved={refresh} /></TabsContent>
        <TabsContent value="integrations" className="mt-3"><IntegrationsPanel connections={connections} members={members} currentUserId={currentUserId} onRefresh={refresh} /></TabsContent>
      </Tabs>

      <EventDialog key={dialogOpen ? `${selectedEvent?.id ?? "new"}-${selectedDate.toISOString()}` : "closed"} open={dialogOpen} onOpenChange={setDialogOpen} event={selectedEvent} initialDate={selectedDate} eventTypes={eventTypes} members={members} leads={leads} contacts={contacts} currentUserId={currentUserId} onSaved={refresh} />
    </div>
  );
}

function EventTypesPanel({ eventTypes, onSaved }: { eventTypes: CalendarEventType[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", duration: "30", color: "#2563EB", location: "in_person" });
  const [saving, setSaving] = useState(false);
  async function createType() {
    setSaving(true);
    const slug = form.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const response = await fetch("/api/v1/calendar/event-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, slug, duration_minutes: Number(form.duration), color_hex: form.color, location_type: form.location }) });
    if (response.ok) { setForm({ name: "", duration: "30", color: "#2563EB", location: "in_person" }); await onSaved(); }
    setSaving(false);
  }
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="font-semibold">Categorias de agendamento</h2><p className="text-sm text-muted-foreground">Crie categorias para qualquer operação sem prender o Calendar a um nicho.</p></div><div className="divide-y">{eventTypes.length === 0 ? <p className="px-5 py-8 text-sm text-muted-foreground">Crie a primeira categoria ao lado.</p> : eventTypes.map((type) => <div key={type.id} className="flex items-center gap-3 px-5 py-4"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: type.color_hex }} /><div className="flex-1"><p className="text-sm font-medium">{type.name}</p><p className="text-xs text-muted-foreground">{type.duration_minutes} min · {type.location_type === "in_person" ? "Presencial" : type.location_type === "phone" ? "Telefone" : type.location_type === "video" ? "Videochamada" : "Outro"}</p></div><Badge variant="secondary">{type.is_active ? "Ativa" : "Inativa"}</Badge></div>)}</div></div>
    <div className="h-fit rounded-xl border bg-card p-5"><h3 className="font-semibold">Nova categoria</h3><div className="mt-4 space-y-4"><div className="space-y-2"><Label htmlFor="type-name">Nome</Label><Input id="type-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Consulta, visita ou call" /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="type-duration">Duração</Label><Input id="type-duration" type="number" min="5" step="5" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="type-color">Cor</Label><Input id="type-color" type="color" className="p-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div></div><div className="space-y-2"><Label htmlFor="type-location">Formato padrão</Label><select id="type-location" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}><option value="in_person">Presencial</option><option value="phone">Telefone</option><option value="video">Videochamada</option><option value="other">Outro</option></select></div><Button className="w-full" disabled={!form.name || saving} onClick={createType}>{saving ? "Criando…" : "Criar categoria"}</Button></div></div>
  </div>;
}

function IntegrationsPanel({ connections, members, currentUserId, onRefresh }: { connections: Connection[]; members: CalendarMember[]; currentUserId: string; onRefresh: () => Promise<void> }) {
  async function sync(id: string) { await fetch(`/api/v1/calendar/google/sync?connection_id=${id}`, { method: "POST" }); await onRefresh(); }
  return <div className="rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="font-semibold">Google Calendar BYO</h2><p className="text-sm text-muted-foreground">Cada pessoa conecta a própria conta. Eventos entram e saem da agenda automaticamente.</p></div><div className="divide-y">{members.map((member) => { const connection = connections.find((item) => item.user_id === member.user_id); return <div key={member.user_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: member.color_hex }} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{memberName(member)}</p><p className="truncate text-xs text-muted-foreground">{connection?.provider_email || "Nenhuma conta Google conectada"}</p>{connection?.last_error_code ? <p className="mt-1 text-xs text-destructive">Falha de sincronização: {connection.last_error_code}</p> : null}</div>{connection ? <div className="flex items-center gap-2"><Badge variant={connection.status === "active" ? "secondary" : "destructive"}>{connection.status === "active" ? "Conectada" : "Atenção"}</Badge><Button variant="outline" size="sm" onClick={() => sync(connection.id)}>Sincronizar</Button></div> : member.user_id === currentUserId ? <Button variant="outline" size="sm" onClick={() => window.location.assign("/api/v1/calendar/google/connect")}>Conectar Google</Button> : <span className="text-xs text-muted-foreground">Conexão pessoal</span>}</div>; })}</div><div className="border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">A conexão exige as credenciais OAuth do próprio operador configuradas no servidor. Tokens nunca aparecem nesta tela.</div></div>;
}
