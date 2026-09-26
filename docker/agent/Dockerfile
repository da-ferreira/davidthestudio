# Imagem onde o agente, os testes e os logins rodam quando o studio usa containers (STUDIO_CONTAINERS=1).
# As versões vêm do daemon, para a CLI dentro do container ser a mesma que os SDKs esperam.
FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep python3 python3-pip python3-venv build-essential ca-certificates curl jq less \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && git config --system --add safe.directory '*' \
  && mkdir -m 1777 /home/agent

ARG CLAUDE_SDK_VERSION
ARG CODEX_VERSION
RUN npm install -g @anthropic-ai/claude-agent-sdk@${CLAUDE_SDK_VERSION} @openai/codex@${CODEX_VERSION} \
  && ln -s "$(node -e "const r=require('module').createRequire('/usr/local/lib/node_modules/@anthropic-ai/claude-agent-sdk/');console.log(require('path').join(require('path').dirname(r.resolve('@anthropic-ai/claude-agent-sdk-linux-'+process.arch+'/package.json')),'claude'))")" /usr/local/bin/claude \
  && claude --version && codex --version

ENV HOME=/home/agent
