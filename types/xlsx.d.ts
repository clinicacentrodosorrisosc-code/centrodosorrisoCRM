declare module "xlsx" {
  const XLSX: {
    read(data: unknown, options: { type: "string" | "array"; raw?: boolean }): { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_json<T>(sheet: unknown, options: { header: 1; defval: string }): T };
  };
  export = XLSX;
}