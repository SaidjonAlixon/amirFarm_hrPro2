import { logger } from "../lib/logger";
import { handleFilialBotUpdate } from "../lib/filial-bot-handler";
import {
  filialDeleteWebhook,
  filialGetUpdates,
  filialSetMyCommands,
  filialSetMyDescription,
  filialSetMyName,
  filialSetMyShortDescription,
  isFilialBotConfigured,
  shouldFilialUsePolling,
} from "../lib/telegram-filial";

let started = false;
let offset = 0;
let running = false;

async function pollOnce() {
  if (running) return;
  running = true;
  try {
    const updates = await filialGetUpdates(offset || undefined, 25);
    for (const u of updates) {
      offset = u.update_id + 1;
      await handleFilialBotUpdate(u);
    }
  } catch (err) {
    logger.warn({ err }, "Amir Pharmacy lokatsiya polling xato");
    await new Promise((r) => setTimeout(r, 3000));
  } finally {
    running = false;
  }
}

async function applyBotProfile() {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["setMyName", () => filialSetMyName("Amir Pharmacy lokatsiya")],
    [
      "setMyShortDescription",
      () => filialSetMyShortDescription("Filial nomi, raqam, ish vaqti va lokatsiya"),
    ],
    [
      "setMyDescription",
      () =>
        filialSetMyDescription(
          "Amir Pharmacy lokatsiya — dorixona filiali: nom, telefon, ish vaqti va joylashuv.",
        ),
    ],
    [
      "setMyCommands",
      () =>
        filialSetMyCommands([
          { command: "start", description: "Filiallar ro‘yxati" },
          { command: "filiallar", description: "Filiallarni ko‘rish" },
          { command: "kesim", description: "Filiallar kesimi — tumanlar" },
          { command: "malumot", description: "Xodim ehtiyoji (rekruter)" },
          { command: "kerak", description: "Xodim kerak filiallar" },
          { command: "gpsyoq", description: "GPS kiritilmagan filiallar" },
          { command: "yaqin", description: "Eng yaqin 3 ta filial" },
          { command: "yordam", description: "Yordam" },
          { command: "admin", description: "Admin panel" },
          { command: "rekruterlar", description: "Admin rekruterlar" },
          { command: "id", description: "Telegram ID" },
        ]),
    ],
  ];
  for (const [label, fn] of steps) {
    try {
      await fn();
    } catch (err) {
      logger.warn({ err, step: label }, "Amir Pharmacy lokatsiya profil sozlamasi o‘tmadi");
    }
  }
}

export function startFilialBotPollingJob() {
  if (started) return;
  if (!isFilialBotConfigured()) {
    logger.info("Amir Pharmacy lokatsiya: TELEGRAM_FILIAL_BOT_TOKEN yo‘q — o‘chirilgan");
    return;
  }
  if (!shouldFilialUsePolling()) {
    logger.info("Amir Pharmacy lokatsiya: webhook rejimi (polling yo‘q)");
    return;
  }

  started = true;
  void (async () => {
    logger.warn(
      "Amir Pharmacy lokatsiya: TELEGRAM_FILIAL_POLLING=1 — production webhook o‘chiriladi. Vercel bot uchun pollingni o‘chiring.",
    );
    try {
      await filialDeleteWebhook();
    } catch (err) {
      logger.warn({ err }, "Amir Pharmacy lokatsiya deleteWebhook");
    }
    await applyBotProfile();
    logger.info("Amir Pharmacy lokatsiya polling boshlandi (HR botga tegmaydi)");
    for (;;) {
      await pollOnce();
    }
  })();
}
