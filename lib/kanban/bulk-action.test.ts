import { describe, expect, it } from "vitest";
import { LEADS_PER_BULK_REQUEST, splitLeadIdsIntoBatches } from "./bulk-action";

describe("splitLeadIdsIntoBatches", () => {
  it("keeps a selection of up to 50 cards in one request", () => {
    const ids = Array.from({ length: LEADS_PER_BULK_REQUEST }, (_, index) => index);

    expect(splitLeadIdsIntoBatches(ids)).toEqual([ids]);
  });

  it("splits a complete selection into batches of at most 50 cards", () => {
    const ids = Array.from({ length: 121 }, (_, index) => index);

    expect(splitLeadIdsIntoBatches(ids).map((batch) => batch.length)).toEqual([50, 50, 21]);
    expect(splitLeadIdsIntoBatches(ids).flat()).toEqual(ids);
  });
});