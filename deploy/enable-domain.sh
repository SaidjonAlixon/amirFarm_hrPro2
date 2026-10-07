#!/usr/bin/env bash
# Domenni ishga tushirish (DNS A yozuvi shu serverga qaragach):
#   sudo HR_DOMAIN=amirpharmacyhr.uz CERT_EMAIL=admin@example.uz bash deploy/enable-domain.sh
#   sudo HR_DOMAIN=amirpharmacyhr.uz bash deploy/enable-domain.sh --watch   # DNS tayyor bo‘lguncha har 5 daqiqada cron urinadi
# Bajariladi: Let's Encrypt sertifikati → nginx HTTPS → .env (PUBLIC_APP_URL, cookie secure, fon ishlari) → API reload → Telegram webhook.
# DNS hali tayyor bo‘lmasa 2 kodi bilan chiqadi.
set -euo pipefail

HR_DOMAIN="${HR_DOMAIN:?HR_DOMAIN kerak, masalan HR_DOMAIN=amirpharmacyhr.uz}"
CERT_EMAIL="${CERT_EMAIL:-}"
APP_DIR="${APP_DIR:-/opt/hr_ai}"
APP_USER="${APP_USER:-hrapp}"
ENV_FILE="$APP_DIR/.env"
CRON_FILE=/etc/cron.d/hr-domain
LOCK=/run/hr-enable-domain.lock

log() { echo "[$(date '+%F %T')] $*"; }

if [[ "${1:-}" == "--watch" ]]; then
  echo "*/5 * * * * root HR_DOMAIN=$HR_DOMAIN CERT_EMAIL=$CERT_EMAIL APP_DIR=$APP_DIR APP_USER=$APP_USER bash $APP_DIR/deploy/enable-domain.sh >> /var/log/hr-domain.log 2>&1" > "$CRON_FILE"
  chmod 644 "$CRON_FILE"
  log "cron o‘rnatildi: DNS tayyor bo‘lishi bilan avtomatik yoqiladi (/var/log/hr-domain.log)"
fi

exec 9>"$LOCK"
flock -n 9 || { log "boshqa nusxa ishlayapti"; exit 0; }

server_ip="$(curl -s -4 --max-time 10 https://api.ipify.org || true)"
resolve_a() {
  local name="$1" ip=""
  if command -v dig >/dev/null 2>&1; then
    ip="$(dig +short A "$name" @1.1.1.1 | grep -E '^[0-9.]+$' | head -n 1 || true)"
  fi
  [[ -z "$ip" ]] && ip="$(getent ahostsv4 "$name" | awk 'NR==1{print $1}' || true)"
  echo "$ip"
}

apex_ip="$(resolve_a "$HR_DOMAIN")"
if [[ -z "$server_ip" || "$apex_ip" != "$server_ip" ]]; then
  log "DNS hali tayyor emas: $HR_DOMAIN -> '${apex_ip:-yo‘q}', server $server_ip"
  exit 2
fi

names=("$HR_DOMAIN")
[[ "$(resolve_a "www.$HR_DOMAIN")" == "$server_ip" ]] && names+=("www.$HR_DOMAIN")
log "DNS tayyor: ${names[*]} -> $server_ip"

mkdir -p /var/www/certbot
CONF=/etc/nginx/sites-available/hr.conf
if ! grep -q "acme-challenge" "$CONF"; then
  sed -i "0,/server_name .*;/s##server_name ${names[*]} _;\n\n    location /.well-known/acme-challenge/ {\n        root /var/www/certbot;\n    }#" "$CONF"
  nginx -t && systemctl reload nginx
fi

domain_args=()
for n in "${names[@]}"; do domain_args+=(-d "$n"); done
email_args=(--register-unsafely-without-email)
[[ -n "$CERT_EMAIL" ]] && email_args=(-m "$CERT_EMAIL")

log "Let's Encrypt sertifikati"
certbot certonly --webroot -w /var/www/certbot "${domain_args[@]}" "${email_args[@]}" \
  --agree-tos -n --keep-until-expiring --expand --cert-name "$HR_DOMAIN" \
  --deploy-hook "systemctl reload nginx"

log "nginx HTTPS"
backup="$CONF.bak-$(date +%Y%m%d%H%M)"
cp "$CONF" "$backup"
sed -e "s#SERVER_NAMES#${names[*]}#g" -e "s#HR_DOMAIN#$HR_DOMAIN#g" -e "s#APP_DIR#$APP_DIR#g" \
  "$APP_DIR/deploy/nginx/hr-ssl.conf" > "$CONF"
if ! nginx -t; then
  cp "$backup" "$CONF"
  log "XATO: HTTPS konfiguratsiya nginx tekshiruvidan o‘tmadi — eski holat qaytarildi"
  exit 1
fi
systemctl reload nginx

log ".env: https://$HR_DOMAIN, secure cookie, fon ishlari"
set_env() {
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s#^$1=.*#$1=$2#" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
set_env PUBLIC_APP_URL "https://$HR_DOMAIN"
set_env BACKGROUND_JOBS 1
sed -i '/^COOKIE_SECURE=/d' "$ENV_FILE"

log "API reload"
sudo -iu "$APP_USER" bash -c "cd '$APP_DIR' && pm2 reload deploy/ecosystem.config.cjs --update-env >/dev/null && pm2 save >/dev/null"
for i in $(seq 1 30); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/healthz || true)" == "200" ]] && break
  sleep 1
done
curl -s -o /dev/null -w "    https://$HR_DOMAIN -> %{http_code}\n" --resolve "$HR_DOMAIN:443:127.0.0.1" "https://$HR_DOMAIN/api/healthz"

log "Telegram webhook"
env_val() { grep -E "^$1=" "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '"'"'"; }
secret="$(env_val TELEGRAM_SETUP_SECRET)"
[[ -z "$secret" ]] && secret="$(env_val CRON_SECRET)"
curl -s --max-time 60 -X POST http://127.0.0.1:8080/api/telegram/setup \
  -H "Authorization: Bearer $secret" -H "Content-Type: application/json" -d '{}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('    ok=%s webhook=%s' % (d.get('ok'), d.get('webhookUrl') or d.get('error'))); sys.exit(0 if d.get('ok') else 1)"

rm -f "$CRON_FILE"
log "Tayyor: https://$HR_DOMAIN"
