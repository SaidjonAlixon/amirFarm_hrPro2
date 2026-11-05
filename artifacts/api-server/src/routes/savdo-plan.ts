import { Router, type IRouter, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, pool, employeesTable, employeeDayShiftPlansTable, employeeWorkSlotsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { hasFullPlatformAccess } from "../lib/roles";
import { displayBranchName } from "../lib/geo-location";
import { dedupeActiveBranches } from "../lib/branch-dedupe";
import { formatShiftKeyUz, resolveSlotsForDay, slotCoversDate, type WorkSlotRow } from "../lib/work-slots";
import { shiftWindow } from "../lib/shift-hours";
import { getEffectiveShiftDefs } from "../lib/shift-schedule";
import { encodeShiftKeys, parseShiftKeys } from "../lib/attendance-engine";
import { scheduledRestInfo } from "../lib/ofis-weekend";
import { loadWorkCalendar } from "../lib/work-calendar";
import {
  DEFAULT_TIERS,
  buildSalesSheet,
  daysInMonth,
  isMonthKey,
  normalizeTiers,
  type CommissionTier,
  type SalesEntry,
  type SalesSheet,
  type SheetEmployee,
} from "../lib/sales-plan-calc";

const router: IRouter = Router();

const PHARMACY_ORG = ["manager", "pharmacist", "intern"];
const MAX_AMOUNT = 100_000_000_000;

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
CREATE TABLE IF NOT EXISTS sales_plans (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  updated_by_id INTEGER,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_plans_branch_month_uidx ON sales_plans (branch_id, month);
CREATE TABLE IF NOT EXISTS sales_entries (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  sale_date TEXT NOT NULL,
  amount NUMERIC(16,2) NOT NULL,
  entered_by_id INTEGER,
  entered_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_entries_branch_emp_day_uidx ON sales_entries (branch_id, employee_id, sale_date);
CREATE INDEX IF NOT EXISTS sales_entries_branch_date_idx ON sales_entries (branch_id, sale_date);
CREATE INDEX IF NOT EXISTS sales_entries_emp_date_idx ON sales_entries (employee_id, sale_date);
CREATE TABLE IF NOT EXISTS sales_plan_tiers (
  month TEXT PRIMARY KEY,
  tiers JSONB NOT NULL,
  updated_by_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);
    })().catch((err: unknown) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

function todayTashkentYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
}

function monthOf(raw: unknown): string {
  return isMonthKey(raw) ? raw : todayTashkentYmd().slice(0, 7);
}

type Branch = { id: number; name: string; managerName: string; managerUserId: number | null };

async function listBranches(): Promise<Branch[]> {
  const rows = await db
    .select({
      id: employeesTable.id,
      fullName: employeesTable.fullName,
      location: employeesTable.location,
      userId: employeesTable.userId,
      employmentStatus: employeesTable.employmentStatus,
      reportsToId: employeesTable.reportsToId,
    })
    .from(employeesTable)
    .where(eq(employeesTable.orgRole, "manager"));
  return dedupeActiveBranches(rows)
    .map((b) => ({
      id: b.id,
      name: displayBranchName(b.location) || (b.location || "").split("|")[0]!.trim() || b.fullName,
      managerName: b.fullName,
      managerUserId: b.userId ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "uz", { numeric: true }));
}

type Viewer = {
  isAdmin: boolean;
  employeeId: number | null;
  fullName: string;
  /** Mudir bo‘lsa — o‘z filiali id si */
  managerOf: number | null;
  branchIds: number[];
  homeBranchId: number | null;
};

async function loadViewer(req: AuthRequest, branches: Branch[], month: string): Promise<Viewer> {
  const role = req.userRole || "";
  const [user] = await db
    .select({ fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);
  const [emp] = await db
    .select({
      id: employeesTable.id,
      orgRole: employeesTable.orgRole,
      assignedBranchId: employeesTable.assignedBranchId,
      reportsToId: employeesTable.reportsToId,
      employmentStatus: employeesTable.employmentStatus,
    })
    .from(employeesTable)
    .where(eq(employeesTable.userId, req.userId!))
    .limit(1);
  const isAdmin = hasFullPlatformAccess(role);
  const branchSet = new Set(branches.map((b) => b.id));
  if (!emp || emp.employmentStatus === "dismissed" || !PHARMACY_ORG.includes(emp.orgRole || "")) {
    return {
      isAdmin,
      employeeId: emp?.id ?? null,
      fullName: user?.fullName || "",
      managerOf: null,
      branchIds: isAdmin ? [...branchSet] : [],
      homeBranchId: null,
    };
  }

  const slots = await db
    .select()
    .from(employeeWorkSlotsTable)
    .where(and(eq(employeeWorkSlotsTable.employeeId, emp.id), eq(employeeWorkSlotsTable.active, true)));
  const managerOf = emp.orgRole === "manager" && branchSet.has(emp.id) ? emp.id : null;
  const home =
    managerOf ??
    emp.assignedBranchId ??
    emp.reportsToId ??
    slots.find((s) => !s.overrideBase && s.mode === "permanent")?.branchId ??
    null;
  const today = todayTashkentYmd();
  const ids = new Set<number>();
  if (home && branchSet.has(home)) ids.add(home);
  for (const s of slots) {
    if (branchSet.has(s.branchId) && slotCoversDate(slotRow(s), today)) ids.add(s.branchId);
  }
  await ensureSchema();
  const own = await pool.query<{ branch_id: number }>(
    `SELECT DISTINCT branch_id FROM sales_entries WHERE employee_id = $1 AND sale_date LIKE $2`,
    [emp.id, `${month}-%`],
  );
  for (const r of own.rows) if (branchSet.has(Number(r.branch_id))) ids.add(Number(r.branch_id));

  return {
    isAdmin,
    employeeId: emp.id,
    fullName: user?.fullName || "",
    managerOf,
    branchIds: isAdmin ? [...branchSet] : [...ids],
    homeBranchId: home && branchSet.has(home) ? home : [...ids][0] ?? null,
  };
}

function slotRow(s: typeof employeeWorkSlotsTable.$inferSelect): WorkSlotRow {
  return {
    id: s.id,
    employeeId: s.employeeId,
    branchId: s.branchId,
    shiftKey: (s.shiftKey as WorkSlotRow["shiftKey"]) || "one",
    mode: (s.mode as WorkSlotRow["mode"]) || "permanent",
    validFrom: s.validFrom,
    validTo: s.validTo,
    weekdays: (s.weekdays as number[] | null) || null,
    workDates: (s.workDates as string[] | null) || null,
    overrideBase: Boolean(s.overrideBase),
    active: s.active,
  };
}

function isOpenHireSlot(p: { fullName: string; userId: number | null; employmentStatus: string | null }) {
  if (/xodim kerak/i.test(p.fullName)) return true;
  return p.employmentStatus === "need_hire" && !p.userId;
}

/** Filial jamoasi: mudir + biriktirilgan farmasevt/stajyor + bugun shu filialda smenasi borlar */
async function branchStaff(branchId: number): Promise<SheetEmployee[]> {
  const today = todayTashkentYmd();
  const rows = await db
    .select({
      id: employeesTable.id,
      userId: employeesTable.userId,
      fullName: employeesTable.fullName,
      orgRole: employeesTable.orgRole,
      assignedBranchId: employeesTable.assignedBranchId,
      reportsToId: employeesTable.reportsToId,
      employmentStatus: employeesTable.employmentStatus,
    })
    .from(employeesTable)
    .where(
      and(
        inArray(employeesTable.orgRole, PHARMACY_ORG),
        sql`coalesce(${employeesTable.employmentStatus}, 'working') <> 'dismissed'`,
      ),
    );
  const slotRows = await db
    .select()
    .from(employeeWorkSlotsTable)
    .where(and(eq(employeeWorkSlotsTable.branchId, branchId), eq(employeeWorkSlotsTable.active, true)));
  const rotating = new Set(slotRows.filter((s) => slotCoversDate(slotRow(s), today)).map((s) => s.employeeId));

  return rows
    .filter((p) => !isOpenHireSlot(p))
    .filter((p) => {
      if (p.orgRole === "manager") return p.id === branchId && p.userId != null;
      const home = p.assignedBranchId ?? p.reportsToId;
      return home === branchId || rotating.has(p.id);
    })
    .map((p) => ({ id: p.id, fullName: p.fullName, orgRole: p.orgRole }));
}

function sortStaff(list: SheetEmployee[]): SheetEmployee[] {
  const rank = (r: string | null) => (r === "manager" ? 0 : r === "pharmacist" ? 1 : 2);
  return [...list].sort((a, b) => rank(a.orgRole) - rank(b.orgRole) || a.fullName.localeCompare(b.fullName, "uz"));
}

async function tiersFor(month: string): Promise<CommissionTier[]> {
  await ensureSchema();
  const { rows } = await pool.query<{ month: string; tiers: unknown }>(
    `SELECT month, tiers FROM sales_plan_tiers WHERE month = ANY($1::text[])`,
    [[month, "default"]],
  );
  const own = rows.find((r) => r.month === month) ?? rows.find((r) => r.month === "default");
  return own ? normalizeTiers(own.tiers) : DEFAULT_TIERS.map((t) => ({ ...t }));
}

async function planAmounts(month: string): Promise<Map<number, { amount: number; updatedByName: string | null; updatedAt: string | null }>> {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT branch_id, amount, updated_by_name, updated_at FROM sales_plans WHERE month = $1`,
    [month],
  );
  return new Map(
    rows.map((r) => [
      Number(r.branch_id),
      {
        amount: Number(r.amount) || 0,
        updatedByName: (r.updated_by_name as string) || null,
        updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
      },
    ]),
  );
}

async function monthEntries(month: string, branchId?: number): Promise<Array<SalesEntry & { branchId: number }>> {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT branch_id, employee_id, sale_date, amount FROM sales_entries
      WHERE sale_date LIKE $1 ${branchId ? "AND branch_id = $2" : ""}`,
    branchId ? [`${month}-%`, branchId] : [`${month}-%`],
  );
  return rows.map((r) => ({
    branchId: Number(r.branch_id),
    employeeId: Number(r.employee_id),
    date: String(r.sale_date),
    amount: Number(r.amount) || 0,
  }));
}

async function namesFor(ids: number[]): Promise<SheetEmployee[]> {
  if (!ids.length) return [];
  return db
    .select({ id: employeesTable.id, fullName: employeesTable.fullName, orgRole: employeesTable.orgRole })
    .from(employeesTable)
    .where(inArray(employeesTable.id, ids));
}

async function buildBranchSheet(branchId: number, month: string): Promise<{ sheet: SalesSheet; staffIds: Set<number> }> {
  const [plans, tiers, entries, staff] = await Promise.all([
    planAmounts(month),
    tiersFor(month),
    monthEntries(month, branchId),
    branchStaff(branchId),
  ]);
  const staffIds = new Set(staff.map((s) => s.id));
  const extraIds = [...new Set(entries.map((e) => e.employeeId))].filter((id) => !staffIds.has(id));
  const employees = sortStaff([...staff, ...(await namesFor(extraIds))]);
  const sheet = buildSalesSheet({
    month,
    plan: plans.get(branchId)?.amount ?? 0,
    tiers,
    todayYmd: todayTashkentYmd(),
    employees,
    entries,
  });
  return { sheet, staffIds };
}

export type StaffShift = {
  key: string;
  label: string;
  start: string;
  end: string;
  overnight: boolean;
  restToday: string | null;
};

/**
 * Bugungi smena: kunlik reja → shu filialdagi bugungi slot → xodim kartasidagi asosiy smena.
 * Vaqtlar «Smena sozlamalari»dan (3-smena 24:00–08:00 va h.k.).
 */
async function staffShifts(employeeIds: number[], branchId: number): Promise<Record<number, StaffShift>> {
  if (!employeeIds.length) return {};
  const today = todayTashkentYmd();
  const [defs, emps, slots, plans] = await Promise.all([
    getEffectiveShiftDefs(),
    db
      .select({
        id: employeesTable.id,
        orgRole: employeesTable.orgRole,
        shiftType: employeesTable.shiftType,
        shiftLabel: employeesTable.shiftLabel,
      })
      .from(employeesTable)
      .where(inArray(employeesTable.id, employeeIds)),
    db
      .select()
      .from(employeeWorkSlotsTable)
      .where(and(inArray(employeeWorkSlotsTable.employeeId, employeeIds), eq(employeeWorkSlotsTable.active, true))),
    db
      .select({ employeeId: employeeDayShiftPlansTable.employeeId, shiftKeys: employeeDayShiftPlansTable.shiftKeys })
      .from(employeeDayShiftPlansTable)
      .where(and(inArray(employeeDayShiftPlansTable.employeeId, employeeIds), eq(employeeDayShiftPlansTable.workDate, today))),
  ]);
  await loadWorkCalendar();
  const out: Record<number, StaffShift> = {};
  for (const e of emps) {
    const plan = plans.find((p) => p.employeeId === e.id);
    const daySlots = resolveSlotsForDay(today, slots.filter((s) => s.employeeId === e.id).map(slotRow)).filter(
      (s) => s.branchId === branchId,
    );
    const key = plan?.shiftKeys?.length
      ? encodeShiftKeys(parseShiftKeys(JSON.stringify(plan.shiftKeys)))
      : daySlots.length
        ? encodeShiftKeys(daySlots.flatMap((s) => parseShiftKeys(s.shiftKey)))
        : encodeShiftKeys(parseShiftKeys(e.shiftType, e.shiftLabel));
    const w = shiftWindow(key, null, defs);
    const label = formatShiftKeyUz(key);
    const rest = scheduledRestInfo(today, { employeeId: e.id, orgRole: e.orgRole, shiftType: e.shiftType, shiftLabel: e.shiftLabel });
    out[e.id] = {
      key,
      label: label.includes("+") ? `${label} smena` : label,
      start: w.start,
      end: w.end,
      overnight: Boolean(w.overnight),
      restToday: rest.rest ? rest.reason || "Dam kuni" : null,
    };
  }
  return out;
}

/** Farmasevt/stajyor — faqat o‘z qatori; filial jami ko‘rinadi */
function maskForStaff(sheet: SalesSheet, selfId: number | null): SalesSheet {
  return {
    ...sheet,
    days: sheet.days.map((d) => ({
      ...d,
      byEmployee: selfId != null && d.byEmployee[selfId] != null ? { [selfId]: d.byEmployee[selfId]! } : {},
    })),
    employees: sheet.employees.filter((e) => e.id === selfId),
  };
}

function deny(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

router.get("/savdo-plan/context", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const month = monthOf(req.query.month);
    const branches = await listBranches();
    const viewer = await loadViewer(req, branches, month);
    const visible = branches.filter((b) => viewer.branchIds.includes(b.id));
    res.json({
      today: todayTashkentYmd(),
      month,
      isAdmin: viewer.isAdmin,
      employeeId: viewer.employeeId,
      managerOf: viewer.managerOf,
      defaultBranchId: viewer.homeBranchId ?? visible[0]?.id ?? null,
      branches: visible.map((b) => ({ id: b.id, name: b.name, managerName: b.managerName })),
    });
  } catch (err) {
    console.error("GET /savdo-plan/context", err);
    deny(res, 500, "Savdo plan ma’lumoti yuklanmadi");
  }
});

router.get("/savdo-plan/sheet", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const month = monthOf(req.query.month);
    const branchId = Number(req.query.branchId);
    const branches = await listBranches();
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return deny(res, 404, "Filial topilmadi");
    const viewer = await loadViewer(req, branches, month);
    if (!viewer.isAdmin && !viewer.branchIds.includes(branchId)) {
      return deny(res, 403, "Bu filial savdo plani sizga ko‘rinmaydi");
    }
    const { sheet, staffIds } = await buildBranchSheet(branchId, month);
    const fullView = viewer.isAdmin || viewer.managerOf === branchId;
    const today = todayTashkentYmd();
    const editableEmployeeIds = viewer.isAdmin
      ? sheet.employees.map((e) => e.id)
      : viewer.managerOf === branchId
        ? [...new Set([...staffIds, viewer.employeeId!])]
        : viewer.employeeId != null
          ? [viewer.employeeId]
          : [];
    const plan = (await planAmounts(month)).get(branchId);
    const visible = fullView ? sheet.employees.map((e) => e.id) : viewer.employeeId != null ? [viewer.employeeId] : [];
    const shifts = await staffShifts(visible, branchId);
    res.json({
      branch: { id: branch.id, name: branch.name, managerName: branch.managerName },
      fullView,
      isAdmin: viewer.isAdmin,
      viewerEmployeeId: viewer.employeeId,
      today,
      editAnyDate: viewer.isAdmin,
      editableDates: viewer.isAdmin ? null : month === today.slice(0, 7) ? [today] : [],
      editableEmployeeIds,
      planUpdatedBy: plan?.updatedByName ?? null,
      planUpdatedAt: plan?.updatedAt ?? null,
      shifts,
      ...(fullView ? sheet : maskForStaff(sheet, viewer.employeeId)),
    });
  } catch (err) {
    console.error("GET /savdo-plan/sheet", err);
    deny(res, 500, "Savdo plan yuklanmadi");
  }
});

