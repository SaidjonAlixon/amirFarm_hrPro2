import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  CheckCircle2,
  Medal as MedalIcon,
  Plus,
  RefreshCw,
  Settings2,
  Store,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money-format";
import {
  dayLabel,
  fetchSavdoOverview,
  monthLabel,
  pctText,
  saveSavdoPlan,
  saveSavdoTiers,
  type CommissionTier,
  type SavdoOverview,
  type SavdoOverviewRow,
} from "@/lib/savdo-plan-api";
import { Medal, MoneyInput, PaceBar, Panel, ProgressBar, StatCard, orgRoleLabel, pctTone, som, somShort } from "./shared";

export function AdminOverview({ month, onOpenBranch }: { month: string; onOpenBranch: (id: number) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["savdo-overview", month], queryFn: () => fetchSavdoOverview(month) });
  const [tiersOpen, setTiersOpen] = useState(false);

  const planMut = useMutation({
    mutationFn: (v: { branchId: number; amount: number }) => saveSavdoPlan({ ...v, month }),
    onSuccess: (_r, v) => {
      const name = q.data?.rows.find((r) => r.branchId === v.branchId)?.name;
      toast({ title: "Plan saqlandi ✓", description: `${name} · ${monthLabel(month)}: ${som(v.amount)}` });
      void qc.invalidateQueries({ queryKey: ["savdo-overview"] });
      void qc.invalidateQueries({ queryKey: ["savdo-sheet"] });
    },
    onError: (e: Error) => toast({ title: "Plan saqlanmadi", description: e.message, variant: "destructive" }),
  });

  if (q.isLoading) return <p className="py-16 text-center text-sm text-muted-foreground">Yuklanmoqda…</p>;
  if (q.isError || !q.data) return <p className="py-16 text-center text-sm text-rose-600">{(q.error as Error)?.message}</p>;
  const d = q.data;
  const t = d.totals;
  const current = d.month === d.today.slice(0, 7);
  const timePct = d.rows[0]?.timePct ?? (current ? 0 : 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={Target} tone="brand" label="Jami oylik plan" value={somShort(t.plan)} sub={`Kunlik: ${somShort(t.dailyPlan)} · ${d.rows.length} filial`} />
        <StatCard
          icon={CheckCircle2}
          tone={t.pct >= 1 ? "good" : t.pct >= 0.85 ? "warn" : "bad"}
          label="Bajarildi"
          value={
            <span>
              {somShort(t.done)} <span className={cn("text-sm", pctTone(t.pct).text)}>{t.plan > 0 ? pctText(t.pct) : ""}</span>
            </span>
          }
          sub={t.plan > 0 ? `Qoldi: ${somShort(Math.max(0, t.plan - t.done))}` : "Plan qo‘yilmagan"}
        >
          {t.plan > 0 ? <ProgressBar value={t.pct} className="h-1.5" /> : null}
        </StatCard>
        <StatCard
          icon={CalendarDays}
          label={current ? "Bugungi savdo" : "Oy savdosi"}
          value={somShort(current ? t.todayTotal : t.done)}
          sub={current && t.dailyPlan > 0 ? `Kunlik planning ${pctText(t.todayTotal / t.dailyPlan)}` : undefined}
        />
        <StatCard
          icon={TrendingUp}
          tone="brand"
          label="Kuniga kerak"
          value={t.plan > 0 && current ? somShort(t.neededPerDay) : "—"}
          sub={current ? "Barcha filiallar planni yopishi uchun" : undefined}
        />
        <StatCard
          icon={BadgePercent}
          tone={t.projectedPct >= 1 ? "good" : "warn"}
          label="Oy oxiri prognozi"
          value={t.plan > 0 ? pctText(t.projectedPct) : "—"}
          sub={`≈ ${somShort(t.projected)}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <NetworkForecast data={d} timePct={timePct} current={current} />
        <BranchRanking rows={d.rows} onOpen={onOpenBranch} />
        <TopEmployees data={d} current={current} />
      </div>

      <Panel
        title={`Filiallar kesimida — ${monthLabel(month)}`}
        icon={Store}
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8" onClick={() => setTiersOpen(true)}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Komissiya pog‘onalari
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => void q.refetch()} disabled={q.isFetching}>
              <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} />
            </Button>
          </div>
        }
      >
        <p className="border-b px-4 py-1.5 text-[11px] text-muted-foreground">
          Oylik planni shu yerning o‘zida kiriting — Enter yoki maydondan chiqqanda saqlanadi. O‘tgan kunlarni kiritish uchun filialni oching.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px]">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Filial</th>
                <th className="w-[170px] px-3 py-2 text-right">Oylik plan</th>
                <th className="px-3 py-2 text-right">Bajarildi</th>
                <th className="w-[160px] px-3 py-2 text-left">Bajarish / sur’at</th>
                <th className="px-3 py-2 text-right">{current ? "Bugun" : "O‘rtacha/kun"}</th>
                <th className="px-3 py-2 text-right">Kerak/kun</th>
                <th className="px-3 py-2 text-right">Prognoz</th>
                <th className="px-3 py-2 text-right">Komissiya</th>
                <th className="px-3 py-2 text-left">Oxirgi kiritish</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 whitespace-nowrap">
              {d.rows.map((r) => (
                <tr key={r.branchId} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <p className="font-semibold text-foreground">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.managerName} · {r.sellers} xodim kiritgan
                    </p>
                  </td>
                  <td className="px-3 py-1.5">
                    <MoneyInput
                      value={r.plan || null}
                      placeholder="Plan kiriting"
                      className="h-8 text-xs"
                      disabled={planMut.isPending}
                      onCommit={(amount) => planMut.mutate({ branchId: r.branchId, amount })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(r.done)}</td>
                  <td className="px-3 py-2">
                    {r.plan > 0 ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className={cn("font-bold", pctTone(r.pct).text)}>{pctText(r.pct)}</span>
                          {current ? (
                            <span className={cn(r.paceGap >= 0 ? "text-emerald-600" : "text-rose-600")}>
                              {r.paceGap >= 0 ? "+" : "−"}
                              {somShort(Math.abs(r.paceGap))}
                            </span>
                          ) : null}
                        </div>
                        <PaceBar pct={r.pct} timePct={r.timePct} />
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">plan yo‘q</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(current ? r.todayTotal : r.avgDaily)}
                    {current && r.plan > 0 ? <div className={cn("text-[10px]", pctTone(r.todayPct).text)}>{pctText(r.todayPct)}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.plan > 0 && r.neededPerDay != null ? formatMoney(r.neededPerDay) : "—"}
                    {r.forecastFor && r.plan > 0 ? (
                      <div className="text-[10px] text-muted-foreground">
                        {r.forecastFor === "today" ? "bugun" : "ertaga"} · {r.daysLeft} kun
                      </div>
                    ) : null}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", r.plan > 0 && pctTone(r.projectedPct).text)}>
                    {r.plan > 0 ? pctText(r.projectedPct) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {pctText(r.commissionPct, 2)}
                    {current && r.projectedCommissionPct !== r.commissionPct ? (
                      <div className="text-[10px] text-muted-foreground">→ {pctText(r.projectedCommissionPct, 2)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">
                    {r.lastEntryDate ? (
                      <span className={cn(current && r.lastEntryDate < d.today && "font-semibold text-amber-600 dark:text-amber-400")}>
                        {dayLabel(r.lastEntryDate)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onOpenBranch(r.branchId)}>
                      Ochish
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="whitespace-nowrap bg-muted/50 text-[13px] font-bold">
              <tr>
                <td className="px-3 py-2">Jami tarmoq</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.plan)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.done)}</td>
                <td className={cn("px-3 py-2", pctTone(t.pct).text)}>{t.plan > 0 ? pctText(t.pct) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{current ? formatMoney(t.todayTotal) : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.plan > 0 ? formatMoney(t.neededPerDay) : "—"}</td>
                <td className="px-3 py-2 text-right">{t.plan > 0 ? pctText(t.projectedPct) : "—"}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <TiersDialog open={tiersOpen} onClose={() => setTiersOpen(false)} month={month} tiers={d.tiers} />
    </div>
  );
}

function NetworkForecast({ data, timePct, current }: { data: SavdoOverview; timePct: number; current: boolean }) {
  const t = data.totals;
  const expected = t.plan * timePct;
  const gap = t.done - expected;
  const closed = data.rows.filter((r) => r.plan > 0 && r.pct >= 1).length;
  const near = data.rows.filter((r) => r.plan > 0 && r.projectedPct >= 1).length;
  const noPlan = data.rows.filter((r) => r.plan <= 0).length;
  const stale = current ? data.rows.filter((r) => !r.lastEntryDate || r.lastEntryDate < data.today).length : 0;
  return (
    <Panel title="Tarmoq prognozi" icon={TrendingUp}>
      <div className="space-y-3 p-4">
        {t.plan > 0 ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-foreground">
                {pctText(t.pct)} bajarildi · oyning {pctText(timePct, 0)} o‘tdi
              </span>
              {current ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    gap >= 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                  )}
                >
                  {gap >= 0 ? "Oldinda" : "Orqada"}: {somShort(Math.abs(gap))}
                </span>
              ) : null}
            </div>
            <PaceBar pct={t.pct} timePct={timePct} />
          </div>
        ) : (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Hali hech bir filialga plan qo‘yilmagan — pastdagi jadvalda kiriting.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Mini label="Plan yopilgan" value={`${closed} / ${data.rows.length}`} tone="text-emerald-600 dark:text-emerald-400" />
          <Mini label="Prognozda yopadi" value={`${near} / ${data.rows.length}`} tone="text-primary" />
          <Mini label="Oy oxiri (≈)" value={somShort(t.projected)} />
          <Mini label="Kuniga kerak" value={current && t.plan > 0 ? somShort(t.neededPerDay) : "—"} />
          <Mini label="Plan qo‘yilmagan" value={String(noPlan)} tone={noPlan ? "text-amber-600" : undefined} />
          <Mini label="Bugun kiritmagan" value={current ? String(stale) : "—"} tone={stale ? "text-rose-600" : undefined} />
        </div>
      </div>
    </Panel>
  );
}

function Mini({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("truncate text-sm font-bold tabular-nums text-foreground", tone)}>{value}</p>
    </div>
  );
}

function statusOf(r: SavdoOverviewRow): { text: string; cls: string } {
  if (r.plan <= 0) return { text: "Plan yo‘q", cls: "bg-muted text-muted-foreground" };
  if (r.pct >= 1) return { text: "Yopildi", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
  if (r.projectedPct >= 1) return { text: "Yopishga yaqin", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" };
  if (r.projectedPct >= 0.85) return { text: "Xavf ostida", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
  return { text: "Orqada", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
}

function BranchRanking({ rows, onOpen }: { rows: SavdoOverviewRow[]; onOpen: (id: number) => void }) {
  const ranked = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          Number(b.plan > 0) - Number(a.plan > 0) || b.pct - a.pct || b.projectedPct - a.projectedPct || b.done - a.done,
      ),
    [rows],
  );
  return (
    <Panel title="Planni yopishga yaqin filiallar" icon={Trophy}>
      <ul className="divide-y divide-border/60">
        {ranked.map((r, i) => {
          const st = statusOf(r);
          return (
            <li key={r.branchId}>
              <button
                type="button"
                onClick={() => onOpen(r.branchId)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-muted/40"
              >
                <Medal rank={i + 1} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-foreground">{r.name}</p>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", st.cls)}>{st.text}</span>
                  </div>
                  {r.plan > 0 ? (
                    <>
                      <ProgressBar value={r.pct} className="mt-1 h-1.5" />
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {pctText(r.pct)} · prognoz {pctText(r.projectedPct)} · qoldi {somShort(r.remaining)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Savdo: {somShort(r.done)}</p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function TopEmployees({ data, current }: { data: SavdoOverview; current: boolean }) {
  const list = data.topEmployees.slice(0, 10);
  const max = Math.max(1, ...list.map((e) => e.total));
  return (
    <Panel title="Eng yaxshi savdo qilayotgan xodimlar" icon={MedalIcon}>
      {list.length ? (
        <ul className="divide-y divide-border/60">
          {list.map((e) => (
            <li key={e.employeeId} className="flex items-center gap-3 px-4 py-2">
              <Medal rank={e.rank} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-foreground">{e.fullName}</p>
                  <p className="shrink-0 text-xs font-bold tabular-nums">{somShort(e.total)}</p>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", e.rank === 1 ? "bg-amber-400" : "bg-primary/70")} style={{ width: `${(e.total / max) * 100}%` }} />
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {e.branchName}
                  {e.branches > 1 ? ` +${e.branches - 1}` : ""} · {orgRoleLabel(e.orgRole)} · {somShort(e.avgPerDay)}/kun
                  {current && e.today > 0 ? ` · bugun ${somShort(e.today)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">Bu oy hali savdo kiritilmagan</p>
      )}
    </Panel>
  );
}

