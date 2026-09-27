# Melhorias futuras

Ideias que ficaram de fora do escopo de cada etapa. Nada aqui está combinado; antes de fazer, conversar.

## Tickets

- **Busca na lista de tickets** por título ou ID, como no mockup.
- **Visão em quadro** (colunas por status), além da lista.
- **Colunas de duração e última atualização** na lista.
- **Atualizar um ticket aberto com a base.** O ticket parte do origin atualizado na criação, mas não acompanha o que entra na base depois. Um botão "Atualizar com a base" faria rebase/merge da branch do ticket no `origin/<base>`.

## Conexões

- **Entrar com GitHub (OAuth)** no lugar de colar token. A pessoa autoriza no GitHub e volta, sem copiar token nem renovar validade. Exige registrar um app OAuth por instalação (URL de retorno no domínio, client secret no servidor); só faz sentido com domínio e HTTPS.

## Agentes

- **Consumo dos provedores.** Mostrar em algum lugar quanto cada provedor já gastou: por ticket, por workspace, por usuário e no total do período. O Claude devolve o custo em US$ e os tokens de cada turno; o Codex, só os tokens. Esses números já ficam nos eventos `result` dos tickets e das conversas. Falta decidir onde mostrar (tela de Conexões, lista de tickets ou uma tela própria) e se vale mostrar o limite da assinatura, caso o provedor informe.

## Interface

- **Modo escuro e modo claro**, com opção de seguir o sistema.