/**
 * Kunlik savdo kiritish. Xodim — faqat bugun va faqat o‘zi; mudir — bugun, o‘z filiali jamoasi;
 * admin — istalgan kun. amount = 0 — yozuv o‘chiriladi.
 */
router.put("/savdo-plan/entries", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const branchId = Number(req.body?.branchId);
    const date = String(req.body?.date || "");
    const items = Array.isArray(req.body?.items) ? (req.body.items as unknown[]) : [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(8, 10)) > daysInMonth(date.slice(0, 7))) {
      return deny(res, 400, "Sana noto‘g‘ri");
    }
    if (!items.length) return deny(res, 400, "Savdo summasi kiritilmadi");
    const parsed: Array<{ employeeId: number; amount: number }> = [];
    for (const raw of items) {
      const employeeId = Number((raw as { employeeId?: unknown })?.employeeId);
      const amount = Number((raw as { amount?: unknown })?.amount);
      if (!Number.isInteger(employeeId) || employeeId <= 0) return deny(res, 400, "Xodim noto‘g‘ri");
      if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
        return deny(res, 400, "Summa noto‘g‘ri — manfiy yoki juda katta bo‘lmasin");
      }
      parsed.push({ employeeId, amount: Math.round(amount * 100) / 100 });
    }

    const month = date.slice(0, 7);
    const branches = await listBranches();
    if (!branches.some((b) => b.id === branchId)) return deny(res, 404, "Filial topilmadi");
    const viewer = await loadViewer(req, branches, month);
    const today = todayTashkentYmd();
    if (!viewer.isAdmin) {
      if (!viewer.branchIds.includes(branchId)) return deny(res, 403, "Bu filialga savdo kirita olmaysiz");
      if (date !== today) {
        return deny(
          res,
          403,
          date < today
            ? "O‘tgan kun savdosini o‘zgartirib bo‘lmaydi. Xato bo‘lsa — admin bilan bog‘laning."
            : "Kelgusi kun uchun savdo kiritib bo‘lmaydi",
        );
      }
      const allowed = new Set<number>(viewer.employeeId != null ? [viewer.employeeId] : []);
      if (viewer.managerOf === branchId) for (const s of await branchStaff(branchId)) allowed.add(s.id);
      const bad = parsed.find((p) => !allowed.has(p.employeeId));
      if (bad) return deny(res, 403, "Faqat o‘zingizning savdongizni kiritishingiz mumkin");
    } else if (date > today) {
      return deny(res, 400, "Kelgusi kun uchun savdo kiritib bo‘lmaydi");
    }

    const known = new Set((await namesFor(parsed.map((p) => p.employeeId))).map((e) => e.id));
    if (parsed.some((p) => !known.has(p.employeeId))) return deny(res, 404, "Xodim topilmadi");

    await ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const p of parsed) {
        if (p.amount === 0) {
          await client.query(
            `DELETE FROM sales_entries WHERE branch_id = $1 AND employee_id = $2 AND sale_date = $3`,
            [branchId, p.employeeId, date],
          );
          continue;
        }
        await client.query(
          `INSERT INTO sales_entries (branch_id, employee_id, sale_date, amount, entered_by_id, entered_by_name)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (branch_id, employee_id, sale_date) DO UPDATE SET
             amount = EXCLUDED.amount, entered_by_id = EXCLUDED.entered_by_id,
             entered_by_name = EXCLUDED.entered_by_name, updated_at = NOW()`,
          [branchId, p.employeeId, date, p.amount, req.userId ?? null, viewer.fullName || null],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.json({ ok: true, saved: parsed.length });
  } catch (err) {
    console.error("PUT /savdo-plan/entries", err);
    deny(res, 500, "Savdo saqlanmadi");
  }
});

