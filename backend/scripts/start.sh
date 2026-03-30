#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Starting server..."
if [ -f "dist/src/main.js" ]; then
  exec node dist/src/main.js
fi

if [ -f "dist/main.js" ]; then
  exec node dist/main.js
fi

echo "Cannot find server entrypoint (dist/src/main.js or dist/main.js)"
exit 1
