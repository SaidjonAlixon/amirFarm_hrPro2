#!/usr/bin/env bash
# Toza VPS’ga birinchi o‘rnatish (root): server → .env → Neon’dan to‘liq nusxa → build → pm2.
#   SECRETS_FILE=/root/af-secrets.env HR_DOMAIN=hr.example.uz CERT_EMAIL=admin@example.uz bash first-install.sh
# SECRETS_FILE — KEY=VALUE qatorlari: NEON_URL (Direct, "-pooler"siz) va .env ga yoziladigan kalitlar
# (SESSION_SECRET, TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN, CRON_SECRET, BACKGROUND_JOBS ...).
# Tugagach SECRETS_FILE o‘chiriladi.
set -euo pipefail

SECRETS_FILE="${SECRETS_FILE:?SECRETS_FILE kerak}"
HR_DOMAIN="${HR_DOMAIN:?HR_DOMAIN kerak}"
PG_MAJOR="${PG_MAJOR:-18}"
REPO_URL="${REPO_URL:-https://github.com/SaidjonAlixon/amirFarm_hrPro2.git}"
APP_DIR="${APP_DIR:-/opt/hr_ai}"
APP_USER="${APP_USER:-hrapp}"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/SaidjonAlixon/amirFarm_hrPro2/main}"

echo "==> [1/5] Server (setup-server.sh)"
# Ubuntu 22.04 needrestart apt paytida interaktiv so‘rov chiqarmasin
export NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive
curl -fsSL "$RAW_BASE/deploy/setup-server.sh" -o /root/setup-server.sh
HR_DOMAIN="$HR_DOMAIN" CERT_EMAIL="${CERT_EMAIL:-}" PG_MAJOR="$PG_MAJOR" REPO_URL="$REPO_URL" \
  APP_DIR="$APP_DIR" APP_USER="$APP_USER" bash /root/setup-server.sh

echo "==> [2/5] .env kalitlari"
python3 - "$APP_DIR/.env" "$SECRETS_FILE" <<'PY'
import sys
env_path, secrets_path = sys.argv[1], sys.argv[2]
secrets = {}
for line in open(secrets_path, encoding="utf-8"):
    line = line.rstrip("\r\n")
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        if k != "NEON_URL" and v:
            secrets[k.strip()] = v
lines = open(env_path, encoding="utf-8").read().splitlines()
out, seen = [], set()
for line in lines:
    key = line.split("=", 1)[0].lstrip("# ").strip() if "=" in line else None
    if key in secrets and key not in seen:
        out.append(f"{key}={secrets[key]}")
        seen.add(key)
    else:
        out.append(line)
for k, v in secrets.items():
    if k not in seen:
        out.append(f"{k}={v}")
open(env_path, "w", encoding="utf-8").write("\n".join(out) + "\n")
print("    yozildi:", ", ".join(sorted(secrets)))
PY
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

echo "==> [3/5] Neon → lokal baza"
NEON_URL="$(grep -E '^NEON_URL=' "$SECRETS_FILE" | head -n1 | cut -d= -f2-)"
if [[ -n "$NEON_URL" ]]; then
  sudo -iu "$APP_USER" env NEON_URL="$NEON_URL" bash "$APP_DIR/deploy/migrate-from-neon.sh"
else
  echo "    NEON_URL yo‘q — ko‘chirish o‘tkazib yuborildi"
fi

echo "==> [4/5] Bir martalik eski so‘rovlar tozalovi o‘tkazib yuboriladi (ochiq so‘rovlar saqlanadi)"
LOCAL_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -n1 | cut -d= -f2-)"
sudo -iu "$APP_USER" psql "${LOCAL_URL%%\?*}" -v ON_ERROR_STOP=0 -qc \
  "CREATE TABLE IF NOT EXISTS app_one_time_jobs (job_key TEXT PRIMARY KEY, ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), note TEXT);
   INSERT INTO app_one_time_jobs (job_key, note) VALUES ('purge_legacy_staff_needs_v2', 'VPS ko‘chishda o‘tkazib yuborildi')
   ON CONFLICT (job_key) DO NOTHING;" || true

echo "==> [5/5] Build + ishga tushirish (deploy.sh)"
sudo -iu "$APP_USER" bash "$APP_DIR/deploy/deploy.sh"

shred -u "$SECRETS_FILE" 2>/dev/null || rm -f "$SECRETS_FILE"
echo "==> Tayyor: https://$HR_DOMAIN"