router.get("/savdo-plan/overview", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!hasFullPlatformAccess(req.userRole)) return deny(res, 403, "Faqat admin uchun");
  try {
    const month = monthOf(req.query.month);
    const [branches, plans, tiers, entries] = await Promise.all([
      listBranches(),
      planAmounts(month),
      tiersFor(month),
      monthEntries(month),
    ]);
    const today = todayTashkentYmd();
    const rows = branches.map((b) => {
      const own = entries.filter((e) => e.branchId === b.id);
      const sheet = buildSalesSheet({
        month,
        plan: plans.get(b.id)?.amount ?? 0,
        tiers,
        todayYmd: today,
        employees: [],
        entries: own,
      });
      const lastDay = [...sheet.days].reverse().find((d) => d.hasData)?.date ?? null;
      return {
        branchId: b.id,
        name: b.name,
        managerName: b.managerName,
        sellers: new Set(own.map((e) => e.employeeId)).size,
        lastEntryDate: lastDay,
        ...sheet.summary,
      };
    });
    const totalPlan = rows.reduce((s, r) => s + r.plan, 0);
    const totalDone = rows.reduce((s, r) => s + r.done, 0);
    const totalToday = rows.reduce((s, r) => s + r.todayTotal, 0);
    const totalProjected = rows.reduce((s, r) => s + r.projected, 0);
    const totalNeeded = rows.reduce((s, r) => s + (r.neededPerDay ?? 0), 0);
    res.json({
      month,
      today,
      daysInMonth: daysInMonth(month),
      tiers,
      rows,
      totals: {
        plan: totalPlan,
        done: totalDone,
        pct: totalPlan > 0 ? totalDone / totalPlan : 0,
        todayTotal: totalToday,
        dailyPlan: totalPlan / daysInMonth(month),
        projected: totalProjected,
        projectedPct: totalPlan > 0 ? totalProjected / totalPlan : 0,
        neededPerDay: totalNeeded,
      },
    });
  } catch (err) {
    console.error("GET /savdo-plan/overview", err);
    deny(res, 500, "Savdo plan yuklanmadi");
  }
});

