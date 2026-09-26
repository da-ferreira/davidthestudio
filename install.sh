#!/bin/sh
# Instala ou atualiza o david the studio neste servidor (Linux com systemd).
# Uso: sudo ./install.sh [domínio]   — sem domínio, o studio fica só em http na porta 80.
set -eu
cd "$(dirname "$0")"

if [ "$(id -u)" != 0 ]; then
  echo "Rode com sudo: sudo ./install.sh"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando o Docker…"
  curl -fsSL https://get.docker.com | sh
fi

# O .env guarda o endereço e o código do primeiro acesso; numa reinstalação ele é mantido.
if [ ! -f .env ]; then
  domain="${1-}"
  if [ -z "$domain" ] && [ -t 0 ]; then
    printf "Domínio do studio (ex.: studio.suaempresa.com; vazio usa só http na porta 80): "
    read -r domain
  fi
  code=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
  umask 077
  cat > .env <<EOF
STUDIO_ADDRESS=${domain:-:80}
STUDIO_SETUP_CODE=$code
DOCKER_GID=$(stat -c %g /var/run/docker.sock)
EOF
fi

# O daemon roda como o usuário 1000 do container (node).
mkdir -p /var/lib/studio
chown 1000:1000 /var/lib/studio
chmod 700 /var/lib/studio

docker compose up -d --build

echo "Esperando o studio subir (na primeira vez a imagem do agente leva alguns minutos)…"
i=0
until docker compose exec -T daemon curl -fs http://localhost:4700/api/health >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 180 ]; then
    echo "O studio não respondeu em 15 minutos. Veja o log com: docker compose logs daemon"
    exit 1
  fi
  sleep 5
done

address=$(sed -n 's/^STUDIO_ADDRESS=//p' .env)
code=$(sed -n 's/^STUDIO_SETUP_CODE=//p' .env)
if [ "$address" = ":80" ]; then url="http://$(curl -fs --max-time 3 https://checkip.amazonaws.com || hostname -I | cut -d' ' -f1)"; else url="https://$address"; fi
echo
echo "Pronto. Abra $url"
echo "No primeiro acesso, use o código de instalação: $code"
[ "$address" = ":80" ] && echo "Atenção: sem domínio não há HTTPS; senhas e tokens trafegam sem criptografia. Para ativar, aponte um domínio para este servidor, troque STUDIO_ADDRESS no .env e rode o install.sh de novo."
echo "Backups diários do banco ficam em /var/lib/studio/backups; guarde junto o /var/lib/studio/master.key."
