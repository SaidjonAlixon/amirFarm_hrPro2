import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LineChart, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { canManageSavdoPlan } from "@/lib/roles";
import { currentMonthKey, fetchSavdoContext } from "@/lib/savdo-plan-api";
import { AdminOverview } from "./AdminOverview";
import { BranchSheet } from "./BranchSheet";
import { MonthSwitcher } from "./shared";

export default function SavdoPlanPage() {
  const { user } = useAuth();
  const isAdmin = canManageSavdoPlan(user?.role);
  const [month, setMonth] = useState(currentMonthKey());
  const [branchId, setBranchId] = useState<number | null>(null);

  const ctx = useQuery({ queryKey: ["savdo-context", month], queryFn: () => fetchSavdoContext(month) });
  const maxMonth = currentMonthKey();

  useEffect(() => {
    if (isAdmin || !ctx.data) return;
    if (branchId == null || !ctx.data.branches.some((b) => b.id === branchId)) {
      setBranchId(ctx.data.defaultBranchId);
    }
  }, [ctx.data, isAdmin, branchId]);

  const branches = ctx.data?.branches ?? [];
  const openBranch = branches.find((b) => b.id === branchId);

  return (
    <div className="w-full space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <LineChart className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">Savdo plan</h1>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Filiallar kesimida oylik plan, bajarilish, prognoz va xodimlar komissiyasi"
                : "Filialingiz oylik plani, kunlik savdo va komissiyangiz"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && branchId != null ? (
            <Button variant="outline" size="sm" onClick={() => setBranchId(null)}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Barcha filiallar
            </Button>
          ) : null}
          <MonthSwitcher month={month} onChange={setMonth} max={isAdmin ? undefined : maxMonth} />
        </div>
      </div>

      {!isAdmin && branches.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBranchId(b.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                b.id === branchId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
              )}
            >
              <Store className="h-3.5 w-3.5" />
              {b.name}
            </button>
          ))}
        </div>
      ) : null}

      {ctx.isLoading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : ctx.isError ? (
        <p className="py-16 text-center text-sm text-rose-600">{(ctx.error as Error).message}</p>
      ) : isAdmin ? (
        branchId != null ? (
          <BranchSheet branchId={branchId} month={month} />
        ) : (
          <AdminOverview month={month} onOpenBranch={setBranchId} />
        )
      ) : openBranch ? (
        <BranchSheet branchId={openBranch.id} month={month} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Store className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">Siz hech qaysi filialga biriktirilmagansiz</p>
          <p className="mt-1 text-xs text-muted-foreground">Savdo plan ko‘rinishi uchun HR yoki admin sizni filialga biriktirishi kerak.</p>
        </div>
      )}
    </div>
  );
}
