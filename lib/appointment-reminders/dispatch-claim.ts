/**
 * Reserva at?mica do disparo de lembrete.
 *
 * Consultar o log e s? grav?-lo depois do envio deixa uma corrida entre dois
 * ticks: ambos leem "n?o enviado", ambos mandam a mensagem e s? ent?o um deles
 * descobre a chave ?nica. A reserva ? feita ANTES do transporte; quem perde a
 * chave ?nica n?o pode enviar uma segunda vez.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReminderDispatchKey {
  organizationId: string;
  leadId: string;
  configId: string;
  appointmentDate: string;
  offsetHours: number;
}

/** `true` s? para a execu??o que ganhou o direito de enviar. */
export async function claimReminderDispatch(
  admin: SupabaseClient,
  key: ReminderDispatchKey,
): Promise<boolean> {
  const { error } = await admin.from("pipeline_reminder_sent_log").insert({
    organization_id: key.organizationId,
    lead_id: key.leadId,
    config_id: key.configId,
    agendamento_data: key.appointmentDate,
    offset_hours: key.offsetHours,
  });

  // A chave ?nica (lead + config + data + offset) ? a trava entre crons e
  // disparos imediatos concorrentes. N?o ? erro operacional: outro tick ganhou.
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`reminder_dispatch_claim_failed:${error.code ?? "unknown"}`);
}

/** Libera a reserva somente quando todos os transportes falharam. */
export async function releaseReminderDispatch(
  admin: SupabaseClient,
  key: ReminderDispatchKey,
): Promise<void> {
  const { error } = await admin
    .from("pipeline_reminder_sent_log")
    .delete()
    .eq("organization_id", key.organizationId)
    .eq("lead_id", key.leadId)
    .eq("config_id", key.configId)
    .eq("agendamento_data", key.appointmentDate)
    .eq("offset_hours", key.offsetHours);

  if (error) {
    throw new Error(`reminder_dispatch_release_failed:${error.code ?? "unknown"}`);
  }
}
