# Geração de tutoriais com IA

Como o **david the studio** gera tutoriais passo a passo (com prints de tela) usando o Claude Code. O texto descreve o fluxo e as decisões para dar para adaptar a outro sistema; os trechos de código são TypeScript (Node), mas nada depende da nossa stack.

## Visão geral

A pessoa descreve o que o tutorial deve ensinar. O agente trabalha em **duas etapas separadas**, cada uma é uma chamada única (uma pergunta, uma resposta):

1. **Plano**: o agente diz **quais prints de tela** precisa (lista JSON de descrições). Pode ser lista vazia.
2. **Escrita**: a pessoa sobe/cola os prints; o agente recebe as imagens e escreve o tutorial em **HTML**, citando os prints por número.

Depois disso dá para pedir **ajustes por texto** (o agente reescreve só o que foi pedido), baixar em **HTML autocontido** ou **PDF**, e anexar numa demanda do OpenProject.

```
criar ──► planning ──► shots ──► writing ──► done
             │  (lista vazia: pula direto para writing)   │
             └────────────── error ◄──────────────────────┘
done ──(ajuste por texto / remontar)──► writing ──► done
```

Por que duas etapas: o agente não tem como tirar print do sistema da pessoa. Ele sabe o que precisa mostrar; a pessoa sabe tirar o print. Pedir a lista antes evita prints a mais (ou a menos) e deixa claro para quem usa o que capturar.

## Modelo de dados

Uma tabela, tudo num registro:

```sql
CREATE TABLE tutorials (
  num INTEGER PRIMARY KEY AUTOINCREMENT,  -- número curto para a lista
  id TEXT NOT NULL UNIQUE,                -- uuid
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,                   -- o que o tutorial deve ensinar
  model TEXT NOT NULL,                    -- modelo do Claude escolhido
  demanda TEXT,                           -- JSON {id, url} se veio de uma demanda
  context TEXT NOT NULL DEFAULT '',       -- texto da demanda, já resolvido
  status TEXT NOT NULL,                   -- planning | shots | writing | done | error
  shots TEXT NOT NULL DEFAULT '[]',       -- JSON [{description, image|null}]
  body TEXT,                              -- HTML gerado (só o conteúdo)
  error TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- `shots` guarda a lista que o agente pediu e, para cada item, o id da imagem que a pessoa mandou (ou `null`).
- As imagens ficam numa pasta própria (`images/<uuid>.png`); o registro só guarda o id.
- `context` é montado na criação: o agente **não acessa** o OpenProject. Mandamos o título e a descrição da demanda como texto; imagens dentro da descrição viram uma nota `(imagem na demanda: alt)`.

## API

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/api/tutoriais` | cria (`title`, `prompt`, `model`, `demanda?`) e já dispara o **plano** |
| `GET` | `/api/tutoriais/:id` | estado atual (a tela consulta a cada 2 s enquanto o agente trabalha) |
| `PUT` | `/api/tutoriais/:id/prints/:n` | põe/troca/remove (`image: null`) a imagem do print `n` |
| `POST` | `/api/tutoriais/:id/gerar` | monta (ou remonta) o tutorial com os prints atuais |
| `POST` | `/api/tutoriais/:id/ajuste` | `{ text }`: ajuste pontual sobre a versão atual |
| `GET` | `/api/tutoriais/:id/documento` | HTML final autocontido (`?baixar=1` para download) |
| `GET` | `/api/tutoriais/:id/pdf` | PDF (só no app desktop; fora dele responde 501) |
| `POST` | `/api/tutoriais/:id/anexar` | sobe PDF + HTML na demanda e comenta com os links |
| `DELETE` | `/api/tutoriais/:id` | apaga registro e pasta |

Regras: só quem criou mexe no tutorial; enquanto o agente trabalha, qualquer ação responde 409.

## Os dois prompts

Os prompts vão como **instruções de sistema** (no Agent SDK, `systemPrompt: { type: 'preset', preset: 'claude_code', append: INSTRUÇÕES }`). Se você usa a API do Claude direto, vira o `system` da mensagem.

### Etapa 1 — plano (lista de prints)

```
Você ajuda a montar tutoriais passo a passo, em português do Brasil, para pessoas que vão usar um sistema.
Nesta etapa você ainda não escreve o tutorial: diga quais prints de tela precisa para ilustrá-lo, se precisar de algum.
Peça só os prints que a pessoa precisa ver para não se perder: um por tela nova ou ação que não dá para explicar só com texto. Passos simples ("clique em Salvar") não precisam de print. Um tutorial curto pode ter 1 ou 2.
Prints são opcionais. Se o pedido é explicar algo (ex.: o que mudou no backend, de forma simples) e não guiar por telas, responda [] e o tutorial sai só com texto.
Na ordem em que aparecem no tutorial, nunca mais de 10 (limite de envio, não meta). Cada item diz exatamente qual tela capturar e em que estado (ex.: "Tela de login com e-mail e senha preenchidos, antes de clicar em Entrar").
Responda só com um array JSON de strings, sem texto antes ou depois.
```

