# Melhorias futuras

Ideias que ficaram de fora do escopo de cada etapa. Nada aqui está combinado; antes de fazer, conversar.

## Tickets

- **Mensagem de commit sugerida pelo agente.** Hoje o campo vem com o título do ticket. O agente poderia propor a mensagem ao terminar, com base no diff.
- **Busca na lista de tickets** por título ou ID, como no mockup.
- **Visão em quadro** (colunas por status), além da lista.
- **Colunas de duração e última atualização** na lista.
- **O agente decide os repositórios do ticket.** Hoje é preciso escolher os repos afetados ao criar, e nem sempre se sabe quais são. Na etapa Spec o agente lê o workspace e indica na spec quais repos vai mexer; ao aprovar, o studio cria as worktrees só desses repos. Decidido: é essa a abordagem (não "todos os repos" nem incluir repo no meio do ticket).
- **Atualizar um ticket aberto com a base.** O ticket parte do origin atualizado na criação, mas não acompanha o que entra na base depois. Um botão "Atualizar com a base" faria rebase/merge da branch do ticket no `origin/<base>`.

## Conexões

- **Entrar com GitHub (OAuth)** no lugar de colar token. A pessoa autoriza no GitHub e volta, sem copiar token nem renovar validade. Exige registrar um app OAuth por instalação (URL de retorno no domínio, client secret no servidor); só faz sentido com domínio e HTTPS.

## Interface

- **Modo escuro e modo claro**, com opção de seguir o sistema.
- **Redimensionar o chat do agente** na tela do ticket: arrastar a borda para alargar ou estreitar o painel, e um botão para recolher/expandir. Lembrar a largura escolhida.
