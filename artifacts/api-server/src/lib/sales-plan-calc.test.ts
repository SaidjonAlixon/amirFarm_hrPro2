import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TIERS,
  buildSalesSheet,
  commissionFor,
  daysInMonth,
  normalizeTiers,
  type SalesEntry,
} from "./sales-plan-calc.ts";

/** «F4 sentabr plan.xlsx»: Gulbahor (1), Bexruz (2), shartli (3) */
const F4: Array<[number, number, number]> = [
  [1, 5811081.53, 2685288.55], [2, 12726393.16, 6011120.04], [3, 7397244.47, 7542575.09],
  [4, 11476655.57, 8600094.9], [5, 8887996.62, 8174677.22], [6, 0, 12191743.94],
  [7, 12669605.58, 6405000.15], [8, 10685263.99, 4338449.44], [9, 10392448.56, 12634137.81],
  [10, 10722234.37, 5157825], [11, 9540057.58, 6434414.2], [12, 6380960.83, 5279243],
  [13, 0, 10467107], [14, 7590570, 6634343], [15, 9156229, 7038721], [16, 11722925, 10721208],
  [17, 19715339, 6483992], [18, 13087167, 4997503], [19, 15362604, 0], [20, 0, 10926505],
  [21, 12470402, 5983167], [22, 8694418, 8156767], [23, 8860928, 6483930], [24, 7357771, 8530376],
  [25, 4144187, 6237008], [26, 6961650, 11469233], [27, 0, 10449107], [28, 7367307, 6249775],
  [29, 8354844, 9106388], [30, 0, 10025738],
];

function f4Entries(): SalesEntry[] {
  const out: SalesEntry[] = [];
  for (const [d, a, b] of F4) {
    const date = `2026-09-${String(d).padStart(2, "0")}`;
    if (a) out.push({ employeeId: 1, date, amount: a });
    if (b) out.push({ employeeId: 2, date, amount: b });
  }
  out.push({ employeeId: 3, date: "2026-09-30", amount: 3_100_000 });
  return out;
}

const EMPLOYEES = [
  { id: 1, fullName: "Gulbahor", orgRole: "manager" },
  { id: 2, fullName: "Bexruz", orgRole: "pharmacist" },
  { id: 3, fullName: "shartli", orgRole: "pharmacist" },
];

const near = (a: number, b: number, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

describe("savdo plan — Excel shabloni bilan bir xil", () => {
  it("o‘tgan oy (sentabr) yakuni Excel natijalariga teng", () => {
    const s = buildSalesSheet({
      month: "2026-09",
      plan: 560_000_000,
      tiers: DEFAULT_TIERS,
      todayYmd: "2026-11-05",
      employees: EMPLOYEES,
      entries: f4Entries(),
    });
    near(s.summary.dailyPlan, 18_666_666.67);
    near(s.days[0]!.total, 8_496_370.08);
    near(s.days[0]!.diff, -10_170_296.59);
    /** Excel N20 = 13-kun */
    near(s.days[12]!.cumulative, 202_611_618.6);
    near(s.summary.done, 476_051_720.6);
    near(s.summary.pct, 0.8501, 0.0001);
    assert.equal(s.summary.commissionPct, 0.007);
    assert.equal(s.days[0]!.commissionPct, 0.003);
    const [g, b, x] = s.employees;
    near(g!.total, 247_536_283.26);
    near(g!.income, 1_732_753.98);
    near(b!.total, 225_415_437.34);
    near(b!.income, 1_577_908.06);
    near(x!.income, 21_700);
    assert.equal(g!.rank, 1);
    assert.equal(b!.rank, 2);
    assert.equal(x!.rank, 3);
    assert.equal(g!.bestDay?.date, "2026-09-17");
    assert.equal(s.summary.bestDay?.date, "2026-09-17");
    assert.equal(s.summary.timePct, 1);
    near(s.summary.paceGap, 476_051_720.6 - 560_000_000);
    assert.equal(s.summary.status, "past");
    assert.equal(s.summary.neededPerDay, null);
  });

  it("joriy oy: bugun kiritilmagan bo‘lsa prognoz bugun uchun", () => {
    const s = buildSalesSheet({
      month: "2026-09",
      plan: 560_000_000,
      tiers: DEFAULT_TIERS,
      todayYmd: "2026-09-20",
      employees: EMPLOYEES,
      entries: f4Entries().filter((e) => e.date < "2026-09-20"),
    });
    assert.equal(s.summary.forecastFor, "today");
    assert.equal(s.summary.forecastDate, "2026-09-20");
    assert.equal(s.summary.daysElapsed, 19);
    assert.equal(s.summary.daysLeft, 11);
    near(s.summary.neededPerDay!, (560_000_000 - s.summary.done) / 11);
  });

  it("joriy oy: bugun kiritilgan bo‘lsa prognoz ertaga uchun", () => {
    const s = buildSalesSheet({
      month: "2026-09",
      plan: 560_000_000,
      tiers: DEFAULT_TIERS,
      todayYmd: "2026-09-20",
      employees: EMPLOYEES,
      entries: f4Entries().filter((e) => e.date <= "2026-09-20"),
    });
    assert.equal(s.summary.forecastFor, "tomorrow");
    assert.equal(s.summary.forecastDate, "2026-09-21");
    assert.equal(s.summary.daysLeft, 10);
    near(s.summary.todayTotal, 10_926_505);
    near(s.summary.projected, (s.summary.done / 20) * 30);
  });

  it("komissiya pog‘onasi Excel VLOOKUP kabi", () => {
    assert.equal(commissionFor(0, DEFAULT_TIERS), 0.003);
    assert.equal(commissionFor(0.8499, DEFAULT_TIERS), 0.003);
    assert.equal(commissionFor(0.85, DEFAULT_TIERS), 0.007);
    assert.equal(commissionFor(0.95, DEFAULT_TIERS), 0.009);
    assert.equal(commissionFor(1, DEFAULT_TIERS), 0.011);
    assert.equal(commissionFor(1.5, DEFAULT_TIERS), 0.015);
  });

  it("pog‘onalar tartiblanadi, noto‘g‘ri qiymatlar tashlanadi", () => {
    const t = normalizeTiers([{ from: 1, pct: 0.011 }, { from: 0.5, pct: 0.005 }, { from: "x", pct: 1 }]);
    assert.deepEqual(t, [{ from: 0, pct: 0 }, { from: 0.5, pct: 0.005 }, { from: 1, pct: 0.011 }]);
    assert.deepEqual(normalizeTiers(null), DEFAULT_TIERS);
  });

  it("oy kunlari", () => {
    assert.equal(daysInMonth("2026-09"), 30);
    assert.equal(daysInMonth("2026-10"), 31);
    assert.equal(daysInMonth("2028-02"), 29);
  });
});
