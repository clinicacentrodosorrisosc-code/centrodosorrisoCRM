"use client";

import { useMemo, useState } from "react";
import { addMinutes, format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarEvent, CalendarEventType, CalendarMember } from "@/lib/calendar/types";

interface LeadOption { id: string; title: string; contact_id: string | null }
interface ContactOption { id: string; name: string | null; display_name: string | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent | null;
  initialDate: Date;
  eventTypes: CalendarEventType[];
  members: CalendarMember[];
  leads: LeadOption[];
  contacts: ContactOption[];
  currentUserId: string;
  onSaved: () => Promise<void>;
}

function localInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function EventDialog(props: Props) {
  const { open, event, initialDate, eventTypes, members, leads, contacts, currentUserId } = props;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => {
    const start = event ? new Date(event.starts_at) : initialDate;
    const end = event ? new Date(event.ends_at) : addMinutes(initialDate, 30);
    return {
      title: event?.title ?? "", description: event?.description ?? "",
      starts_at: localInputValue(start), ends_at: localInputValue(end),
      event_type_id: event?.event_type_id ?? "", assigned_user_id: event?.assigned_user_id ?? currentUserId,
      lead_id: event?.lead_id ?? "", contact_id: event?.contact_id ?? "",
      location_type: event?.location_type ?? "in_person", location_value: event?.location_value ?? "",
    };
  });

  const linkedContact = useMemo(
    () => leads.find((lead) => lead.id === form.lead_id)?.contact_id ?? "",
    [form.lead_id, leads],
  );

  function setField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function chooseType(id: string) {
    const type = eventTypes.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      event_type_id: id,
      title: current.title || type?.name || "",
      location_type: type?.location_type ?? current.location_type,
      location_value: type?.location_value ?? current.location_value,
      ends_at: type ? localInputValue(addMinutes(new Date(current.starts_at), type.duration_minutes)) : current.ends_at,
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(event ? `/api/v1/calendar/${event.id}` : "/api/v1/calendar", {
        method: event ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
          event_type_id: form.event_type_id || null,
          assigned_user_id: form.assigned_user_id || null,
          lead_id: form.lead_id || null,
          contact_id: form.contact_id || linkedContact || null,
          location_value: form.location_value || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Não foi possível salvar.");
      await props.onSaved();
      props.onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelEvent() {
    if (!event) return;
    setSaving(true);
    const response = await fetch(`/api/v1/calendar/${event.id}`, { method: "DELETE" });
    if (response.ok) {
      await props.onSaved();
      props.onOpenChange(false);
    } else {
      const json = await response.json();
      setError(json.error?.message ?? "Não foi possível cancelar.");
    }
    setSaving(false);
  }

  const fieldClass = "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{event ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
          <DialogDescription>Defina o que vai acontecer, com quem e em qual agenda.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 px-6 py-1 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="calendar-title">Título</Label>
            <Input id="calendar-title" value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Ex.: Consulta de avaliação" autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-type">Categoria</Label>
            <select id="calendar-type" className={`${fieldClass} w-full`} value={form.event_type_id} onChange={(e) => chooseType(e.target.value)}>
              <option value="">Sem categoria</option>
              {eventTypes.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.duration_minutes} min</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-member">Agenda de</Label>
            <select id="calendar-member" className={`${fieldClass} w-full`} value={form.assigned_user_id} onChange={(e) => setField("assigned_user_id", e.target.value)}>
              <option value="">Sem responsável</option>
              {members.filter((item) => item.is_bookable).map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name || "Membro da equipe"}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-start">Início</Label>
            <Input id="calendar-start" type="datetime-local" value={form.starts_at} onChange={(e) => setField("starts_at", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-end">Término</Label>
            <Input id="calendar-end" type="datetime-local" value={form.ends_at} onChange={(e) => setField("ends_at", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-lead">Lead</Label>
            <select id="calendar-lead" className={`${fieldClass} w-full`} value={form.lead_id} onChange={(e) => setField("lead_id", e.target.value)}>
              <option value="">Nenhum lead</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.title}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-contact">Contato</Label>
            <select id="calendar-contact" className={`${fieldClass} w-full`} value={form.contact_id || linkedContact} onChange={(e) => setField("contact_id", e.target.value)}>
              <option value="">Nenhum contato</option>
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.display_name || contact.name || "Contato"}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-location-type">Formato</Label>
            <select id="calendar-location-type" className={`${fieldClass} w-full`} value={form.location_type} onChange={(e) => setField("location_type", e.target.value)}>
              <option value="in_person">Presencial</option><option value="phone">Telefone</option><option value="video">Videochamada</option><option value="other">Outro</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-location">Local ou link</Label>
            <Input id="calendar-location" value={form.location_value} onChange={(e) => setField("location_value", e.target.value)} placeholder="Sala, endereço ou URL" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="calendar-description">Observações</Label>
            <Textarea id="calendar-description" value={form.description} onChange={(e) => setField("description", e.target.value)} rows={3} />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          {event && event.status !== "cancelled" ? <Button type="button" variant="destructive" onClick={cancelEvent} disabled={saving} className="sm:mr-auto">Cancelar agendamento</Button> : null}
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>Fechar</Button>
          <Button type="button" onClick={save} disabled={saving || !form.title || !form.starts_at || !form.ends_at}>{saving ? "Salvando…" : "Salvar agendamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
