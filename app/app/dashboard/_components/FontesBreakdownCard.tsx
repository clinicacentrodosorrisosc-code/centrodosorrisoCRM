"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCentsBRL } from "@/lib/money";
import {
  Compass,
  Radio,
  Share2,
  TrendingUp,
} from "lucide-react";
import type { FonteBreakdownItem } from "@/app/api/v1/dashboard/overview/route";

interface Props {
  fontes: FonteBreakdownItem[];
}

function getFonteIcon(fonte: string) {
  const f = fonte.toLowerCase();
  if (f.includes("whats") || f.includes("waha")) return "💬";
  if (f.includes("insta") || f.includes("ig")) return "📸";
  if (f.includes("face") || f.includes("fb")) return "👤";
  if (f.includes("google") || f.includes("gads")) return "🔍";
  if (f.includes("indica")) return "🤝";
  if (f.includes("site") || f.includes("landing")) return "🌐";
  if (f.includes("balc") || f.includes("passante")) return "🏬";
  return "📍";
}

export function FontesBreakdownCard({ fontes }: Props) {
  const topList = fontes.slice(0, 6);
  const totalLeads = fontes.reduce((acc, f) => acc + f.count, 0);
  const totalWon = fontes.reduce((acc, f) => acc + f.won_count, 0);
  const maxCount = Math.max(1, ...fontes.map((f) => f.count));

  // Melhor canal por taxa de conversão (com pelo menos 1 lead)
  const bestConverting = [...fontes]
    .filter((f) => f.count >= 1 && f.won_count > 0)
    .sort((a, b) => b.conversion_rate - a.conversion_rate)[0];

  return (
    <Card className="flex flex-col justify-between border border-border/80 shadow-xs">
      <div>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Compass className="h-4 w-4 text-purple-500" />
              Fontes &amp; Origens de Captação
            </CardTitle>
            <CardDescription className="text-xs">
              Origem dos pacientes, volume de leads e taxa de conversão por canal
            </CardDescription>
          </div>
          {topList.length > 0 && (
            <Badge variant="secondary" className="text-[11px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300">
              {totalLeads} {totalLeads === 1 ? "lead total" : "leads totais"}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="flex flex-col gap-3.5 pt-1">
          {topList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Radio className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-medium text-muted-foreground">
                Nenhuma fonte de captação registrada no período.
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                Os canais de entrada (WhatsApp, Instagram, Tráfego Pago, etc.) serão analisados aqui.
              </p>
            </div>
          ) : (
            topList.map((fonte) => {
              const pct = Math.round((fonte.count / maxCount) * 100);
              const icon = getFonteIcon(fonte.fonte);

              return (
                <div key={fonte.fonte} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-foreground truncate max-w-[190px] sm:max-w-[240px]">
                      <span className="text-sm">{icon}</span>
                      <span className="truncate" title={fonte.fonte}>
                        {fonte.fonte}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {fonte.count} {fonte.count === 1 ? "lead" : "leads"}
                      </span>
                      {fonte.won_count > 0 && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          ({fonte.won_count} {fonte.won_count === 1 ? "ganho" : "ganhos"})
                        </span>
                      )}
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 h-4 font-bold ${
                          fonte.conversion_rate >= 20
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : fonte.conversion_rate > 0
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {fonte.conversion_rate}% conv.
                      </Badge>
                    </div>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/80">
                    <div
                      className="h-full rounded-full bg-purple-500 transition-all duration-300"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </div>

      {topList.length > 0 && (
        <div className="border-t p-3 bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            {bestConverting ? "Canal com melhor conversão" : "Conversão geral de canais"}
          </span>
          <span className="font-semibold text-foreground truncate max-w-[200px]">
            {bestConverting
              ? `${bestConverting.fonte} (${bestConverting.conversion_rate}%)`
              : `${totalWon > 0 ? Math.round((totalWon / Math.max(1, totalLeads)) * 100) : 0}% taxa média`}
          </span>
        </div>
      )}
    </Card>
  );
}
