import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgePercent,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Info,
  Lock,
  PencilLine,
  RefreshCw,
  Save,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money-format";
import {
  dayLabel,
  dayWithWeekday,
  downloadSavdoExcel,
  weekdayLabel,
  fetchSavdoSheet,
  monthLabel,
  pctText,
  saveSavdoEntries,
  saveSavdoEntriesBulk,
  type SavdoSheet,
  type StaffShift,
} from "@/lib/savdo-plan-api";
import { Medal, MoneyInput, PaceBar, Panel, ProgressBar, StatCard, orgRoleLabel, pctTone, som, somShort } from "./shared";

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
  const planSet = s.plan > 0;
  const [exporting, setExporting] = useState(false);

  const forecastLabel =
    s.forecastFor === "today" ? "Bugun kerak" : s.forecastFor === "tomorrow" ? "Ertaga kerak" : "Kuniga kerak";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-foreground">{sheet.branch.name}</h2>
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
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {monthLabel(month)} uchun filial plani hali qo‘yilmagan. Savdoni kiritaverishingiz mumkin — plan qo‘yilgach foiz va
            komissiya avtomatik hisoblanadi.
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={Target}
          tone="brand"
          label="Oylik plan"
          value={planSet ? somShort(s.plan) : "—"}
          sub={planSet ? `Kunlik: ${som(s.dailyPlan)}` : "Admin plan qo‘yadi"}
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
          sub={planSet ? (s.remaining > 0 ? `Qoldi: ${somShort(s.remaining)}` : "Plan bajarildi 🎉") : `${s.daysWithData} kun savdo`}
        >
          {planSet ? <ProgressBar value={s.pct} className="h-1.5" /> : null}
        </StatCard>
        <StatCard
          icon={CalendarDays}
          tone={s.todayPct >= 1 ? "good" : s.todayTotal > 0 ? "warn" : "default"}
          label={s.status === "current" ? "Bugungi savdo" : "O‘rtacha kunlik"}
          value={s.status === "current" ? somShort(s.todayTotal) : somShort(s.avgDaily)}
          sub={
            s.status === "current"
              ? planSet
                ? `Kunlik planning ${pctText(s.todayPct)}`
                : "Bugun kiritilgan"
              : `${s.daysWithData} kun o‘rtachasi`
          }
        />
        <StatCard
          icon={TrendingUp}
          tone={s.neededPerDay != null && planSet && s.neededPerDay > s.dailyPlan * 1.15 ? "bad" : "brand"}
          label={s.status === "past" ? "Oy yakuni" : forecastLabel}
          value={s.status === "past" ? pctText(s.pct) : planSet && s.neededPerDay != null ? somShort(s.neededPerDay) : "—"}
          sub={s.status === "current" && planSet ? `${s.daysLeft} kun qoldi` : s.status === "past" ? som(s.done) : undefined}
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
          sub="Oylik bajarish % bo‘yicha"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ForecastPanel sheet={sheet} className="xl:col-span-2" />
        <RankingPanel sheet={sheet} />
      </div>

      <EntryPanel sheet={sheet} month={month} />

      <DailyChart sheet={sheet} />

      <DailyTable sheet={sheet} month={month} />

      <IncomeTable sheet={sheet} />
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("truncate text-sm font-bold tabular-nums text-foreground", tone)}>{value}</p>
      {sub ? <p className="truncate text-[10px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ForecastPanel({ sheet, className }: { sheet: SavdoSheet; className?: string }) {
  const s = sheet.summary;
  const planSet = s.plan > 0;
  const ahead = s.paceGap >= 0;
  return (
    <Panel title="Prognoz va sur’at" icon={TrendingUp} className={className}>
      <div className="space-y-3 p-4">
        {planSet ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-foreground">
                Bajarildi {pctText(s.pct)} · oyning {pctText(s.timePct, 0)} o‘tdi
              </span>
              {s.status !== "future" ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    ahead ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                  )}
                >
                  {ahead ? "Plandan oldinda" : "Plandan orqada"}: {somShort(Math.abs(s.paceGap))}
                </span>
              ) : null}
            </div>
            <PaceBar pct={s.pct} timePct={s.timePct} />
            <p className="text-[10px] text-muted-foreground">Qora chiziq — shu kungacha bajarilishi kerak bo‘lgan qism.</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Metric
            label={s.forecastFor === "today" ? "Bugun sotish kerak" : s.forecastFor === "tomorrow" ? "Ertaga sotish kerak" : "Kuniga kerak"}
            value={planSet && s.neededPerDay != null ? som(s.neededPerDay) : "—"}
            sub={s.status === "current" ? `${s.daysLeft} kun qoldi${s.forecastDate ? ` · ${dayLabel(s.forecastDate)}` : ""}` : undefined}
            tone={planSet && s.neededPerDay != null && s.neededPerDay > s.dailyPlan * 1.15 ? "text-rose-600 dark:text-rose-400" : undefined}
          />
          <Metric
            label="Oy oxiri prognozi"
            value={s.status === "future" ? "—" : som(s.projected)}
            sub={planSet && s.status !== "future" ? `${pctText(s.projectedPct)} bajarish` : "Hozirgi sur’at bo‘yicha"}
            tone={planSet ? pctTone(s.projectedPct).text : undefined}
          />
          <Metric
            label="Prognoz komissiya"
            value={pctText(s.projectedCommissionPct, 2)}
            sub={`Hozir: ${pctText(s.commissionPct, 2)}`}
          />
          <Metric
            label="Keyingi pog‘ona"
            value={s.nextTier && planSet ? som(s.nextTier.needAmount) : "Eng yuqori"}
            sub={s.nextTier && planSet ? `${pctText(s.nextTier.from, 0)} → ${pctText(s.nextTier.pct, 2)} komissiya` : undefined}
          />
          <Metric
            label="Plandan yuqori kunlar"
            value={planSet ? `${s.daysAbovePlan} / ${s.daysWithData}` : "—"}
            sub={`O‘rtacha: ${som(s.avgDaily)}`}
          />
          <Metric
            label="Eng yaxshi kun"
            value={s.bestDay ? som(s.bestDay.total) : "—"}
            sub={s.bestDay ? dayLabel(s.bestDay.date) : undefined}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Komissiya:</span>
          {sheet.tiers.map((t, i) => {
            const next = sheet.tiers[i + 1];
            const active = s.pct + 1e-9 >= t.from && (!next || s.pct + 1e-9 < next.from);
            return (
              <span
                key={t.from}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px]",
                  active
                    ? "border-emerald-400 bg-emerald-500/10 font-bold text-emerald-700 dark:text-emerald-300"
                    : "border-border text-muted-foreground",
                )}
              >
                {next ? `${pctText(t.from, 0)}–${pctText(next.from, 0)}` : `${pctText(t.from, 0)}+`}: {pctText(t.pct, 2)}
              </span>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function RankingPanel({ sheet }: { sheet: SavdoSheet }) {
  const s = sheet.summary;
  if (!sheet.fullView) {
    const me = sheet.employees[0];
    return (
      <Panel title="Mening natijam" icon={Trophy}>
        {me ? (
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              {me.rank > 0 ? <Medal rank={me.rank} /> : null}
              <div>
                <p className="text-sm font-bold text-foreground">
                  {me.rank > 0 ? `Filialda ${me.rank}-o‘rin` : "Hali savdo kiritilmagan"}
                </p>
                {me.rank > 0 ? <p className="text-[11px] text-muted-foreground">{sheet.sellersCount} xodim ichida</p> : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Oylik savdom" value={som(me.total)} sub={`Filialdagi ulushim: ${pctText(me.sharePct, 0)}`} />
              <Metric label="O‘rtacha kunlik" value={som(me.avgPerDay)} sub={`${me.daysWorked} kun`} />
              <Metric label="Eng yaxshi kunim" value={me.bestDay ? som(me.bestDay.amount) : "—"} sub={me.bestDay ? dayLabel(me.bestDay.date) : undefined} />
              <Metric label="Daromadim (hozir)" value={som(me.income)} sub={`Komissiya ${pctText(me.commissionPct, 2)}`} tone="text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        ) : (
          <p className="p-4 text-xs text-muted-foreground">Ma’lumot yo‘q</p>
        )}
      </Panel>
    );
  }
  const list = [...sheet.employees].sort((a, b) => (a.rank || 999) - (b.rank || 999) || a.fullName.localeCompare(b.fullName));
  const max = Math.max(1, ...list.map((e) => e.total));
  return (
    <Panel title="Xodimlar reytingi" icon={Trophy} right={<span className="text-[11px] text-muted-foreground">{monthLabel(s.month)}</span>}>
      <ul className="divide-y divide-border/60">
        {list.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2">
            {e.rank > 0 ? <Medal rank={e.rank} /> : <span className="h-6 w-6 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-xs font-semibold text-foreground">{e.fullName}</p>
                <p className="shrink-0 text-xs font-bold tabular-nums text-foreground">{somShort(e.total)}</p>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", e.rank === 1 ? "bg-amber-400" : "bg-primary/70")} style={{ width: `${(e.total / max) * 100}%` }} />
              </div>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {pctText(e.sharePct, 0)} ulush · o‘rtacha {somShort(e.avgPerDay)}/kun · {e.daysWorked} kun
                {sheet.shifts[e.id] ? ` · ${sheet.shifts[e.id]!.label}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
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
  const previewTotal = sheet.fullView
    ? othersOnDay + enteredSum
    : (day?.total ?? 0) - (day?.byEmployee[sheet.viewerEmployeeId ?? -1] ?? 0) + enteredSum;
  const previewPct = s.dailyPlan > 0 ? previewTotal / s.dailyPlan : 0;
  const dirty = rows.some((r) => (values[r.id] ?? 0) !== (day?.byEmployee[r.id] ?? 0));

  const locked = !date || !rows.length;
  const lockedText = !rows.length
    ? "Siz uchun savdo kiritish ruxsati yo‘q."
    : s.status === "future"
      ? "Bu oy hali boshlanmagan."
      : "O‘tgan kunlar savdosini o‘zgartirib bo‘lmaydi. Xato bo‘lsa — admin bilan bog‘laning.";

  return (
    <section className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 via-card to-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Wallet className="h-4 w-4 text-primary" />
            {isAdmin ? "Kun bo‘yicha savdo kiritish" : "Bugungi savdoni kiritish"}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isAdmin
              ? "Sanani tanlab, shu kun savdosini kiriting. Butun oyni birdan kiritish uchun pastdagi jadvalda «Jadvalni tahrirlash»ni bosing."
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
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          {lockedText}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((r) => (
              <label
                key={r.id}
                className={cn("flex flex-col gap-1.5 rounded-lg border bg-card p-2.5", r.isSelf ? "border-primary/40" : "border-border")}
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
                  className="h-9"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
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

function DailyChart({ sheet }: { sheet: SavdoSheet }) {
  const s = sheet.summary;
  const max = Math.max(s.dailyPlan, ...sheet.days.map((d) => d.total), 1);
  const planTop = s.dailyPlan > 0 ? 100 - (s.dailyPlan / max) * 100 : null;
  return (
    <Panel
      title="Kunlik dinamika"
      icon={CalendarDays}
      right={
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Plandan yuqori</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Plandan past</span>
          {planTop != null ? <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-primary" /> Kunlik plan</span> : null}
        </div>
      }
    >
      <div className="px-4 pb-3 pt-4">
        <div className="relative h-32">
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
      </div>
    </Panel>
  );
}

/** «Gulsharafat Koshjanova» → «Gulsharafat K.» */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0]} ${parts[1]!.charAt(0).toUpperCase()}.`;
}

type Draft = Record<string, number | null>;
const dkey = (date: string, id: number) => `${date}|${id}`;

function DailyTable({ sheet, month }: { sheet: SavdoSheet; month: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const s = sheet.summary;
  const self = sheet.viewerEmployeeId;
  const cols = sheet.fullView ? sheet.employees : sheet.employees.filter((e) => e.id === self);
  const canGrid = sheet.editAnyDate && s.status !== "future" && cols.length > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({});

  useEffect(() => {
    setEditing(false);
    setDraft({});
  }, [sheet.branch.id, month]);

  const editableDay = (date: string) => editing && date <= sheet.today;
  const cellValue = (date: string, id: number, original: number | undefined) => {
    const k = dkey(date, id);
    return k in draft ? draft[k] ?? null : original ?? null;
  };

  const changes = useMemo(() => {
    const out: Array<{ employeeId: number; date: string; amount: number }> = [];
    for (const [k, v] of Object.entries(draft)) {
      const [date, idRaw] = k.split("|");
      const id = Number(idRaw);
      const original = sheet.days.find((d) => d.date === date)?.byEmployee[id] ?? 0;
      if ((v ?? 0) !== original) out.push({ employeeId: id, date: date!, amount: v ?? 0 });
    }
    return out;
  }, [draft, sheet.days]);

  const bulk = useMutation({
    mutationFn: () => saveSavdoEntriesBulk({ branchId: sheet.branch.id, items: changes }),
    onSuccess: (r) => {
      toast({ title: "Jadval saqlandi ✓", description: `${r.saved} ta katak yangilandi` });
      setDraft({});
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["savdo-sheet"] });
      void qc.invalidateQueries({ queryKey: ["savdo-overview"] });
    },
    onError: (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" }),
  });

  const visibleDays = editing ? sheet.days.filter((d) => d.date <= sheet.today) : sheet.days.filter((d) => !d.isFuture || d.hasData);
  const cell = "whitespace-nowrap px-3 py-2 text-center tabular-nums";

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const box = scrollRef.current;
    const row = todayRowRef.current;
    if (!box || !row) return;
    box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight + row.offsetHeight * 3);
  }, [sheet.branch.id, month, editing]);

  return (
    <Panel
      title="Kundalik savdo jadvali"
      icon={CalendarDays}
      center={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-sky-500 px-3.5 py-1 text-xs font-semibold text-white shadow-sm">
          <CalendarDays className="h-3.5 w-3.5" />
          Bugun: {dayWithWeekday(sheet.today)}
        </span>
      }
      right={
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {sheet.fullView ? "Har bir xodim alohida" : "Siz va filial jami"}
          </span>
          {canGrid ? (
            editing ? (
              <>
                <span className="text-[11px] font-semibold text-primary">{changes.length} o‘zgarish</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setDraft({});
                    setEditing(false);
                  }}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Bekor
                </Button>
                <Button size="sm" className="h-8" disabled={!changes.length || bulk.isPending} onClick={() => bulk.mutate()}>
                  {bulk.isPending ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                  Hammasini saqlash
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(true)}>
                <PencilLine className="mr-1 h-3.5 w-3.5" />
                Jadvalni tahrirlash
              </Button>
            )
          ) : null}
        </div>
      }
    >
      {editing ? (
        <p className="border-b bg-primary/5 px-4 py-2 text-[11px] text-primary">
          Jadval rejimi: istalgan o‘tgan kun va xodim katagiga summa yozing, 0 — o‘chiradi. Oxirida «Hammasini saqlash»ni bosing.
        </p>
      ) : null}
      {/* maxHeight qator balandligi (tr h-12 = 48px) bilan bog‘liq: 15 kun + sarlavha + jami */}
      <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: 44 + 15 * 48 + 42 }}>
        <table className="w-full min-w-[960px] text-[13px]">
          <thead className="sticky top-0 z-10 whitespace-nowrap bg-muted/90 text-[11px] font-semibold text-muted-foreground backdrop-blur">
            <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-center">
              <th className="sticky left-0 bg-muted/90 !text-left">Kun</th>
              {cols.map((e) => (
                <th key={e.id} title={e.fullName} className="text-foreground">
                  {e.id === self ? "Mening savdom" : shortName(e.fullName)}
                </th>
              ))}
              <th>Kunlik jami</th>
              <th>Kunlik plan</th>
              <th>Farq</th>
              <th>Kun %</th>
              <th>Kumulyativ</th>
              <th>Oylik %</th>
              <th>Komissiya</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {visibleDays.map((d) => {
              const editRow = editableDay(d.date);
              const total = editRow
                ? cols.reduce((sum, e) => sum + (cellValue(d.date, e.id, d.byEmployee[e.id]) ?? 0), 0) +
                  Object.entries(d.byEmployee).reduce((sum, [id, v]) => sum + (cols.some((c) => c.id === Number(id)) ? 0 : v), 0)
                : d.total;
              const diff = total - d.dailyPlan;
              return (
                <tr
                  key={d.date}
                  ref={d.isToday ? todayRowRef : undefined}
                  className={cn("h-12", d.isToday && "bg-primary/5", !d.hasData && !editRow && "text-muted-foreground")}
                >
                  <td className={cn("sticky left-0 whitespace-nowrap bg-card px-3 py-1.5 text-left", d.isToday && "bg-primary/5")}>
                    <div className="text-[13px] font-semibold leading-tight text-sky-700 dark:text-sky-300">{dayLabel(d.date)}</div>
                    <div className="flex items-center gap-1.5 text-[11px] leading-tight text-violet-600 dark:text-violet-300">
                      {weekdayLabel(d.date)}
                      {d.isToday ? (
                        <span className="rounded-full bg-primary px-1.5 py-px text-[9px] font-semibold text-primary-foreground">bugun</span>
                      ) : null}
                    </div>
                  </td>
                  {cols.map((e) =>
                    editRow ? (
                      <td key={e.id} className="px-1.5 py-1">
                        <MoneyInput
                          value={cellValue(d.date, e.id, d.byEmployee[e.id])}
                          onChange={(n) => setDraft((p) => ({ ...p, [dkey(d.date, e.id)]: n }))}
                          placeholder="—"
                          className={cn(
                            "h-8 min-w-[110px] px-2 text-center text-xs",
                            dkey(d.date, e.id) in draft &&
                              (draft[dkey(d.date, e.id)] ?? 0) !== (d.byEmployee[e.id] ?? 0) &&
                              "border-primary bg-primary/5",
                          )}
                        />
                      </td>
                    ) : (
                      <td key={e.id} className={cell}>
                        {d.byEmployee[e.id] != null ? formatMoney(d.byEmployee[e.id]!) : "—"}
                      </td>
                    ),
                  )}
                  <td className={cn(cell, "font-semibold text-foreground")}>{total > 0 ? formatMoney(total) : "—"}</td>
                  <td className={cell}>{s.dailyPlan > 0 ? formatMoney(d.dailyPlan) : "—"}</td>
                  <td
                    className={cn(
                      cell,
                      "font-semibold",
                      total > 0 && s.dailyPlan > 0 && (diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"),
                    )}
                  >
                    {total > 0 && s.dailyPlan > 0 ? `${diff > 0 ? "+" : ""}${formatMoney(diff)}` : "—"}
                  </td>
                  <td className={cn(cell, total > 0 && pctTone(s.dailyPlan > 0 ? total / s.dailyPlan : 0).text)}>
                    {total > 0 && s.dailyPlan > 0 ? pctText(total / s.dailyPlan) : "—"}
                  </td>
                  <td className={cell}>{d.cumulative > 0 ? formatMoney(d.cumulative) : "—"}</td>
                  <td className={cn(cell, "font-semibold")}>{s.plan > 0 ? pctText(d.monthPct) : "—"}</td>
                  <td className={cell}>{pctText(d.commissionPct, 2)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted/90 text-[13px] font-bold backdrop-blur">
            <tr>
              <td className="sticky left-0 bg-muted/90 px-3 py-2 text-left">Jami</td>
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
    </Panel>
  );
}

function IncomeTable({ sheet }: { sheet: SavdoSheet }) {
  const s = sheet.summary;
  if (!sheet.employees.length) return null;
  const totalIncome = sheet.employees.reduce((sum, e) => sum + e.income, 0);
  const totalProjected = sheet.employees.reduce((sum, e) => sum + e.projectedIncome, 0);
  const showProjected = s.status === "current";
  return (
    <Panel
      title={sheet.fullView ? "Xodimlarning oylik daromadi" : "Mening daromadim"}
      icon={Wallet}
      right={
        <span className="hidden text-[11px] text-muted-foreground md:inline">
          Daromad = xodim savdosi × filial komissiyasi ({pctText(s.commissionPct, 2)})
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Xodim</th>
              <th className="px-3 py-2 text-right">Jami savdo (oy)</th>
              {sheet.fullView ? <th className="px-3 py-2 text-right">Ulushi</th> : null}
              <th className="px-3 py-2 text-right">Kunlar</th>
              <th className="px-3 py-2 text-right">O‘rtacha/kun</th>
              <th className="px-3 py-2 text-right">Komissiya %</th>
              <th className="px-3 py-2 text-right">{s.status === "past" ? "Oylik daromad" : "Hozirgi daromad"}</th>
              {showProjected ? <th className="px-3 py-2 text-right">Prognoz (oy oxiri)</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 whitespace-nowrap">
            {sheet.employees.map((e) => (
              <tr key={e.id} className={cn(e.id === sheet.viewerEmployeeId && "bg-primary/5")}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    {sheet.fullView && e.rank === 1 ? <Trophy className="h-3.5 w-3.5 text-amber-500" /> : null}
                    {e.fullName}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {orgRoleLabel(e.orgRole)}
                    {sheet.shifts[e.id] ? ` · ${sheet.shifts[e.id]!.label} ${sheet.shifts[e.id]!.start}–${sheet.shifts[e.id]!.end}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(e.total)}</td>
                {sheet.fullView ? (
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="ml-auto flex w-24 items-center gap-1.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${e.sharePct * 100}%` }} />
                      </div>
                      {pctText(e.sharePct, 0)}
                    </div>
                  </td>
                ) : null}
                <td className="px-3 py-2 text-right tabular-nums">{e.daysWorked}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(e.avgPerDay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pctText(e.commissionPct, 2)}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(e.income)}</td>
                {showProjected ? <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">≈ {formatMoney(e.projectedIncome)}</td> : null}
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
          Prognoz — hozirgi sur’at saqlansa ({pctText(s.projectedPct)} bajarish, {pctText(s.projectedCommissionPct, 2)} komissiya).
          Yakuniy daromad oy oxiridagi bajarish foiziga qarab hisoblanadi.
        </p>
      ) : null}
    </Panel>
  );
}
