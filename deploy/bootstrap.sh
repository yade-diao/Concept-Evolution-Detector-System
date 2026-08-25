#!/usr/bin/env bash
#
# Prepare a fresh server to run this. Once, by hand; after this the deploy
# workflow does everything.
#
#   curl -fsSL https://raw.githubusercontent.com/yade-diao/Concept-Evolution-Detector-System/main/deploy/bootstrap.sh | bash -s -- ced.example.com
#
# Takes the domain as its only argument, because Caddy asks Let's Encrypt for a
# certificate for exactly that name and needs it to resolve here first.
#
# Idempotent: run it again and it installs nothing twice and, in particular,
# does not regenerate the secrets in .env - doing that would lock out every
# account that exists and orphan the database.
set -euo pipefail

DOMAIN="${1:-}"
RAW="https://raw.githubusercontent.com/yade-diao/Concept-Evolution-Detector-System/main/deploy"
DIR=/opt/ced

if [ -z "$DOMAIN" ]; then
  echo "usage: bootstrap.sh <domain>" >&2
  exit 64
fi

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# --- Docker ----------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  say "Docker is already installed"
else
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "Added $USER to the docker group. Log out and back in before the deploy"
  echo "workflow can run docker without sudo."
fi

# --- Files -----------------------------------------------------------------
say "Preparing $DIR"
sudo mkdir -p "$DIR/site"
sudo chown -R "$USER" "$DIR"
cd "$DIR"

for file in compose.yml Caddyfile; do
  curl -fsSL "$RAW/$file" -o "$file"
  echo "  fetched $file"
done

# --- Secrets ---------------------------------------------------------------
if [ -f .env ]; then
  say ".env exists - leaving it alone"
  echo "  Its secrets are the ones the database and every issued token were"
  echo "  built with. Delete it deliberately if you mean to start over."
else
  say "Generating .env"
  umask 077
  cat > .env <<EOF
CED_DOMAIN=$DOMAIN
CED_JWT_SECRET=$(openssl rand -base64 48)
CED_DB_PASSWORD=$(openssl rand -base64 48)
CED_DB_NAME=ced
CED_DB_USER=ced
CED_IMAGE_OWNER=yade-diao
CED_IMAGE_TAG=latest
EOF
  echo "  wrote $DIR/.env (0600). It is the only copy of these secrets."
fi

# --- Check the domain before Caddy asks for a certificate ------------------
say "Checking that $DOMAIN points here"
resolved=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
public=$(curl -fsS https://api.ipify.org || true)
if [ -z "$resolved" ]; then
  echo "  $DOMAIN does not resolve yet. Point it here before starting the stack:"
  echo "  Caddy answers the ACME challenge itself, and a failed request is rate limited."
elif [ "$resolved" != "$public" ]; then
  echo "  $DOMAIN resolves to $resolved, but this machine is $public."
else
  echo "  $DOMAIN -> $resolved, which is this machine."
fi

# --- Start -----------------------------------------------------------------
say "Starting"
docker compose --env-file .env up -d

cat <<EOF

Done. What is left is on GitHub, not here:

  1. Settings -> Secrets and variables -> Actions, add
       DEPLOY_HOST     $(curl -fsS https://api.ipify.org || echo '<this server>')
       DEPLOY_USER     $USER
       DEPLOY_SSH_KEY  a private key whose public half is in ~/.ssh/authorized_keys here
  2. Packages -> ced-api -> make it public, or run:
       echo <token> | docker login ghcr.io -u <github-user> --password-stdin

Then every push to main that passes its tests lands here by itself.

  docker compose logs -f api     # Flyway migrating, then the port opening
  curl https://$DOMAIN/actuator/health
EOF
