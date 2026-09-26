# david the studio

Orquestrador visual de agentes de código por **workspace**: uma pasta com vários repositórios + contexto (CLAUDE.md, AGENTS.md, memórias, skills), como `/Users/almeida/lp/agentia`. Fluxo: workspace → ticket → agente trabalha numa worktree → log/chat → diff → commit/PR.

O nome é sempre minúsculo: **david the studio**.

## Estado atual

Fase 1 do roadmap: daemon Node + UI React, rodando local, um usuário, só Claude Code.

Roadmap: (1) daemon + UI local, só Claude; (2) etapas SDD + executor de testes; (3) adaptador Codex; (4) multiusuário + containers + EC2. Não antecipar nada de fase posterior sem combinar antes.

## Estrutura

```
daemon/   Node + TypeScript. REST + WebSocket, SQLite, git, adaptador do agente
ui/       React + Vite + Tailwind + shadcn/ui
shared/   tipos trocados entre daemon e UI (eventos, ticket, workspace)
docs/design/   referências visuais e tokens do mockup
```

Pacotes com pnpm workspaces. `pnpm dev` na raiz sobe daemon e UI juntos.

## Conceitos

- **Workspace**: pasta registrada no studio. Os repos são subpastas; a lista fica em `workspace.json` na raiz do workspace (nome, remote, branch padrão). O SQLite guarda só onde está cada workspace, não duplica o manifesto.
- **Ticket**: pedido ao agente. Tem repos afetados, modelo, status, `sessionId` do Claude e todos os eventos persistidos (o log sobrevive a reload e reinício do daemon).
- **Pasta da tarefa**: `~/.studio/tasks/<ticket>/` espelha o layout do workspace, com uma git worktree por repo afetado na branch `studio/<ticket>-<slug>`. O agente roda com `cwd` nela, então os caminhos citados no CLAUDE.md do workspace continuam válidos.
- **Adaptador de agente**: não reimplementamos o agente. `daemon/src/agents/claude.ts` embrulha o Claude Code (Agent SDK) com a interface `start`, `onEvent`, `sendMessage`, `stop`, `resume`. Um adaptador Codex entra na fase 3 com a mesma interface; até lá não criar abstração extra.

## Git

- Commit com nome e e-mail do usuário do studio que aprovou e `Co-Authored-By` do agente.
- Um PR por repo afetado (`gh pr create`).
- Remover repo do workspace exige checar mudanças não commitadas, branches sem push e tickets ativos.
- Nunca commitar segredos: `.env`, `.pem` e afins ficam fora do git e do contexto.

## Visual

Referência: app da ElevenLabs (`docs/design/referencias/`). Tokens em `docs/design/mockup_build.py`.

- Fundo branco, texto `#0a0a0a`, secundário `#737373`, bordas `#e5e5e5` / `#efefef`.
- Sidebar quase branca (`#fcfcfc`, borda `#f0f0f0`, item ativo `#f2f2f2`), sem contraste forte com o conteúdo.
- Botão primário preto; abas em pílula cinza; badges verdes/azuis/âmbar suaves; tabelas limpas; painel de configuração à direita.
- Inter na interface inteira, Geist Mono para código e caminhos. Logo "david the studio" em Inter semibold minúsculo.
- Componentes vêm do shadcn/ui ajustado a esses tokens; não criar componente próprio quando o shadcn já tem.

## Convenções

- Interface e textos em português do Brasil.
- Escopo exato do pedido; sem mecanismo para problema que ainda não existe. Se parecer faltar algo, propor antes.
- Comentário só para o "por que" não óbvio, 1–2 linhas.
- O usuário quer o mínimo de terminal: tudo que der deve ser feito pela tela.