router.put("/savdo-plan/plan", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!hasFullPlatformAccess(req.userRole)) return deny(res, 403, "Plan qo‘yish faqat admin uchun");
  try {
    const branchId = Number(req.body?.branchId);
    const month = String(req.body?.month || "");
    const amount = Number(req.body?.amount);
    if (!isMonthKey(month)) return deny(res, 400, "Oy noto‘g‘ri");
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) return deny(res, 400, "Plan summasi noto‘g‘ri");
    const branches = await listBranches();
    if (!branches.some((b) => b.id === branchId)) return deny(res, 404, "Filial topilmadi");
    await ensureSchema();
    const [actor] = await db
      .select({ fullName: usersTable.fullName })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    await pool.query(
      `INSERT INTO sales_plans (branch_id, month, amount, updated_by_id, updated_by_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (branch_id, month) DO UPDATE SET
         amount = EXCLUDED.amount, updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name, updated_at = NOW()`,
      [branchId, month, Math.round(amount * 100) / 100, req.userId ?? null, actor?.fullName || null],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("PUT /savdo-plan/plan", err);
    deny(res, 500, "Plan saqlanmadi");
  }
});

/** Komissiya pog‘onalari: shu oy uchun saqlanadi va keyingi oylar uchun standart bo‘ladi */
router.put("/savdo-plan/tiers", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!hasFullPlatformAccess(req.userRole)) return deny(res, 403, "Faqat admin uchun");
  try {
    const month = String(req.body?.month || "");
    if (!isMonthKey(month)) return deny(res, 400, "Oy noto‘g‘ri");
    if (!Array.isArray(req.body?.tiers) || !req.body.tiers.length) return deny(res, 400, "Pog‘onalar bo‘sh");
    const tiers = normalizeTiers(req.body.tiers);
    await ensureSchema();
    for (const key of [month, "default"]) {
      await pool.query(
        `INSERT INTO sales_plan_tiers (month, tiers, updated_by_id, updated_at) VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (month) DO UPDATE SET tiers = EXCLUDED.tiers, updated_by_id = EXCLUDED.updated_by_id, updated_at = NOW()`,
        [key, JSON.stringify(tiers), req.userId ?? null],
      );
    }
    res.json({ ok: true, tiers });
  } catch (err) {
    console.error("PUT /savdo-plan/tiers", err);
    deny(res, 500, "Komissiya pog‘onalari saqlanmadi");
  }
});

