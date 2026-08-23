"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCentsBRL } from "@/lib/money";
import { CheckCircle2, DollarSign } from "lucide-react";
import type { ProcedimentoFechadoItem } from "@/app/api/v1/dashboard/overview/route";

interface Props {
  procedimentos: ProcedimentoFechadoItem[];
}

export function ProcedimentosFechadosCard({ procedimentos }: Props) {
  const topList = procedimentos.slice(0, 6);
  const totalFechadosCount = procedimentos.reduce((acc, p) => acc + p.count, 0);
  const totalFechadoValue = procedimentos.reduce((acc, p) => acc + p.total_value_cents, 0);
  const totalRecebidoValue = procedimentos.reduce((acc, p) => acc + p.total_received_cents, 0);
  const maxVal = Math.max(1, ...procedimentos.map((p) => p.total_value_cents));

  return (
    <Card className="flex flex-col justify-between border border-border/80 shadow-xs">
      <div>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Procedimentos Fechados &amp; Faturados
            </CardTitle>
            <CardDescription className="text-xs">
              Tratamentos contratados em orçamentos aprovados e receita por procedimento
            </CardDescription>
          </div>
          {topList.length > 0 && (
            <Badge variant="secondary" className="text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              {totalFechadosCount} {totalFechadosCount === 1 ? "fechamento" : "fechamentos"}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="flex flex-col gap-3.5 pt-1">
          {topList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <DollarSign className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-medium text-muted-foreground">
                Nenhum procedimento aprovado no período.
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                Assim que um orçamento for aprovado ou um lead for ganho, os procedimentos fechados aparecerão aqui.
              </p>
            </div>
          ) : (
            topList.map((proc, index) => {
              const pct = Math.round((proc.total_value_cents / maxVal) * 100);
              return (
                <div key={proc.procedimento} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-foreground truncate max-w-[190px] sm:max-w-[240px]">
                      <span className="text-[11px] font-bold text-muted-foreground/80 w-4">
                        #{index + 1}
                      </span>
                      <span className="truncate" title={proc.procedimento}>
                        {proc.procedimento}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-[11px]">
                        {proc.count} {proc.count === 1 ? "unid" : "unids"}
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCentsBRL(proc.total_value_cents)}
                      </span>
                      {proc.total_received_cents > 0 && (
                        <span className="text-[10px] text-muted-foreground hidden sm:inline" title="Valor já pago">
                          ({formatCentsBRL(proc.total_received_cents)} recebido)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/80">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
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
          <span>Total faturado em tratamentos</span>
          <div className="flex items-center gap-2 font-bold text-foreground">
            <span>{formatCentsBRL(totalFechadoValue)}</span>
            {totalRecebidoValue > 0 && (
              <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                · {formatCentsBRL(totalRecebidoValue)} em caixa
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