Mensagem do usuário nessa etapa:

```
O que o tutorial deve ensinar:
<prompt da pessoa>

Contexto (demanda no OpenProject):
<título e descrição da demanda, se houver>
```

Lições que viraram texto do prompt:
- Sem "peça só o necessário", o modelo pede 8–10 prints para qualquer coisa. O "limite de envio, não meta" foi necessário porque ele tratava o 10 como alvo.
- Sem a saída `[]`, ele inventava prints para explicações que não têm tela.
- "Exatamente qual tela e em que estado" faz a descrição servir de instrução para quem vai capturar.

Leitura da resposta: pega do primeiro `[` ao último `]`, faz `JSON.parse`, confere que é array de strings e corta em 10. Se falhar, a etapa vira `error` com "tente de novo".

```ts
function parseList(text: string): string[] {
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  const list = JSON.parse(json) // em try/catch → erro amigável
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) throw new Error('...')
  return list.slice(0, 10)
}
```

Se a lista vier vazia, o sistema **segue direto para a escrita**, sem esperar nada da pessoa.

### Etapa 2 — escrita (HTML)

```
Você monta tutoriais passo a passo, em português do Brasil, para pessoas que vão usar um sistema.
Escreva o tutorial em HTML: só o conteúdo, sem <html>, <head>, <body>, <h1> (o título já vai no topo), <style>, <script>, classes ou estilos.
Use h2 para as etapas, p, ol, ul, li, strong, em, code, blockquote e table quando ajudar. Texto curto e direto, falando com a pessoa ("clique em", "preencha").
Para mostrar um print, use <figure><img src="print-N" alt="descrição"><figcaption>legenda curta</figcaption></figure>, onde N é o número do print. Use cada print no máximo uma vez e não invente prints que não foram enviados.
Responda só com o HTML, sem texto antes ou depois.
```

Mensagem do usuário: as **imagens anexadas** (blocos de imagem, antes do texto) + este texto:

```
O que o tutorial deve ensinar:
<prompt>

Contexto (demanda no OpenProject):
<contexto>

Prints enviados, na mesma ordem das imagens anexadas:
print-1: <descrição do print 1>
print-3: <descrição do print 3>
```

Detalhes importantes:
- Só vão os prints **que têm imagem**, mas mantendo o número original (`print-3` continua `print-3` mesmo se o 2 ficou sem imagem). Assim a pessoa pode pular um print e o agente não confunde a numeração.
- Sem nenhum print: em vez da lista vai `Nenhum print foi enviado: o tutorial sai só com texto, sem <figure> nem <img>.`
- O agente referencia o print por `src="print-N"`; a imagem de verdade só entra na hora de gerar o documento final (ver abaixo). Isso deixa o `body` pequeno e permite trocar um print sem reescrever o texto.

### Ajuste por texto

Mesma etapa de escrita, com duas partes a mais no fim da mensagem:

```
Versão atual do tutorial:
<body atual>

Ajuste pedido (mude só isso e mantenha o resto como está):
<o que a pessoa pediu>
```

"Remontar" (botão `gerar` depois de pronto) é a escrita do zero com os prints atuais, útil depois de trocar imagens.

## Como o agente é chamado

Cada etapa é uma sessão nova e curta do Claude Code (Agent SDK, `query()`), sem `resume`:

- `cwd`: uma pasta vazia só do tutorial (`tutorials/<id>/`).
- **Somente leitura**: `canUseTool` nega toda ferramenta. O agente só pensa e responde; não lê arquivos do sistema nem roda comando.
- Junta todos os eventos de texto até o `result`; se o `result` vier com erro ou o texto vier vazio, a etapa falha.
- Usa as credenciais do Claude de quem criou o tutorial (no nosso caso, cada usuário conecta a própria conta).

```ts
async function ask(prompt, instructions): Promise<string> {
  const texts: string[] = []
  let failure: string | null = null
  const session = claude.start({
    cwd: dir, prompt, model, instructions, readOnly: true, env,
    onEvent: (e) => {
      if (e.type === 'text') texts.push(e.text)
      if (e.type === 'result' && !e.ok) failure = e.error ?? 'O agente não terminou'
    },
  })
  await session.done
  if (failure) throw new Error(failure)
  const text = texts.join('\n').trim()
  if (!text) throw new Error('O agente não respondeu')
  return text
}
```

