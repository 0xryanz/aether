#!/bin/sh
set -eu

: "${DOMAIN:?DOMAIN must be set (e.g. forge.example.com)}"

CERT_DIR=/etc/nginx/certs
WEBROOT=/var/www/certbot
mkdir -p "$CERT_DIR" "$WEBROOT" /var/cache/nginx/static

# Render the vhost template (only ${DOMAIN} is substituted).
envsubst '${DOMAIN}' < /etc/nginx/templates/aether.conf.template > /etc/nginx/conf.d/default.conf

# Bootstrap: nginx must be able to start before ACME has issued a cert.
if [ ! -s "$CERT_DIR/fullchain.pem" ] || [ ! -s "$CERT_DIR/privkey.pem" ]; then
    echo "[nginx] no certificate found, generating a bootstrap self-signed cert for ${DOMAIN}"
    openssl req -x509 -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -days 3 \
        -subj "/CN=${DOMAIN}" \
        -addext "subjectAltName=DNS:${DOMAIN}" \
        -keyout "$CERT_DIR/privkey.pem" \
        -out "$CERT_DIR/fullchain.pem" 2>/dev/null
fi

nginx -t

# Watch for the ACME container's reload trigger and reload certificates.
(
    last=""
    while true; do
        sleep 20
        if [ -e "$CERT_DIR/.reload" ]; then
            current="$(stat -c %Y "$CERT_DIR/.reload" 2>/dev/null || echo 0)"
            if [ "$current" != "$last" ]; then
                last="$current"
                echo "[nginx] certificate change detected, reloading"
                nginx -t && nginx -s reload || echo "[nginx] reload failed"
            fi
        fi
    done
) &

exec "$@"
