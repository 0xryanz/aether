#!/bin/sh
set -eu

: "${DOMAIN:?DOMAIN must be set (e.g. forge.example.com)}"

ACME_HOME=/acme
CERT_DIR=/certs
WEBROOT=/var/www/certbot
STAGING_FLAG=""
if [ "${ACME_STAGING:-0}" = "1" ]; then
    STAGING_FLAG="--staging"
fi

mkdir -p "$ACME_HOME" "$CERT_DIR" "$WEBROOT"

# Wait for nginx to serve the ACME webroot.
echo "[acme] waiting for nginx..."
for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null http://nginx/healthz 2>/dev/null; then
        break
    fi
    sleep 2
done

# Register the ACME account once (idempotent).
if [ ! -f "$ACME_HOME/account.conf" ]; then
    echo "[acme] registering account for ${ACME_EMAIL:-admin@$DOMAIN}"
    acme.sh --register-account \
        -m "${ACME_EMAIL:-admin@$DOMAIN}" \
        --config-home "$ACME_HOME" $STAGING_FLAG || true
fi

FORCE_FLAG=""
if [ "${ACME_FORCE:-0}" = "1" ]; then
    FORCE_FLAG="--force"
fi

# Issue the first certificate. The marker keeps restarts idempotent.
if [ ! -f "$CERT_DIR/.issued" ] || [ -n "$FORCE_FLAG" ]; then
    echo "[acme] issuing certificate for ${DOMAIN}"
    acme.sh --issue \
        -d "$DOMAIN" \
        --webroot "$WEBROOT" \
        --config-home "$ACME_HOME" \
        --keylength ec-256 \
        $STAGING_FLAG $FORCE_FLAG

    acme.sh --install-cert -d "$DOMAIN" --ecc \
        --config-home "$ACME_HOME" \
        --key-file "$CERT_DIR/privkey.pem" \
        --fullchain-file "$CERT_DIR/fullchain.pem" \
        --reloadcmd "touch $CERT_DIR/.reload"

    touch "$CERT_DIR/.issued"
    echo "[acme] certificate installed"
else
    echo "[acme] certificate marker found, skipping issuance"
fi

# Renew twice a day; acme.sh only renews inside its 60-day window.
while true; do
    sleep 43200
    echo "[acme] renewal check"
    acme.sh --cron --config-home "$ACME_HOME" --ecc $STAGING_FLAG || true
done
