import type { Metadata } from "next";

import { CalendarClient } from "./_components/CalendarClient";

export const metadata: Metadata = {
  title: "Calendar | CRM",
  description: "Agendas da equipe, agendamentos, histórico e sincronização com o Google Calendar.",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ tab?: string; google?: string }> }) {
  const query = await searchParams;
  const defaultTab = ["agenda", "history", "types", "integrations"].includes(query.tab ?? "") ? query.tab! : "agenda";
  return (
    <div className="px-3 py-4 sm:px-5 lg:px-7">
      <CalendarClient defaultTab={defaultTab} googleResult={query.google ?? null} />
    </div>
  );
}
