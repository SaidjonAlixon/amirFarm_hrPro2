/**
 * Savdo plan — filial oylik plani, xodimlar kunlik savdosi, bajarish % va komissiya.
 * «F4 sentabr plan.xlsx» shablonidagi formulalar:
 *  - kunlik plan = oylik plan / oy kunlari
 *  - kunlik jami = xodimlar savdosi yig‘indisi, farq = jami − kunlik plan
 *  - kumulyativ, bajarish % = kumulyativ / oylik plan
 *  - komissiya % = pog‘ona jadvalidan (VLOOKUP taxminiy) — oylik (kumulyativ) % bo‘yicha
 *  - xodim daromadi = xodimning oylik savdosi × oy oxiridagi komissiya %
 */

export type CommissionTier = { from: number; pct: number };

export const DEFAULT_TIERS: CommissionTier[] = [
  { from: 0, pct: 0.003 },
  { from: 0.85, pct: 0.007 },
  { from: 0.9, pct: 0.009 },
  { from: 1, pct: 0.011 },
  { from: 1.3, pct: 0.015 },
];

export type SalesEntry = { employeeId: number; date: string; amount: number };
export type SheetEmployee = { id: number; fullName: string; orgRole: string | null };

export type SheetDay = {
  date: string;
  day: number;
  byEmployee: Record<number, number>;
  total: number;
  hasData: boolean;
  dailyPlan: number;
  diff: number;
  dayPct: number;
  cumulative: number;
  monthPct: number;
  commissionPct: number;
  isToday: boolean;
  isFuture: boolean;
};

export type SheetEmployeeSummary = SheetEmployee & {
  total: number;
  sharePct: number;
  daysWorked: number;
  todayAmount: number;
  commissionPct: number;
  income: number;
  projectedIncome: number;
};

export type SheetSummary = {
  month: string;
  daysInMonth: number;
  plan: number;
  dailyPlan: number;
  done: number;
  pct: number;
  remaining: number;
  todayDate: string | null;
  todayTotal: number;
  todayPct: number;
  /** Prognoz qaysi kun uchun: bugun (hali kiritilmagan) yoki ertaga */
  forecastFor: "today" | "tomorrow" | null;
  forecastDate: string | null;
  daysLeft: number;
  neededPerDay: number | null;
  daysElapsed: number;
  avgDaily: number;
  projected: number;
  projectedPct: number;
  commissionPct: number;
  projectedCommissionPct: number;
  nextTier: { from: number; pct: number; needAmount: number } | null;
  status: "past" | "current" | "future";
};

export type SalesSheet = {
  summary: SheetSummary;
  days: SheetDay[];
  employees: SheetEmployeeSummary[];
  tiers: CommissionTier[];
};

export function normalizeTiers(raw: unknown): CommissionTier[] {
  if (!Array.isArray(raw)) return DEFAULT_TIERS.map((t) => ({ ...t }));
  const out: CommissionTier[] = [];
  for (const item of raw) {
    const from = Number((item as { from?: unknown })?.from);
    const pct = Number((item as { pct?: unknown })?.pct);
    if (!Number.isFinite(from) || !Number.isFinite(pct) || from < 0 || pct < 0 || pct > 1) continue;
    out.push({ from: round4(from), pct: round6(pct) });
  }
  out.sort((a, b) => a.from - b.from);
  const uniq = out.filter((t, i) => i === 0 || t.from !== out[i - 1]!.from);
  if (!uniq.length) return DEFAULT_TIERS.map((t) => ({ ...t }));
  if (uniq[0]!.from > 0) uniq.unshift({ from: 0, pct: 0 });
  return uniq;
}

/** Excel VLOOKUP(…, TRUE) — eng katta «from» ≤ pct */
export function commissionFor(pct: number, tiers: CommissionTier[]): number {
  let out = 0;
  for (const t of tiers) {
    if (pct + 1e-9 >= t.from) out = t.pct;
    else break;
  }
  return out;
}

