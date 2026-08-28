"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { UploadSimple } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";

type Row = { title: string; description: string | null; external_id: string | null; value_cents: number | null; source_metadata: Record<string, string> };
type Named = { id: string; name: string };

function rowsFromMatrix(matrix: unknown[][]): Row[] {
  const [header, ...data] = matrix;
  if (!header?.length) return [];
  const headers = header.map((cell) => String(cell ?? "").trim().toLowerCase());
  return data.filter((values) => values.some((value) => String(value ?? "").trim() !== "")).map((values) => {
    const record = Object.fromEntries(headers.map((key, index) => [key, String(values[index] ?? "").trim()]));
    const numericValue = Number(String(record.value ?? "").replace(/\./g, "").replace(",", "."));
    return { title: record.title || record.name || record.lead || "Lead Kommo", description: record.description || null, external_id: record.id || record.external_id || null, value_cents: Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue * 100) : null, source_metadata: record };
  });
}

async function parseFile(file: File): Promise<Row[]> {
  const workbook = XLSX.read(await (file.name.toLowerCase().endsWith(".csv") ? file.text() : file.arrayBuffer()), { type: file.name.toLowerCase().endsWith(".csv") ? "string" : "array", raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  return firstSheet ? rowsFromMatrix(XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "" })) : [];
}

export function ImportLeadsClient() {
  const [pipelines, setPipelines] = useState<Named[]>([]), [stages, setStages] = useState<Named[]>([]), [pipelineId, setPipelineId] = useState(""), [stageId, setStageId] = useState(""), [leads, setLeads] = useState<Row[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/v1/pipelines").then((r) => r.json()).then((r) => setPipelines(r.data?.pipelines ?? r.data ?? [])); }, []);
  useEffect(() => { if (pipelineId) fetch(`/api/v1/pipelines/${pipelineId}/stages`).then((r) => r.json()).then((r) => setStages(r.data?.stages ?? r.data ?? [])); }, [pipelineId]);
  async function submit() { setBusy(true); try { const r = await apiClient.post<{ imported: number; skipped: number }>("/api/v1/leads/import", { pipeline_id: pipelineId, stage_id: stageId, leads }); setMessage(`${r.imported} lead(s) importado(s); ${r.skipped} duplicado(s) ignorado(s).`); setLeads([]); } catch (e) { setMessage(e instanceof Error ? e.message : "Falha na importação."); } finally { setBusy(false); } }
  return <main className="mx-auto max-w-4xl space-y-6 p-6"><div><h1 className="text-2xl font-semibold">Importar leads</h1><p className="mt-1 text-sm text-muted-foreground">Selecione um arquivo CSV ou Excel e defina o funil e a etapa de destino.</p></div><Card className="space-y-5 p-6"><div><Label>Arquivo de leads</Label><label className="mt-2 flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-5 text-sm"><UploadSimple size={24}/><span>{leads.length ? `${leads.length} lead(s) preparado(s)` : "Selecionar CSV ou Excel (.xlsx/.xls)"}</span><input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={e => { const file = e.currentTarget.files?.[0]; if (!file) return; void parseFile(file).then(setLeads).catch(() => setMessage("Não foi possível ler o arquivo. Verifique o formato e tente novamente.")); }}/></label></div><div className="grid gap-4 md:grid-cols-2"><div><Label>Funil de destino</Label><Select value={pipelineId} onValueChange={v=>{setPipelineId(v);setStageId("")}}><SelectTrigger className="mt-2"><SelectValue placeholder="Selecione o funil"/></SelectTrigger><SelectContent>{pipelines.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Etapa de destino</Label><Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}><SelectTrigger className="mt-2"><SelectValue placeholder="Selecione a etapa"/></SelectTrigger><SelectContent>{stages.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div></div><Button disabled={!leads.length||!stageId||busy} onClick={submit}>{busy?"Importando…":`Importar ${leads.length||"leads"}`}</Button>{message&&<p role="status" className="text-sm">{message}</p>}</Card></main>;
}