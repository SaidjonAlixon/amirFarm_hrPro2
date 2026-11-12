/**
 * Amir Farm lokatsiya bot — zamonaviy brendlangan QR poster (PNG / PDF).
 * Oddiy qora-oq emas: gradient nuqtalar, yumaloq ko‘zlar, logo markazda.
 * To‘liq poster: header + QR + @username + skaner matni.
 */

import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { downloadDataUrl } from "./qr-render";

export const LOKATSIYA_BOT_USERNAME = "Amir_pharmacy_filyallarbot";
export const LOKATSIYA_BOT_URL = `https://t.me/${LOKATSIYA_BOT_USERNAME}`;
export const LOKATSIYA_BOT_HANDLE = `@${LOKATSIYA_BOT_USERNAME}`;

const COLOR_NAVY = "#071a33";
const COLOR_BLUE = "#0b5fff";
const COLOR_SKY = "#38bdf8";
const COLOR_INK = "#0a2540";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function isFinderCell(row: number, col: number, size: number): boolean {
  const inTL = row < 7 && col < 7;
  const inTR = row < 7 && col >= size - 7;
  const inBL = row >= size - 7 && col < 7;
  return inTL || inTR || inBL;
}

function drawFinder(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  cell: number,
  grad: CanvasGradient,
) {
  const s = cell * 7;
  const pad = cell * 0.12;
  roundRect(ctx, ox + pad, oy + pad, s - pad * 2, s - pad * 2, cell * 1.1);
  ctx.fillStyle = grad;
  ctx.fill();

  roundRect(ctx, ox + cell, oy + cell, cell * 5, cell * 5, cell * 0.85);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  roundRect(ctx, ox + cell * 2, oy + cell * 2, cell * 3, cell * 3, cell * 0.7);
  ctx.fillStyle = grad;
  ctx.fill();
}

/**
 * To‘liq poster: header + stylized QR + @username + skaner matni.
 * Portrait 4:5 — pastki matn hech qachon kesilmaydi.
 */
