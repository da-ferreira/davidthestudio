import type { DemandaDetail } from '@studio/shared'

// O agente não acessa o OpenProject: as imagens viram uma nota no lugar do link.
export const demandaDescription = (d: DemandaDetail) =>
  d.description.replace(/!\[([^\]]*)\]\(\/api\/demandas\/anexos\/\d+\)/g, (_, alt) => `(imagem na demanda${alt ? `: ${alt}` : ''})`).trim()

// A demanda inteira em markdown, para colar no terminal.
export function demandaMarkdown(d: DemandaDetail) {
  const comments = d.activities.filter((a) => a.comment).map((a) => `**${a.author ?? 'Alguém'}** (${new Date(a.createdAt).toLocaleString('pt-BR')}):\n\n${a.comment.trim()}`)
  return [`# Demanda #${d.id}: ${d.subject}`, d.url, demandaDescription(d) && `## Descrição\n\n${demandaDescription(d)}`, comments.length && `## Comentários\n\n${comments.join('\n\n---\n\n')}`]
    .filter(Boolean)
    .join('\n\n')
}

// Para colar no terminal: as marcas deixam claro para o Claude onde a demanda começa e termina.
export const demandaClipboard = (d: DemandaDetail) => `--- inicio demanda ---\n\n${demandaMarkdown(d)}\n\n--- fim demanda ---`
