/** API limit per bulk request; the UI splits larger selections before sending. */
export const LEADS_PER_BULK_REQUEST = 50;

export function splitLeadIdsIntoBatches<T>(ids: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < ids.length; start += LEADS_PER_BULK_REQUEST) {
    batches.push(ids.slice(start, start + LEADS_PER_BULK_REQUEST));
  }
  return batches;
}