export function nextTierFor(pct: number, tiers: CommissionTier[]): CommissionTier | null {
  return tiers.find((t) => t.from > pct + 1e-9) ?? null;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

export function isMonthKey(raw: unknown): raw is string {
  return typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10_000) / 10_000;
}
function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function buildSalesSheet(input: {
  month: string;
  plan: number;
  tiers: CommissionTier[];
  todayYmd: string;
  employees: SheetEmployee[];
  entries: SalesEntry[];
}): SalesSheet {
  const { month, tiers, todayYmd } = input;
  const plan = Math.max(0, Number(input.plan) || 0);
  const n = daysInMonth(month);
  const dailyPlan = plan / n;
  const currentMonth = todayYmd.slice(0, 7);
  const status: SheetSummary["status"] = month < currentMonth ? "past" : month > currentMonth ? "future" : "current";

  const byDay = new Map<string, Map<number, number>>();
  for (const e of input.entries) {
    if (!e.date.startsWith(month)) continue;
    const amount = Number(e.amount) || 0;
    const m = byDay.get(e.date) ?? new Map<number, number>();
    m.set(e.employeeId, (m.get(e.employeeId) ?? 0) + amount);
    byDay.set(e.date, m);
  }

  const days: SheetDay[] = [];
  let cumulative = 0;
  for (let d = 1; d <= n; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const m = byDay.get(date);
    const byEmployee: Record<number, number> = {};
    let total = 0;
    if (m) {
      for (const [id, amount] of m) {
        byEmployee[id] = round2(amount);
        total += amount;
      }
    }
    cumulative += total;
    const monthPct = plan > 0 ? cumulative / plan : 0;
    days.push({
      date,
      day: d,
      byEmployee,
      total: round2(total),
      hasData: Boolean(m && m.size),
      dailyPlan: round2(dailyPlan),
      diff: round2(total - dailyPlan),
      dayPct: dailyPlan > 0 ? round4(total / dailyPlan) : 0,
      cumulative: round2(cumulative),
      monthPct: round4(monthPct),
      commissionPct: commissionFor(monthPct, tiers),
      isToday: date === todayYmd,
      isFuture: date > todayYmd,
    });
  }

  const done = cumulative;
  const pct = plan > 0 ? done / plan : 0;
  const remaining = Math.max(0, plan - done);

  const todayIdx = status === "current" ? Number(todayYmd.slice(8, 10)) : status === "past" ? n : 0;
  const today = status === "current" ? days[todayIdx - 1]! : null;
  const todayTotal = today?.total ?? 0;
  /** Bugun savdo kiritilgan bo‘lsa — bugun ham o‘tgan kun hisoblanadi */
  const daysElapsed = status === "past" ? n : status === "current" ? todayIdx - (today?.hasData ? 0 : 1) : 0;
  const avgDaily = daysElapsed > 0 ? done / daysElapsed : 0;
  const projected = status === "past" ? done : status === "current" ? avgDaily * n : 0;
  const projectedPct = plan > 0 ? projected / plan : 0;

  let forecastFor: SheetSummary["forecastFor"] = null;
  let forecastDate: string | null = null;
  let daysLeft = 0;
  if (status === "current") {
    daysLeft = n - daysElapsed;
    if (daysLeft > 0) {
      forecastFor = today?.hasData ? "tomorrow" : "today";
      forecastDate = days[daysElapsed]!.date;
    }
  } else if (status === "future") {
    daysLeft = n;
    forecastFor = null;
  }
  const neededPerDay =
    status === "future"
      ? round2(dailyPlan)
      : daysLeft > 0
        ? round2(remaining / daysLeft)
        : null;

  const commissionPct = commissionFor(pct, tiers);
  const projectedCommissionPct = commissionFor(projectedPct, tiers);
  const next = nextTierFor(pct, tiers);

  const totals = new Map<number, { total: number; days: number; today: number }>();
  for (const day of days) {
    for (const [idRaw, amount] of Object.entries(day.byEmployee)) {
      const id = Number(idRaw);
      const t = totals.get(id) ?? { total: 0, days: 0, today: 0 };
      t.total += amount;
      if (amount > 0) t.days += 1;
      if (day.isToday) t.today += amount;
      totals.set(id, t);
    }
  }
  const projectFactor = status === "current" && daysElapsed > 0 ? n / daysElapsed : 1;
  const employees: SheetEmployeeSummary[] = input.employees.map((e) => {
    const t = totals.get(e.id) ?? { total: 0, days: 0, today: 0 };
    return {
      ...e,
      total: round2(t.total),
      sharePct: done > 0 ? round4(t.total / done) : 0,
      daysWorked: t.days,
      todayAmount: round2(t.today),
      commissionPct,
      income: round2(t.total * commissionPct),
      projectedIncome: round2(t.total * projectFactor * projectedCommissionPct),
    };
  });

  return {
    summary: {
      month,
      daysInMonth: n,
      plan: round2(plan),
      dailyPlan: round2(dailyPlan),
      done: round2(done),
      pct: round4(pct),
      remaining: round2(remaining),
      todayDate: today?.date ?? null,
      todayTotal: round2(todayTotal),
      todayPct: dailyPlan > 0 ? round4(todayTotal / dailyPlan) : 0,
      forecastFor,
      forecastDate,
      daysLeft,
      neededPerDay,
      daysElapsed,
      avgDaily: round2(avgDaily),
      projected: round2(projected),
      projectedPct: round4(projectedPct),
      commissionPct,
      projectedCommissionPct,
      nextTier: next ? { ...next, needAmount: round2(Math.max(0, next.from * plan - done)) } : null,
      status,
    },
    days,
    employees,
    tiers,
  };
}
