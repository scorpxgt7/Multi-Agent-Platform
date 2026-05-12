#!/usr/bin/env bash
set -euo pipefail

# Placeholder helper to request Let's Encrypt certificates using certbot.
# This script is intentionally conservative and only prints the recommended commands.
# Run with: DEPLOY_HOST=host DEPLOY_USER=user DEPLOY_PATH=/opt/multi-agent ./deploy/setup_ssl.sh

echo "This helper will attempt to obtain TLS certificates via certbot on the VPS."
echo "It only prints recommended commands. To run interactively, SSH into the server and run them."

echo "Example steps to run on the server (replace domain and email):"
cat <<'CMD'
sudo apt-get update && sudo apt-get install -y certbot
sudo certbot certonly --nginx -d your-domain.example -m admin@your-domain.example --agree-tos --non-interactive
# After obtaining certs, reload nginx
sudo systemctl reload nginx || sudo docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml restart nginx
CMD

echo "Note: For automated certbot/renewal, configure the server's cron or systemd timers and ensure port 80 is reachable from Let's Encrypt." 
