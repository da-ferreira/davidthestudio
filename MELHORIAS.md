# Melhorias futuras

Ideias que ficaram de fora do escopo de cada etapa. Nada aqui está combinado; antes de fazer, conversar.

## Tickets

- **Fazer merge do PR pela tela do ticket.** Hoje o merge é feito no GitHub. Um botão “Fazer merge” no ticket mostraria o estado do PR (checks do CI, conflitos e aprovações) e faria o merge com `gh pr merge` quando a pessoa clicar; depois fecharia o ticket e apagaria a branch e a worktree. A decisão continua humana: o agente não aprova nem faz merge sozinho, e a proteção de branch do GitHub continua valendo. Auto-merge “quando os checks passarem” só depois do executor de testes e com CI confiável, ligado por ticket.
- **Atualizar um ticket aberto com a base.** O ticket parte do origin atualizado na criação, mas não acompanha o que entra na base depois. Um botão "Atualizar com a base" faria rebase/merge da branch do ticket no `origin/<base>`.
- **Atualizar o contexto de uma conversa em “Perguntar”.** Se o workspace/repositório for atualizado durante uma conversa, uma nova pergunta na mesma sessão deve considerar o código novo, sem exigir que a pessoa crie outra conversa.

## Conexões

- **Entrar com GitHub (OAuth)** no lugar de colar token. A pessoa autoriza no GitHub e volta, sem copiar token nem renovar validade. Exige registrar um app OAuth por instalação (URL de retorno no domínio, client secret no servidor); só faz sentido com domínio e HTTPS.

## Agentes

- **Consumo dos provedores.** Mostrar em algum lugar quanto cada provedor já gastou: por ticket, por workspace, por usuário e no total do período. O Claude devolve o custo em US$ e os tokens de cada turno; o Codex, só os tokens. Esses números já ficam nos eventos `result` dos tickets e das conversas. Falta decidir onde mostrar (tela de Conexões, lista de tickets ou uma tela própria) e se vale mostrar o limite da assinatura, caso o provedor informe.
- **Navegador para o agente testar telas.** Hoje o agente não abre o app, então o teste visual fica com a pessoa. Dar o navegador é simples (Playwright MCP headless no `query()`, com as ferramentas liberadas sem pedir permissão a cada clique). O difícil é subir o app dentro do container da tarefa: no próprio studio exige porta e `STUDIO_DATA` isolados (o proxy do Vite tem o 4700 fixo) e um usuário de teste; em outros workspaces, banco, serviços e `.env`, que fica fora do contexto. O Chromium também pesa na imagem do agente e na memória de cada container. Ficou para depois da etapa 23, com a VPS já dimensionada; faz mais sentido junto do executor de testes, rodando os testes e2e de cada projeto, com o jeito de subir o app descrito pelo workspace.
