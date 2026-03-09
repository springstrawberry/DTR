#!/usr/bin/env sh
set -eu

if [ -z "${APP_KEY:-}" ]; then
  echo "APP_KEY is required." >&2
  exit 1
fi

mkdir -p \
  bootstrap/cache \
  storage/framework/cache \
  storage/framework/sessions \
  storage/framework/views \
  storage/logs

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  php artisan migrate --force
fi

exec php artisan serve --host=0.0.0.0 --port="${PORT:-10000}"
