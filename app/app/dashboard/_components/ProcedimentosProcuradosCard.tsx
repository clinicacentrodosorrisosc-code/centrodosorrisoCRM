"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCentsBRL } from "@/lib/money";
import { Search, Sparkles } from "lucide-react";
import type { ProcedimentoProcuradoItem } from "@/app/api/v1/dashboard/overview/route";

interface Props {
  procedimentos: ProcedimentoProcuradoItem[];
}

export function ProcedimentosProcuradosCard({ procedimentos }: Props) {
  const topList = procedimentos.slice(0, 6);
  const totalLeads = procedimentos.reduce((acc, p) => acc + p.count, 0);

  return (
    <Card className="flex flex-col justify-between border border-border/80 shadow-xs">
      <div>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Search className="h-4 w-4 text-sky-500" />
              Procedimentos Procurados
            </CardTitle>
            <CardDescription className="text-xs">
              Interesse e demanda espontânea de procedimentos nos leads captados
            </CardDescription>
          </div>
          {topList.length > 0 && (
            <Badge variant="secondary" className="text-[11px] font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300">
              {totalLeads} {totalLeads === 1 ? "interessado" : "interessados"}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="flex flex-col gap-3.5 pt-1">
          {topList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-medium text-muted-foreground">
                Nenhum procedimento procurado registrado no período.
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                Os procedimentos vinculados aos novos leads e orçamentos aparecerão aqui.
              </p>
            </div>
          ) : (
            topList.map((proc, index) => {
              return (
                <div key={proc.procedimento} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-foreground truncate max-w-[200px] sm:max-w-[260px]">
                      <span className="text-[11px] font-bold text-muted-foreground/80 w-4">
                        #{index + 1}
                      </span>
                      <span className="truncate" title={proc.procedimento}>
                        {proc.procedimento}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {proc.count} {proc.count === 1 ? "lead" : "leads"}
                      </span>
                      {proc.total_value_cents > 0 && (
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                          ({formatCentsBRL(proc.total_value_cents)})
                        </span>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {proc.percent_of_total}%
                      </Badge>
                    </div>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/80">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all duration-300"
                      style={{ width: `${Math.max(4, proc.percent_of_total)}%` }}
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
          <span>Top demanda da clínica</span>
          <span className="font-semibold text-foreground truncate max-w-[200px]">
            {topList[0]?.procedimento} ({topList[0]?.percent_of_total}%)
          </span>
        </div>
      )}
    </Card>
  );
}