function TiersDialog({ open, onClose, month, tiers }: { open: boolean; onClose: () => void; month: string; tiers: CommissionTier[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Array<{ from: string; pct: string }>>([]);
  useEffect(() => {
    if (open) setRows(tiers.map((t) => ({ from: String(+(t.from * 100).toFixed(2)), pct: String(+(t.pct * 100).toFixed(3)) })));
  }, [open, tiers]);

  const mut = useMutation({
    mutationFn: () =>
      saveSavdoTiers({
        month,
        tiers: rows
          .map((r) => ({ from: Number(r.from.replace(",", ".")) / 100, pct: Number(r.pct.replace(",", ".")) / 100 }))
          .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.pct)),
      }),
    onSuccess: () => {
      toast({ title: "Komissiya pog‘onalari saqlandi ✓", description: `${monthLabel(month)} va keyingi oylar uchun` });
      void qc.invalidateQueries({ queryKey: ["savdo-overview"] });
      void qc.invalidateQueries({ queryKey: ["savdo-sheet"] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" }),
  });

  const field =
    "h-9 w-full min-w-0 rounded-lg border border-border bg-background pl-3 pr-7 text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgePercent className="h-4 w-4 text-primary" />
            Komissiya pog‘onalari
          </DialogTitle>
          <DialogDescription>
            Filial oylik planni necha foiz bajarsa, xodimlar savdosidan necha foiz komissiya oladi. {monthLabel(month)} va keyingi
            oylar uchun qo‘llanadi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 text-[11px] font-semibold text-muted-foreground">
            <span>Bajarish (dan)</span>
            <span>Komissiya</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
              <div className="relative min-w-0">
                <input
                  inputMode="decimal"
                  value={r.from}
                  disabled={i === 0}
                  onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                  className={field}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <div className="relative min-w-0">
                <input
                  inputMode="decimal"
                  value={r.pct}
                  onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
                  className={field}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-rose-600"
                disabled={i === 0}
                onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                title="O‘chirish"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setRows((p) => [...p, { from: "", pct: "" }])}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Pog‘ona qo‘shish
          </Button>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Saqlash
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