const NAVY = "FF0B3A5C";

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  row.height = 32;
}

router.get("/savdo-plan/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const month = monthOf(req.query.month);
    const branchId = Number(req.query.branchId);
    const branches = await listBranches();
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return deny(res, 404, "Filial topilmadi");
    const viewer = await loadViewer(req, branches, month);
    if (!viewer.isAdmin && viewer.managerOf !== branchId) return deny(res, 403, "Excel faqat admin va filial mudiri uchun");
    const { sheet } = await buildBranchSheet(branchId, month);
    const s = sheet.summary;
    const emps = sheet.employees;

    const wb = new ExcelJS.Workbook();
    wb.creator = "AMIR FARM HR";
    const ws = wb.addWorksheet(`${branch.name}`.slice(0, 28) || "Savdo plan");
    const lastCol = emps.length + 8;
    ws.mergeCells(1, 1, 1, lastCol);
    ws.getCell(1, 1).value = `${branch.name} — kundalik savdo va komissiya · ${month}`;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: NAVY } };
    const info: Array<[string, number | string]> = [
      ["Oylik plan", s.plan],
      ["Kunlik plan (oylik / kun soni)", s.dailyPlan],
      ["Bajarildi", s.done],
      ["Bajarish %", s.pct],
      ["Komissiya %", s.commissionPct],
    ];
    info.forEach(([k, v], i) => {
      ws.getCell(3 + i, 1).value = k;
      ws.getCell(3 + i, 1).font = { bold: true };
      const c = ws.getCell(3 + i, 3);
      c.value = v;
      c.numFmt = typeof v === "number" && v < 1 && k.includes("%") ? "0.00%" : "#,##0";
    });

    const headRow = 9;
    const header = ["Kun", ...emps.map((e) => e.fullName), "Kunlik jami", "Kunlik plan", "Farq", "Kumulyativ", "Bajarish %", "Komissiya %", "Kunlik %"];
    header.forEach((h, i) => (ws.getCell(headRow, i + 1).value = h));
    styleHeader(ws.getRow(headRow));
    sheet.days.forEach((d, i) => {
      const r = ws.getRow(headRow + 1 + i);
      const vals = [
        d.day,
        ...emps.map((e) => d.byEmployee[e.id] ?? null),
        d.total,
        d.dailyPlan,
        d.diff,
        d.cumulative,
        d.monthPct,
        d.commissionPct,
        d.dayPct,
      ];
      vals.forEach((v, j) => (r.getCell(j + 1).value = v));
      for (let j = 2; j <= emps.length + 5; j++) r.getCell(j).numFmt = "#,##0";
      r.getCell(emps.length + 6).numFmt = "0.00%";
      r.getCell(emps.length + 7).numFmt = "0.0%";
      r.getCell(emps.length + 8).numFmt = "0%";
      const diffCell = r.getCell(emps.length + 4);
      if (d.hasData) diffCell.font = { color: { argb: d.diff >= 0 ? "FF15803D" : "FFB91C1C" }, bold: true };
    });

    const incomeStart = headRow + sheet.days.length + 3;
    ws.getCell(incomeStart, 1).value = "Xodimlarning oylik daromadi";
    ws.getCell(incomeStart, 1).font = { bold: true, size: 12, color: { argb: NAVY } };
    const ih = ws.getRow(incomeStart + 1);
    ["Xodim", "Jami savdo (oy)", "Ulushi", "Oylik bajarish %", "Komissiya %", "Oylik daromad"].forEach((h, i) => (ih.getCell(i + 1).value = h));
    styleHeader(ih);
    emps.forEach((e, i) => {
      const r = ws.getRow(incomeStart + 2 + i);
      [e.fullName, e.total, e.sharePct, s.pct, e.commissionPct, e.income].forEach((v, j) => (r.getCell(j + 1).value = v));
      r.getCell(2).numFmt = "#,##0";
      r.getCell(3).numFmt = "0.0%";
      r.getCell(4).numFmt = "0.00%";
      r.getCell(5).numFmt = "0.0%";
      r.getCell(6).numFmt = "#,##0";
    });
    const tr = ws.getRow(incomeStart + 2 + emps.length);
    tr.getCell(1).value = "Jami";
    tr.getCell(2).value = s.done;
    tr.getCell(6).value = emps.reduce((sum, e) => sum + e.income, 0);
    tr.getCell(2).numFmt = "#,##0";
    tr.getCell(6).numFmt = "#,##0";
    tr.font = { bold: true };

    const tierStart = incomeStart + emps.length + 5;
    ws.getCell(tierStart, 1).value = "Komissiya pog‘onalari";
    ws.getCell(tierStart, 1).font = { bold: true, color: { argb: NAVY } };
    const th = ws.getRow(tierStart + 1);
    th.getCell(1).value = "Bajarish % (dan)";
    th.getCell(2).value = "Komissiya %";
    styleHeader(th);
    sheet.tiers.forEach((t, i) => {
      const r = ws.getRow(tierStart + 2 + i);
      r.getCell(1).value = t.from;
      r.getCell(2).value = t.pct;
      r.getCell(1).numFmt = "0%";
      r.getCell(2).numFmt = "0.0%";
    });

    ws.getColumn(1).width = 26;
    for (let j = 2; j <= lastCol; j++) ws.getColumn(j).width = 15;
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: headRow }];

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="savdo-plan_${branch.id}_${month}.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("GET /savdo-plan/export", err);
    deny(res, 500, "Excel tayyorlanmadi");
  }
});

export default router;
