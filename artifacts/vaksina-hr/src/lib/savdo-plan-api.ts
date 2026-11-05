export type CommissionTier = { from: number; pct: number };

export type SalesSummary = {
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
  timePct: number;
  paceGap: number;
  daysWithData: number;
  daysAbovePlan: number;
  bestDay: { date: string; total: number } | null;
  status: "past" | "current" | "future";
};

export type SalesDay = {
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

export type SalesEmployee = {
  id: number;
  fullName: string;
  orgRole: string | null;
  total: number;
  sharePct: number;
  daysWorked: number;
  avgPerDay: number;
  bestDay: { date: string; amount: number } | null;
  rank: number;
  todayAmount: number;
  commissionPct: number;
  income: number;
  projectedIncome: number;
};

export type SavdoContext = {
  today: string;
  month: string;
  isAdmin: boolean;
  employeeId: number | null;
  managerOf: number | null;
  defaultBranchId: number | null;
  branches: Array<{ id: number; name: string; managerName: string }>;
};

export type StaffShift = {
  key: string;
  label: string;
  start: string;
  end: string;
  overnight: boolean;
  restToday: string | null;
};

export type SavdoSheet = {
  branch: { id: number; name: string; managerName: string };
  fullView: boolean;
  isAdmin: boolean;
  viewerEmployeeId: number | null;
  today: string;
  editAnyDate: boolean;
  editableDates: string[] | null;
  editableEmployeeIds: number[];
  planUpdatedBy: string | null;
  planUpdatedAt: string | null;
  shifts: Record<number, StaffShift>;
  sellersCount: number;
  summary: SalesSummary;
  days: SalesDay[];
  employees: SalesEmployee[];
  tiers: CommissionTier[];
};

export type SavdoOverviewRow = SalesSummary & {
  branchId: number;
  name: string;
  managerName: string;
  sellers: number;
  lastEntryDate: string | null;
};

export type SavdoTopEmployee = {
  rank: number;
  employeeId: number;
  fullName: string;
  orgRole: string | null;
  branchId: number;
  branchName: string;
  branches: number;
  total: number;
  days: number;
  avgPerDay: number;
  today: number;
  income: number;
};

export type SavdoOverview = {
  month: string;
  today: string;
  daysInMonth: number;
  tiers: CommissionTier[];
  rows: SavdoOverviewRow[];
  topEmployees: SavdoTopEmployee[];
  totals: {
    plan: number;
    done: number;
    pct: number;
    todayTotal: number;
    dailyPlan: number;
    projected: number;
    projectedPct: number;
    neededPerDay: number;
  };
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error || `So‘rov bajarilmadi (kod ${res.status})`);
  return body as T;
}

export function fetchSavdoContext(month: string) {
  return apiJson<SavdoContext>(`/savdo-plan/context?month=${month}`);
}

export function fetchSavdoSheet(branchId: number, month: string) {
  return apiJson<SavdoSheet>(`/savdo-plan/sheet?branchId=${branchId}&month=${month}`);
}

export function fetchSavdoOverview(month: string) {
  return apiJson<SavdoOverview>(`/savdo-plan/overview?month=${month}`);
}

export function saveSavdoEntries(body: { branchId: number; date: string; items: Array<{ employeeId: number; amount: number }> }) {
  return apiJson<{ ok: boolean; saved: number }>("/savdo-plan/entries", { method: "PUT", body: JSON.stringify(body) });
}

export function saveSavdoEntriesBulk(body: {
  branchId: number;
  items: Array<{ employeeId: number; date: string; amount: number }>;
}) {
  return apiJson<{ ok: boolean; saved: number }>("/savdo-plan/entries/bulk", { method: "PUT", body: JSON.stringify(body) });
}

export function saveSavdoPlan(body: { branchId: number; month: string; amount: number }) {
  return apiJson<{ ok: boolean }>("/savdo-plan/plan", { method: "PUT", body: JSON.stringify(body) });
}

export function saveSavdoTiers(body: { month: string; tiers: CommissionTier[] }) {
  return apiJson<{ ok: boolean; tiers: CommissionTier[] }>("/savdo-plan/tiers", { method: "PUT", body: JSON.stringify(body) });
}

export async function downloadSavdoExcel(branchId: number, month: string, branchName: string) {
  const res = await fetch(`/api/savdo-plan/export?branchId=${branchId}&month=${month}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Excel yuklanmadi");
  }
  const blob = await res.blob();
  const { deliverFile } = await import("./tg-download");
  await deliverFile(blob, `savdo-plan_${branchName.replace(/[^\p{L}\p{N}]+/gu, "_")}_${month}.xlsx`);
}

export function currentMonthKey(today = new Date()): string {
  return today.toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTHS_UZ = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_UZ[(m ?? 1) - 1]} ${y}`;
}

export function dayLabel(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d}-${MONTHS_UZ[(m ?? 1) - 1]!.toLowerCase()}`;
}

const WEEKDAYS_UZ = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

export function weekdayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return WEEKDAYS_UZ[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

/** «5-noyabr, payshanba» */
export function dayWithWeekday(ymd: string): string {
  return `${dayLabel(ymd)}, ${weekdayLabel(ymd)}`;
}

export function pctText(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits).replace(/\.0+$/, "")}%`;
}
