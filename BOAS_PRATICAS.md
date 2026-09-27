# Boas práticas para começar

## Workspace por URL git

"Importar do git" espera a URL do **repo de contexto** do workspace, não a de um repo de código. O repo de contexto é a raiz do workspace: `CLAUDE.md`, `AGENTS.md`, skills, memórias e o `workspace.json`. O studio clona esse repo e depois cada repo listado no `workspace.json`, como subpasta.

Importar um repo de código direto cria um workspace com 0 repositórios. Sem repo de contexto, use **Workspace vazio** (só o nome) e acrescente cada repo em **Repositórios → Adicionar repositório**. Para vários repos e contexto compartilhado, o certo é ter um repo de contexto.

### Montar o repo de contexto

1. Crie um repo só para o contexto (ex.: `sua-org/agentia`) com `CLAUDE.md`, `AGENTS.md` e o que mais os agentes devem ler.
2. Acrescente o `workspace.json`, com o `remote` de cada repo:

   ```json
   {
     "name": "agentia",
     "repos": [
       { "name": "api", "remote": "https://github.com/sua-org/api.git", "defaultBranch": "main" },
       { "name": "web", "remote": "https://github.com/sua-org/web.git", "defaultBranch": "main", "test": "pnpm test" }
     ]
   }
   ```

   `name` é a subpasta onde o repo fica; os caminhos citados no `CLAUDE.md` devem bater com ela. `defaultBranch` é a branch base (veja abaixo). `test` é opcional; sem ele, o studio sugere um a partir do `scripts.test` do repo.
3. Ponha as pastas dos repos no `.gitignore` do contexto (`/api/`, `/web/`), para o repo de contexto não enxergar os repos de código como arquivos novos.
4. Faça push e importe a URL do contexto no studio.

Repo que falhar ao clonar fica como ausente e pode ser clonado depois na tela de repositórios. Ao adicionar ou remover repo pela tela, o studio reescreve o `workspace.json`; faça commit e push dele no repo de contexto para a próxima instalação já vir completa.

## Branch base

Cada repo tem uma branch base: os tickets e as conversas saem dela e os PRs apontam para ela. Por padrão é a branch padrão do remote. Para trabalhar em outra (ex.: `develop`):

- ao adicionar o repo, preencha o campo **Branch**; ou
- no `workspace.json`, use `defaultBranch` (o import clona dessa branch); ou
- depois de clonado, em **Configurar** no repo, troque para uma branch existente ou crie uma nova a partir da atual (a nova sobe para o remote).

A troca é bloqueada enquanto houver ticket com worktree do repo ou mudanças não commitadas na pasta dele.

Não precisa dar `git pull` na pasta do repo: cada ticket e cada pergunta busca a branch base no remote e parte do `origin/<base>` mais recente. A pasta do repo em si não é alterada. Se o fetch falhar (sem internet, token expirado), o ticket parte da última cópia conhecida e avisa no log.

## Ticket sem saber os repositórios

Com a spec ligada, dá para criar o ticket sem escolher repositório. O agente lê todos e lista na seção `## Repositórios` da spec os que vai alterar (um `- nome` por linha). Ao aprovar a spec, só esses continuam no ticket; para mudar a escolha, edite essa seção antes de aprovar. No ticket rápido (sem spec), escolha os repositórios.

## Antes de importar

- Conecte o GitHub em **Conexões**. Repos privados e de organizações são clonados com o seu token (classic com escopo `repo` cobre repos de várias organizações; se a org usa SSO, autorize o token nela).
- `.env` e segredos não vão para o git. Depois de importar, preencha o `.env` de cada repo pela tela; ele fica criptografado no studio.
- Num servidor, "Registrar pasta" não vê as pastas do seu computador; use sempre "Importar do git".
