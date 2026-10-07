/** 0 — Asosiy ofis filiali. Qolganlari №12 ko‘rinishida. */
export function filialNumberLabel(no: number | null | undefined): string | null {
  if (no == null || !Number.isFinite(Number(no))) return null;
  if (Number(no) === 0) return "Asosiy ofis";
  return `№${Number(no)}`;
}

export function isMainOfficeBranchNo(no: number | null | undefined): boolean {
  return no != null && Number(no) === 0;
}
