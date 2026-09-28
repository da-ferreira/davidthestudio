# Imagens da instalação: "daemon" (API, git e os containers do agente) e "web" (Caddy com a UI já construída).
FROM node:22-bookworm AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY daemon/package.json daemon/
COPY ui/package.json ui/
COPY shared/package.json shared/
RUN pnpm install --frozen-lockfile
COPY . .

FROM base AS ui-build
RUN pnpm --filter ui build

FROM caddy:2 AS web
COPY docker/studio/Caddyfile /etc/caddy/Caddyfile
COPY --from=ui-build /app/ui/dist /srv

FROM docker:cli AS docker-cli

FROM base AS daemon
RUN apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*
# Só o cliente: o daemon cria os containers do agente pelo Docker da máquina (socket montado).
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
# O volume de run/ herda dono e permissão desta pasta na primeira montagem.
RUN mkdir -p /var/lib/studio/run && chown node:node /var/lib/studio/run && chmod 700 /var/lib/studio/run
ENV STUDIO_DATA=/var/lib/studio STUDIO_HOST=0.0.0.0 STUDIO_TRUST_PROXY=1 STUDIO_CONTAINERS=1
USER node
WORKDIR /app/daemon
CMD ["node_modules/.bin/tsx", "src/index.ts"]
