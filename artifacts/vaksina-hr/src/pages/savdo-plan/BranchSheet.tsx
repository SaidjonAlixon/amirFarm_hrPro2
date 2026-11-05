import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgePercent,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Info,
  Lock,
  RefreshCw,
  Save,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money-format";
import {
  dayLabel,
  downloadSavdoExcel,
  fetchSavdoSheet,
  monthLabel,
  pctText,
  saveSavdoEntries,
  type SavdoSheet,
  type StaffShift,
} from "@/lib/savdo-plan-api";
import { MoneyInput, ProgressBar, StatCard, orgRoleLabel, pctTone, som, somShort } from "./shared";

export function BranchSheet({ branchId, month }: { branchId: number; month: string }) {
  const q = useQuery({
    queryKey: ["savdo-sheet", branchId, month],
    queryFn: () => fetchSavdoSheet(branchId, month),
  });
  if (q.isLoading) return <p className="py-16 text-center text-sm text-muted-foreground">Yuklanmoqda…</p>;
  if (q.isError || !q.data) {
    return <p className="py-16 text-center text-sm text-rose-600">{(q.error as Error)?.message || "Yuklanmadi"}</p>;
  }
  return <SheetBody sheet={q.data} month={month} refreshing={q.isFetching} onRefresh={() => void q.refetch()} />;
}

