import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);

  const orgName = activeOrg?.name || "Sua organizacao";

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        O dashboard de {orgName} esta sendo reconstruido.
      </p>
    </div>
  );
}
