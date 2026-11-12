import { useEffect, useState } from "react";
import { Download, ExternalLink, FileDown, Loader2, MapPin, QrCode } from "lucide-react";
import { Button } from "../ui/button";
import { useToast } from "../../hooks/use-toast";
import { cn } from "../../lib/utils";
import {
  downloadLokatsiyaBotQrPdf,
  downloadLokatsiyaBotQrPng,
  LOKATSIYA_BOT_HANDLE,
  LOKATSIYA_BOT_URL,
  lokatsiyaBotQrPngDataUrl,
} from "../../lib/lokatsiya-bot-qr";

type Props = {
  className?: string;
  /** Admin sahifada biroz kengroq joy */
  compact?: boolean;
};

export default function LokatsiyaBotQrCard({ className, compact }: Props) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = await lokatsiyaBotQrPngDataUrl(720);
        if (!cancelled) setPreview(url);
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runDownload = async (kind: "png" | "pdf") => {
    setBusy(kind);
    try {
      if (kind === "png") await downloadLokatsiyaBotQrPng();
      else await downloadLokatsiyaBotQrPdf();
      toast({
        title: kind === "png" ? "PNG yuklandi" : "PDF yuklandi",
        description: "Chop etish yoki mijozlarga yuborish uchun tayyor.",
      });
    } catch (err) {
      toast({
        title: "Yuklab bo‘lmadi",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-[#0b5fff]/20 bg-gradient-to-br from-slate-50 via-white to-sky-50 shadow-sm",
        className,
      )}
    >
      <div
        className={cn(
          "grid items-center gap-5 p-4 sm:p-5",
          compact ? "lg:grid-cols-[minmax(0,1fr)_220px]" : "md:grid-cols-[minmax(0,1.1fr)_minmax(200px,260px)]",
        )}
      >
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#0b5fff]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#0b5fff] ring-1 ring-[#0b5fff]/15">
            <MapPin className="h-3.5 w-3.5" />
            Mijozlar uchun lokatsiya bot
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#0a2540] sm:text-xl">
              Zamonaviy QR kod
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600">
              Skaner qilinganda Telegramda <span className="font-semibold text-[#0b5fff]">{LOKATSIYA_BOT_HANDLE}</span>{" "}
              ochiladi — filial nomi, raqam, ish vaqti va joylashuv.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-10 gap-2 bg-[#0b5fff] text-white hover:bg-[#0a4fd6]"
              disabled={busy !== null}
              onClick={() => void runDownload("png")}
            >
              {busy === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PNG yuklab olish
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 border-[#0a2540]/20 text-[#0a2540]"
              disabled={busy !== null}
              onClick={() => void runDownload("pdf")}
            >
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              PDF yuklab olish
            </Button>
            <Button type="button" variant="ghost" className="h-10 gap-2 text-[#0b5fff]" asChild>
              <a href={LOKATSIYA_BOT_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Botni ochish
              </a>
            </Button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[260px]">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-[#041022] p-2 shadow-md ring-1 ring-[#0b5fff]/20">
            {preview ? (
              <img
                src={preview}
                alt="Amir Farm lokatsiya bot QR"
                className="aspect-square w-full rounded-xl object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-[#071a33] text-sky-200/80">
                <div className="flex flex-col items-center gap-2 text-sm">
                  <QrCode className="h-8 w-8 animate-pulse" />
                  <span>QR chizilmoqda…</span>
                </div>
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
            To‘liq sifatda yuklab oling — chop etish uchun
          </p>
        </div>
      </div>
    </section>
  );
}