export async function renderLokatsiyaBotQrPoster(
  width = 1080,
  logoUrl = `${import.meta.env.BASE_URL}amirfarm-icon.png`,
): Promise<HTMLCanvasElement> {
  const W = Math.round(width);
  const H = Math.round(W * 1.28);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas ishlamaydi");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#041022");
  bg.addColorStop(0.5, COLOR_NAVY);
  bg.addColorStop(1, "#0b3a6e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const orb1 = ctx.createRadialGradient(W * 0.18, H * 0.1, 0, W * 0.18, H * 0.1, W * 0.4);
  orb1.addColorStop(0, "rgba(56,189,248,0.3)");
  orb1.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = orb1;
  ctx.fillRect(0, 0, W, H);

  const orb2 = ctx.createRadialGradient(W * 0.88, H * 0.88, 0, W * 0.88, H * 0.88, W * 0.45);
  orb2.addColorStop(0, "rgba(11,95,255,0.38)");
  orb2.addColorStop(1, "rgba(11,95,255,0)");
  ctx.fillStyle = orb2;
  ctx.fillRect(0, 0, W, H);

  const sidePad = W * 0.07;
  let y = H * 0.055;

  // Header
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(W * 0.052)}px "Segoe UI", "Noto Sans", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("AMIR FARM", W / 2, y);
  y += W * 0.06;

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `700 ${Math.round(W * 0.03)}px "Segoe UI", "Noto Sans", Arial, sans-serif`;
  ctx.fillText("LOKATSIYA BOT", W / 2, y);
  y += W * 0.042;

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 ${Math.round(W * 0.022)}px "Segoe UI", "Noto Sans", Arial, sans-serif`;
  ctx.fillText("Filial · raqam · ish vaqti · joylashuv", W / 2, y);
  y += W * 0.055;

  // Footer reserve — @username + hint + line
  const footerReserve = W * 0.2;
  const cardBottomLimit = H - footerReserve;
  const cardMax = Math.min(W - sidePad * 2, cardBottomLimit - y);
  const cardSize = Math.floor(cardMax);
  const cardX = (W - cardSize) / 2;
  const cardY = y;

  roundRect(ctx, cardX, cardY, cardSize, cardSize, W * 0.045);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = W * 0.035;
  ctx.shadowOffsetY = W * 0.01;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const innerPad = cardSize * 0.08;
  const qrArea = cardSize - innerPad * 2;
  const qrX = cardX + innerPad;
  const qrY = cardY + innerPad;

  const qrData = QRCode.create(LOKATSIYA_BOT_URL, { errorCorrectionLevel: "H" });
  const modules = qrData.modules;
  const n = modules.size;
  const cell = qrArea / n;

  const moduleGrad = ctx.createLinearGradient(qrX, qrY, qrX + qrArea, qrY + qrArea);
  moduleGrad.addColorStop(0, COLOR_BLUE);
  moduleGrad.addColorStop(0.55, "#0a4fd6");
  moduleGrad.addColorStop(1, COLOR_INK);

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!modules.get(r, c) || isFinderCell(r, c, n)) continue;
      const x = qrX + c * cell;
      const yy = qrY + r * cell;
      const gap = cell * 0.18;
      roundRect(ctx, x + gap / 2, yy + gap / 2, cell - gap, cell - gap, cell * 0.28);
      ctx.fillStyle = moduleGrad;
      ctx.fill();
    }
  }

  drawFinder(ctx, qrX, qrY, cell, moduleGrad);
  drawFinder(ctx, qrX + (n - 7) * cell, qrY, cell, moduleGrad);
  drawFinder(ctx, qrX, qrY + (n - 7) * cell, cell, moduleGrad);

  const logo = await loadImage(logoUrl);
  const badge = qrArea * 0.22;
  const bx = qrX + (qrArea - badge) / 2;
  const by = qrY + (qrArea - badge) / 2;

  ctx.beginPath();
  ctx.arc(bx + badge / 2, by + badge / 2, badge / 2 + cell * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(bx + badge / 2, by + badge / 2, badge / 2 + cell * 0.12, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(11,95,255,0.35)";
  ctx.lineWidth = cell * 0.18;
  ctx.stroke();

  if (logo) {
    const inset = badge * 0.14;
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx + badge / 2, by + badge / 2, badge / 2 - inset * 0.2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, bx + inset, by + inset, badge - inset * 2, badge - inset * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = COLOR_BLUE;
    ctx.font = `800 ${Math.round(badge * 0.28)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AF", bx + badge / 2, by + badge / 2);
  }

  // Footer — always inside canvas
  let footY = cardY + cardSize + W * 0.04;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(W * 0.036)}px "Segoe UI", "Noto Sans", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(LOKATSIYA_BOT_HANDLE, W / 2, footY);
  footY += W * 0.048;

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `600 ${Math.round(W * 0.024)}px "Segoe UI", "Noto Sans", Arial, sans-serif`;
  ctx.fillText("Skaner qiling — Telegram bot ochiladi", W / 2, footY);
  footY += W * 0.04;

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `500 ${Math.round(W * 0.02)}px "Segoe UI", "Noto Sans", Arial, sans-serif`;
  ctx.fillText(LOKATSIYA_BOT_URL.replace(/^https?:\/\//, ""), W / 2, footY);
  footY += W * 0.038;

  const lineW = W * 0.22;
  const lineGrad = ctx.createLinearGradient(W / 2 - lineW / 2, 0, W / 2 + lineW / 2, 0);
  lineGrad.addColorStop(0, "rgba(56,189,248,0)");
  lineGrad.addColorStop(0.5, COLOR_SKY);
  lineGrad.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = lineGrad;
  ctx.fillRect(W / 2 - lineW / 2, footY, lineW, Math.max(2, W * 0.004));

  return canvas;
}

export async function lokatsiyaBotQrPngDataUrl(size = 1080): Promise<string> {
  const canvas = await renderLokatsiyaBotQrPoster(size);
  return canvas.toDataURL("image/png");
}

export async function downloadLokatsiyaBotQrPng(filename = "amir-farm-lokatsiya-bot-qr.png") {
  const url = await lokatsiyaBotQrPngDataUrl(1400);
  downloadDataUrl(url, filename);
}

export async function downloadLokatsiyaBotQrPdf(filename = "amir-farm-lokatsiya-bot-qr.pdf") {
  const png = await lokatsiyaBotQrPngDataUrl(1400);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const marginX = 16;
  const imgW = pageW - marginX * 2;
  const imgH = imgW * 1.28;
  const y = Math.max(14, (pageH - imgH) / 2);
  doc.setFillColor(4, 16, 34);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.addImage(png, "PNG", marginX, y, imgW, imgH, undefined, "FAST");
  const blob = doc.output("blob");
  const objectUrl = URL.createObjectURL(blob);
  downloadDataUrl(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
