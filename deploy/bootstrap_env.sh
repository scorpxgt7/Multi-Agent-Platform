#!/usr/bin/env bash
set -euo pipefail

TEMPLATE="$(pwd)/deploy/env.production.example"
TARGET=".env"

echo "Bootstrapping environment file..."
if [ ! -f "$TEMPLATE" ]; then
  echo "Missing template: $TEMPLATE" >&2
  exit 2
fi

if [ -f "$TARGET" ]; then
  echo ".env already exists; leaving as-is"
  exit 0
fi

cp "$TEMPLATE" "$TARGET"
echo "Copied template to $TARGET"

# Generate some secrets if left as placeholders
if grep -q "replace-with-a-strong-secret" "$TARGET"; then
  SECRET=$(openssl rand -hex 24)
  sed -i "s/replace-with-a-strong-secret/$SECRET/g" "$TARGET"
  echo "Generated NEXUS_API_KEY"
fi

if grep -q "replace-with-bootstrap-secret" "$TARGET"; then
  BOOTSTRAP_SECRET=$(openssl rand -hex 32)
  sed -i "s/replace-with-bootstrap-secret/$BOOTSTRAP_SECRET/g" "$TARGET"
  echo "Generated BOOTSTRAP_TOKEN"
fi

if grep -q "replace-with-strong-password" "$TARGET"; then
  PSQL_PASS=$(openssl rand -hex 16)
  sed -i "s/replace-with-strong-password/$PSQL_PASS/g" "$TARGET"
  echo "Generated POSTGRES_PASSWORD"
fi

echo "Environment bootstrap complete. Edit .env with any remaining production values."