Como não precisa de ferramentas, dá para trocar o Agent SDK por uma chamada simples à API do Claude (`messages.create` com `system` = instruções e o conteúdo com imagens + texto). Usamos o SDK só porque o resto do sistema já usa e a autenticação é a do Claude Code.

A execução roda em segundo plano no servidor: a rota responde na hora com `status: planning/writing` e a tela faz polling. Um `Set` em memória marca o que está rodando (para o 409). Se o servidor reinicia no meio, na subida os registros em `planning`/`writing` viram `error` com "tente de novo".

Ao terminar cada etapa, o sistema manda notificação para quem criou ("o agente pediu 3 prints", "está pronto", "parou com erro").

## Limpeza do HTML

O documento sai do sistema (é baixado e mandado para outras pessoas), então o HTML do agente é limpo mesmo com o prompt pedindo para não pôr nada disso:

```ts
function cleanBody(text: string) {
  const fenced = text.match(/```(?:html)?\s*\n([\s\S]*?)```/) // às vezes vem em bloco de código
  return (fenced ? fenced[1] : text)
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '') // onclick= etc.
    .trim()
}
```

Se o seu sistema já tem um sanitizador (DOMPurify, sanitize-html), use ele no lugar.

## Documento final (HTML autocontido)

Na hora de baixar/visualizar, o servidor monta um HTML completo:

1. Troca cada `<img src="print-N">` pela imagem embutida em **base64** (`data:image/png;base64,...`). Print sem imagem: a tag some.
2. Envolve com `<!doctype html>`, `<h1>` com o título, link da demanda (se houver) e um CSS fixo (Inter, largura máxima 760px, imagens com borda e cantos arredondados, `break-inside: avoid` em figuras).
3. Nome do arquivo: título sem acento, em minúsculas, com hífens (`como-cadastrar-cliente.html`).

O arquivo abre offline e pode ser mandado para qualquer um. Na pré-visualização dentro do sistema, ele vai num `<iframe>` e a rota responde com CSP restrita (`sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'`), então nada roda mesmo se escapar algo da limpeza.

## PDF

O PDF é gerado a partir desse mesmo HTML, numa **página só da altura do documento** (sem quebras no meio de print), largura 824px:

- **No app desktop (Electron)**: o servidor pede para o processo do Electron, que abre uma `BrowserWindow` invisível, mede `scrollHeight` e chama `webContents.printToPDF` com `pageSize` = largura × altura. Acima de ~19.000px (limite de 200 polegadas do PDF), cai para páginas de proporção A4.
- **No navegador**: a rota responde 501 e a tela imprime o HTML num iframe escondido com `@page { size: 794px <altura>px; margin: 0 }`, abrindo o diálogo "Salvar como PDF".

Sem Electron, dá para fazer o mesmo no servidor com Puppeteer/Playwright (`page.pdf({ width, height })`).

## Tela

- **Novo tutorial**: título (opcional; sem título usa a primeira linha do pedido), o pedido em texto livre, modelo e, opcionalmente, a demanda. Na tela da demanda tem o botão "Criar tutorial" que já preenche a demanda.
- **Tutorial**: mostra o status ("O agente está vendo quais prints precisa…", "…montando o tutorial…"), a lista de prints pedidos com espaço para subir cada imagem, e o preview do documento em iframe.
  - Colar (⌘V/Ctrl+V) em qualquer lugar da tela põe a imagem no print sob o mouse, ou no primeiro sem imagem. Print copiado no Mac às vezes vem só em `clipboardData.items`, não em `files`; tratar os dois.
  - Dá para montar com prints faltando (eles somem do texto).
  - Campo de ajuste por texto, botões de baixar HTML/PDF e "Anexar na demanda".
- **Anexar na demanda**: sobe o PDF e o HTML como anexos e comenta com os links e o aviso: "É um guia para orientar, não cobre 100% dos casos."

## Limites

- Até 10 prints; PNG, JPEG, GIF ou WebP; até 5 MB cada (limite de imagem da API do Claude). O tipo é validado pelos bytes iniciais, não só pela extensão.
- Um tutorial por vez por registro (409 se já está rodando).

## Resumo para implementar

1. Tabela com `status`, `shots` (JSON) e `body`.
2. Etapa de plano: prompt da seção acima → array JSON → `shots`. Vazio → pula para a escrita.
3. Upload/colar de imagens por índice.
4. Etapa de escrita: imagens anexadas + lista `print-N: descrição` → HTML com `src="print-N"`.
5. Limpar o HTML; no download, trocar `print-N` por base64 e envolver com título e CSS.
6. Ajuste = escrita com a versão atual + "mude só isso".
7. Roda em segundo plano, tela faz polling, erro marcado se o servidor reiniciar.
