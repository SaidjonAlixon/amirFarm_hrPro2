import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatMoneyInput, parseMoney } from "@/lib/money-format";
import { monthLabel, shiftMonth } from "@/lib/savdo-plan-api";

export function som(n: number | null | undefined): string {
  return `${formatMoney(Number(n) || 0)} so‘m`;
}

/** Katta summalar kartalarda qisqa: 476.1 mln */
export function somShort(n: number | null | undefined): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")} mlrd`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")} mln`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)} ming`;
  return formatMoney(v);
}

export function pctTone(pct: number) {
  if (pct >= 1) return { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", soft: "bg-emerald-500/10" };
  if (pct >= 0.85) return { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500", soft: "bg-amber-500/10" };
  return { text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500", soft: "bg-rose-500/10" };
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const tone = pctTone(value);
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all", tone.bar)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export function MoneyInput({
  value,
  onChange,
  onCommit,
  disabled,
  placeholder,
  className,
  autoFocus,
}: {
  value: number | null;
  onChange?: (n: number | null) => void;
  onCommit?: (n: number) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [txt, setTxt] = useState(value == null ? "" : formatMoney(value));
  useEffect(() => {
    setTxt(value == null ? "" : formatMoney(value));
  }, [value]);
  return (
    <input
      inputMode="numeric"
      autoFocus={autoFocus}
      disabled={disabled}
      value={txt}
      placeholder={placeholder ?? "0"}
      onChange={(e) => {
        const next = formatMoneyInput(e.target.value.replace(/-/g, ""));
        setTxt(next);
        onChange?.(next ? parseMoney(next) : null);
      }}
      onBlur={() => {
        if (onCommit && txt !== (value == null ? "" : formatMoney(value))) onCommit(parseMoney(txt));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-background px-3 text-right text-sm font-semibold tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}

export function MonthSwitcher({
  month,
  onChange,
  max,
}: {
  month: string;
  onChange: (m: string) => void;
  max?: string;
}) {
  const nextDisabled = Boolean(max && month >= max);
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onChange(shiftMonth(month, -1))} title="Oldingi oy">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[120px] text-center text-sm font-semibold text-foreground">{monthLabel(month)}</span>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        disabled={nextDisabled}
        onClick={() => onChange(shiftMonth(month, 1))}
        title="Keyingi oy"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "brand";
  children?: React.ReactNode;
}) {
  const toneCls = {
    default: "bg-muted text-muted-foreground",
    brand: "bg-primary/10 text-primary",
    good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bad: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={cn("rounded-lg p-1.5", toneCls)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums text-foreground">{value}</div>
      {sub ? <div className="text-[11px] leading-snug text-muted-foreground">{sub}</div> : null}
      {children}
    </div>
  );
}

export function orgRoleLabel(org: string | null) {
  if (org === "manager") return "Mudir";
  if (org === "pharmacist") return "Farmasevt";
  if (org === "intern") return "Stajyor";
  return "Xodim";
}