function SheetBody({
  sheet,
  month,
  refreshing,
  onRefresh,
}: {
  sheet: SavdoSheet;
  month: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const s = sheet.summary;
  const self = sheet.viewerEmployeeId;
  const planSet = s.plan > 0;
  const [exporting, setExporting] = useState(false);

  const forecastLabel =
    s.forecastFor === "today" ? "Bugun sotish kerak" : s.forecastFor === "tomorrow" ? "Ertaga sotish kerak" : "Har kuni kerak";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">{sheet.branch.name}</h2>
          <p className="text-xs text-muted-foreground">
            Mudir: {sheet.branch.managerName} · {monthLabel(month)} · {s.daysInMonth} kun
            {sheet.planUpdatedBy ? ` · plan qo‘ydi: ${sheet.planUpdatedBy}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sheet.fullView ? (
            <Button
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await downloadSavdoExcel(sheet.branch.id, month, sheet.branch.name);
                } catch (e) {
                  toast({ title: "Excel yuklanmadi", description: (e as Error).message, variant: "destructive" });
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing} title="Yangilash">
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {!planSet ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {monthLabel(month)} uchun filial plani hali qo‘yilmagan. Savdoni kiritaverishingiz mumkin — plan qo‘yilgach foiz va
            komissiya avtomatik hisoblanadi.
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Target}
          tone="brand"
          label="Oylik plan"
          value={planSet ? somShort(s.plan) : "—"}
          sub={planSet ? `Kunlik plan: ${som(s.dailyPlan)}` : "Admin plan qo‘yadi"}
        />
        <StatCard
          icon={CheckCircle2}
          tone={s.pct >= 1 ? "good" : s.pct >= 0.85 ? "warn" : "bad"}
          label="Bajarildi"
          value={
            <span>
              {somShort(s.done)} <span className={cn("text-sm", pctTone(s.pct).text)}>{planSet ? pctText(s.pct) : ""}</span>
            </span>
          }
          sub={planSet ? (s.remaining > 0 ? `Qoldi: ${som(s.remaining)}` : "Oylik plan bajarildi 🎉") : `${s.daysElapsed} kun`}
        >
          {planSet ? <ProgressBar value={s.pct} /> : null}
        </StatCard>
        <StatCard
          icon={CalendarDays}
          tone={s.todayPct >= 1 ? "good" : s.todayTotal > 0 ? "warn" : "default"}
          label={s.status === "current" ? "Bugungi savdo" : "O‘rtacha kunlik"}
          value={s.status === "current" ? somShort(s.todayTotal) : somShort(s.avgDaily)}
          sub={
            s.status === "current"
              ? planSet
                ? `Kunlik planning ${pctText(s.todayPct)} bajarildi`
                : "Bugun kiritilgan savdo"
              : `${s.daysElapsed} kun o‘rtachasi`
          }
        />
        <StatCard
          icon={TrendingUp}
          tone={s.neededPerDay != null && s.neededPerDay > s.dailyPlan * 1.15 ? "bad" : "brand"}
          label={s.status === "past" ? "Oy yakuni" : forecastLabel}
          value={s.status === "past" ? pctText(s.pct) : s.neededPerDay != null ? somShort(s.neededPerDay) : "—"}
          sub={
            s.status === "current" && planSet
              ? s.remaining <= 0
                ? "Plan yopildi — har bir qo‘shimcha savdo komissiyani oshiradi"
                : `${s.daysLeft} kun qoldi · shu sur’atda oy oxiri: ${pctText(s.projectedPct)} (${somShort(s.projected)})`
              : s.status === "past"
                ? `Jami: ${som(s.done)}`
                : "Kunlik plan bo‘yicha"
          }
        />
        <StatCard
          icon={BadgePercent}
          tone="good"
          label="Komissiya"
          value={
            <span>
              {pctText(s.commissionPct, 2)}
              {s.status === "current" && s.projectedCommissionPct !== s.commissionPct ? (
                <span className="ml-1 text-sm font-semibold text-muted-foreground">→ {pctText(s.projectedCommissionPct, 2)}</span>
              ) : null}
            </span>
          }
          sub={
            s.nextTier && planSet && s.status !== "past"
              ? `${pctText(s.nextTier.from, 0)} ga yetsa ${pctText(s.nextTier.pct, 2)} — yana ${som(s.nextTier.needAmount)}`
              : "Oylik bajarish foiziga qarab"
          }
        />
      </div>

      <EntryPanel sheet={sheet} month={month} />

      <DailyChart sheet={sheet} />

      <DailyTable sheet={sheet} self={self} />

      <IncomeTable sheet={sheet} />

      <TierLegend sheet={sheet} />
    </div>
  );
}

function EntryPanel({ sheet, month }: { sheet: SavdoSheet; month: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const s = sheet.summary;
  const isAdmin = sheet.editAnyDate;
  const defaultDate = isAdmin
    ? s.status === "current"
      ? sheet.today
      : s.status === "past"
        ? `${month}-${String(s.daysInMonth).padStart(2, "0")}`
        : null
    : sheet.editableDates?.[0] ?? null;
  const [date, setDate] = useState<string | null>(defaultDate);
  const [values, setValues] = useState<Record<number, number | null>>({});

  useEffect(() => {
    setDate(defaultDate);
  }, [sheet.branch.id, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const day = sheet.days.find((d) => d.date === date) ?? null;
  const rows = useMemo(() => {
    const byId = new Map(sheet.employees.map((e) => [e.id, e]));
    return [...new Set(sheet.editableEmployeeIds)]
      .map((id) => {
        const e = byId.get(id);
        return {
          id,
          fullName: e?.fullName || (id === sheet.viewerEmployeeId ? "Siz" : `#${id}`),
          orgRole: e?.orgRole ?? null,
          isSelf: id === sheet.viewerEmployeeId,
          shift: sheet.shifts[id] ?? null,
        };
      })
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
  }, [sheet]);

  useEffect(() => {
    const next: Record<number, number | null> = {};
    for (const r of rows) next[r.id] = day?.byEmployee[r.id] ?? null;
    setValues(next);
  }, [day, rows]);

  const mut = useMutation({
    mutationFn: () =>
      saveSavdoEntries({
        branchId: sheet.branch.id,
        date: date!,
        items: rows.map((r) => ({ employeeId: r.id, amount: values[r.id] ?? 0 })),
      }),
    onSuccess: () => {
      toast({ title: "Savdo saqlandi ✓", description: `${sheet.branch.name} · ${dayLabel(date!)}` });
      void qc.invalidateQueries({ queryKey: ["savdo-sheet"] });
      void qc.invalidateQueries({ queryKey: ["savdo-overview"] });
    },
    onError: (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" }),
  });

  const othersOnDay = useMemo(() => {
    if (!day) return 0;
    const editable = new Set(rows.map((r) => r.id));
    return day.total - Object.entries(day.byEmployee).reduce((sum, [id, v]) => sum + (editable.has(Number(id)) ? v : 0), 0);
  }, [day, rows]);
  const enteredSum = rows.reduce((sum, r) => sum + (values[r.id] ?? 0), 0);
  const previewTotal = sheet.fullView ? othersOnDay + enteredSum : (day?.total ?? 0) - (day?.byEmployee[sheet.viewerEmployeeId ?? -1] ?? 0) + enteredSum;
  const previewPct = s.dailyPlan > 0 ? previewTotal / s.dailyPlan : 0;
  const dirty = rows.some((r) => (values[r.id] ?? 0) !== (day?.byEmployee[r.id] ?? 0));

  const locked = !date || !rows.length;
  const lockedText = !rows.length
    ? "Siz uchun savdo kiritish ruxsati yo‘q."
    : s.status === "future"
      ? "Bu oy hali boshlanmagan."
      : "O‘tgan kunlar savdosini o‘zgartirib bo‘lmaydi. Xato bo‘lsa — admin bilan bog‘laning.";

  return (
    <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 via-card to-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Wallet className="h-4 w-4 text-primary" />
            {isAdmin ? "Savdo kiritish (admin)" : "Bugungi savdoni kiritish"}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isAdmin
              ? "Admin istalgan kun savdosini tuzatishi mumkin. 0 kiritilsa yozuv o‘chiriladi."
              : sheet.fullView
                ? "Mudir: o‘zingiz va filial xodimlarining bugungi savdosini kiriting. Kecha va undan oldingi kunlar yopiq."
                : "Faqat bugungi o‘z savdongizni kiritasiz. Kechagi kun yopiq — tahrirlab bo‘lmaydi."}
          </p>
        </div>
        {isAdmin ? (
          <input
            type="date"
            value={date ?? ""}
            min={`${month}-01`}
            max={[`${month}-${String(s.daysInMonth).padStart(2, "0")}`, sheet.today].sort()[0]}
            onChange={(e) => setDate(e.target.value || null)}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs"
          />
        ) : date ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{dayLabel(date)} · bugun</span>
        ) : null}
      </div>

      {locked ? (
        <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          {lockedText}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <label
                key={r.id}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl border bg-card p-3",
                  r.isSelf ? "border-primary/40" : "border-border",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-foreground">{r.isSelf ? `${r.fullName} (siz)` : r.fullName}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{orgRoleLabel(r.orgRole)}</span>
                </span>
                <ShiftLine shift={r.shift} />
                <MoneyInput
                  value={values[r.id] ?? null}
                  onChange={(n) => setValues((prev) => ({ ...prev, [r.id]: n }))}
                  placeholder="Savdo summasi"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">
              Kiritilgan: <strong className="text-foreground">{som(enteredSum)}</strong>
              <span className="mx-2">·</span>
              Filial kun jami: <strong className="text-foreground">{som(previewTotal)}</strong>
              {s.dailyPlan > 0 ? (
                <>
                  <span className="mx-2">·</span>
                  Kunlik plan: <strong className={pctTone(previewPct).text}>{pctText(previewPct)}</strong>
                </>
              ) : null}
            </div>
            <Button size="sm" disabled={!dirty || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Saqlash
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function ShiftLine({ shift }: { shift: StaffShift | null }) {
  if (!shift) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
        <Clock className="h-3 w-3" />
        {shift.label}
      </span>
      <span className="font-medium tabular-nums text-muted-foreground">
        {shift.start}–{shift.end}
        {shift.overnight ? " (ertasi kun)" : ""}
      </span>
      {shift.restToday ? (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300" title={shift.restToday}>
          Bugun dam
        </span>
      ) : null}
    </span>
  );
}

function DailyChart({ sheet }: { sheet: SavdoSheet }) {
  const s = sheet.summary;
  const max = Math.max(s.dailyPlan, ...sheet.days.map((d) => d.total), 1);
  const planTop = s.dailyPlan > 0 ? 100 - (s.dailyPlan / max) * 100 : null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Kunlik dinamika</h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Plandan yuqori</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Plandan past</span>
          {planTop != null ? <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-primary" /> Kunlik plan</span> : null}
        </div>
      </div>
      <div className="relative h-40">
        {planTop != null ? (
          <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-primary/70" style={{ top: `${planTop}%` }} />
        ) : null}
        <div className="flex h-full items-end gap-[3px]">
          {sheet.days.map((d) => {
            const h = (d.total / max) * 100;
            const good = s.dailyPlan > 0 ? d.total >= s.dailyPlan : true;
            return (
              <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className={cn(
                    "w-full rounded-t-sm transition-all",
                    !d.hasData ? "bg-muted" : good ? "bg-emerald-500" : "bg-rose-400",
                    d.isToday && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                  )}
                  style={{ height: d.hasData ? `${Math.max(2, h)}%` : "2%" }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] text-background group-hover:block">
                  {dayLabel(d.date)}: {formatMoney(d.total)}
                  {s.dailyPlan > 0 && d.hasData ? ` · ${pctText(d.dayPct)}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-[3px] text-[9px] text-muted-foreground">
        {sheet.days.map((d) => (
          <span key={d.date} className={cn("flex-1 text-center", d.isToday && "font-bold text-primary")}>
            {d.day % 5 === 0 || d.day === 1 || d.isToday ? d.day : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

function DailyTable({ sheet, self }: { sheet: SavdoSheet; self: number | null }) {
  const s = sheet.summary;
  const cols = sheet.fullView ? sheet.employees : sheet.employees.filter((e) => e.id === self);
  const visibleDays = sheet.days.filter((d) => !d.isFuture || d.hasData);
  const cell = "whitespace-nowrap px-3 py-2.5 text-right tabular-nums";
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">Kundalik savdo jadvali</h3>
        <span className="text-[11px] text-muted-foreground">
          {sheet.fullView ? "Har bir xodim alohida" : "Siz va filial jami"}
        </span>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[960px] text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted/90 text-[10px] uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="sticky left-0 bg-muted/90 px-2.5 py-2 text-left">Kun</th>
              {cols.map((e) => (
                <th key={e.id} className="px-2.5 py-2 text-right normal-case">
                  {e.id === self ? "Mening savdom" : e.fullName}
                </th>
              ))}
              <th className="px-2.5 py-2 text-right">Kunlik jami</th>
              <th className="px-2.5 py-2 text-right">Kunlik plan</th>
              <th className="px-2.5 py-2 text-right">Farq</th>
              <th className="px-2.5 py-2 text-right">Kun %</th>
              <th className="px-2.5 py-2 text-right">Kumulyativ</th>
              <th className="px-2.5 py-2 text-right">Oylik %</th>
              <th className="px-2.5 py-2 text-right">Komissiya</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {visibleDays.map((d) => (
              <tr key={d.date} className={cn(d.isToday && "bg-primary/5", !d.hasData && "text-muted-foreground")}>
                <td className={cn("sticky left-0 whitespace-nowrap bg-card px-3 py-2.5 text-left font-semibold", d.isToday && "bg-primary/5 text-primary")}>
                  {d.day}
                  {d.isToday ? <span className="ml-1 text-[9px] font-medium">bugun</span> : null}
                </td>
                {cols.map((e) => (
                  <td key={e.id} className={cell}>
                    {d.byEmployee[e.id] != null ? formatMoney(d.byEmployee[e.id]!) : "—"}
                  </td>
                ))}
                <td className={cn(cell, "font-semibold text-foreground")}>{d.hasData ? formatMoney(d.total) : "—"}</td>
                <td className={cell}>{s.dailyPlan > 0 ? formatMoney(d.dailyPlan) : "—"}</td>
                <td
                  className={cn(
                    cell,
                    "font-semibold",
                    d.hasData && s.dailyPlan > 0 && (d.diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"),
                  )}
                >
                  {d.hasData && s.dailyPlan > 0 ? `${d.diff > 0 ? "+" : ""}${formatMoney(d.diff)}` : "—"}
                </td>
                <td className={cn(cell, d.hasData && pctTone(d.dayPct).text)}>{d.hasData && s.dailyPlan > 0 ? pctText(d.dayPct) : "—"}</td>
                <td className={cell}>{d.cumulative > 0 ? formatMoney(d.cumulative) : "—"}</td>
                <td className={cn(cell, "font-semibold")}>{s.plan > 0 ? pctText(d.monthPct) : "—"}</td>
                <td className={cell}>{pctText(d.commissionPct, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted/90 text-[13px] font-bold backdrop-blur">
            <tr>
              <td className="sticky left-0 bg-muted/90 px-2.5 py-2 text-left">Jami</td>
              {cols.map((e) => (
                <td key={e.id} className={cell}>{formatMoney(e.total)}</td>
              ))}
              <td className={cell}>{formatMoney(s.done)}</td>
              <td className={cell}>{s.plan > 0 ? formatMoney(s.plan) : "—"}</td>
              <td className={cn(cell, s.plan > 0 && (s.done >= s.plan ? "text-emerald-600" : "text-rose-600"))}>
                {s.plan > 0 ? formatMoney(s.done - s.plan) : "—"}
              </td>
              <td className={cell} />
              <td className={cell} />
              <td className={cn(cell, pctTone(s.pct).text)}>{s.plan > 0 ? pctText(s.pct) : "—"}</td>
              <td className={cell}>{pctText(s.commissionPct, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function IncomeTable({ sheet }: { sheet: SavdoSheet }) {
  const s = sheet.summary;
  if (!sheet.employees.length) return null;
  const totalIncome = sheet.employees.reduce((sum, e) => sum + e.income, 0);
  const totalProjected = sheet.employees.reduce((sum, e) => sum + e.projectedIncome, 0);
  const showProjected = s.status === "current";
  const top = [...sheet.employees].sort((a, b) => b.total - a.total)[0];
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">{sheet.fullView ? "Xodimlarning oylik daromadi" : "Mening daromadim"}</h3>
        <span className="text-[11px] text-muted-foreground">
          Daromad = xodim savdosi × filialning oylik komissiya foizi ({pctText(s.commissionPct, 2)})
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Xodim</th>
              <th className="px-3 py-2 text-right">Jami savdo (oy)</th>
              {sheet.fullView ? <th className="px-3 py-2 text-right">Ulushi</th> : null}
              <th className="px-3 py-2 text-right">Savdo kunlari</th>
              <th className="px-3 py-2 text-right">Komissiya %</th>
              <th className="px-3 py-2 text-right">{s.status === "past" ? "Oylik daromad" : "Hozirgi daromad"}</th>
              {showProjected ? <th className="px-3 py-2 text-right">Prognoz (oy oxiri)</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 whitespace-nowrap">
            {sheet.employees.map((e) => (
              <tr key={e.id} className={cn(e.id === sheet.viewerEmployeeId && "bg-primary/5")}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    {sheet.fullView && top && top.id === e.id && top.total > 0 ? <Trophy className="h-3.5 w-3.5 text-amber-500" /> : null}
                    {e.fullName}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {orgRoleLabel(e.orgRole)}
                    {sheet.shifts[e.id]
                      ? ` · ${sheet.shifts[e.id]!.label} ${sheet.shifts[e.id]!.start}–${sheet.shifts[e.id]!.end}`
                      : ""}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatMoney(e.total)}</td>
                {sheet.fullView ? (
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <div className="ml-auto flex w-24 items-center gap-1.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${e.sharePct * 100}%` }} />
                      </div>
                      {pctText(e.sharePct, 0)}
                    </div>
                  </td>
                ) : null}
                <td className="px-3 py-2.5 text-right tabular-nums">{e.daysWorked}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pctText(e.commissionPct, 2)}</td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(e.income)}</td>
                {showProjected ? (
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">≈ {formatMoney(e.projectedIncome)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
          {sheet.fullView && sheet.employees.length > 1 ? (
            <tfoot className="whitespace-nowrap bg-muted/50 text-[13px] font-bold">
              <tr>
                <td className="px-3 py-2">Jami</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(s.done)}</td>
                <td />
                <td />
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totalIncome)}</td>
                {showProjected ? <td className="px-3 py-2 text-right tabular-nums">≈ {formatMoney(totalProjected)}</td> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {showProjected ? (
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Prognoz — hozirgi kunlik sur’at oy oxirigacha saqlansa ({pctText(s.projectedPct)} bajarish,{" "}
          {pctText(s.projectedCommissionPct, 2)} komissiya). Yakuniy daromad oy oxiridagi bajarish foiziga qarab hisoblanadi.
        </p>
      ) : null}
    </section>
  );
}

function TierLegend({ sheet }: { sheet: SavdoSheet }) {
  const s = sheet.summary;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-bold text-foreground">Komissiya pog‘onalari</h3>
      <div className="flex flex-wrap gap-2">
        {sheet.tiers.map((t, i) => {
          const next = sheet.tiers[i + 1];
          const active = s.pct + 1e-9 >= t.from && (!next || s.pct + 1e-9 < next.from);
          return (
            <div
              key={t.from}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs",
                active ? "border-emerald-400 bg-emerald-500/10 ring-2 ring-emerald-400/30" : "border-border bg-muted/40",
              )}
            >
              <div className="font-semibold text-foreground">
                {next ? `${pctText(t.from, 0)} – ${pctText(next.from, 0)}` : `${pctText(t.from, 0)} va yuqori`}
              </div>
              <div className={cn("text-sm font-bold", active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                {pctText(t.pct, 2)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Bajarish % va komissiya % — oylik (kumulyativ) ko‘rsatkich bo‘yicha, kunlik emas.
      </p>
    </section>
  );
}
