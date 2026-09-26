import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent } from '@studio/shared'

const MAX_OUTPUT = 4000

type StartOptions = {
  cwd: string
  prompt: string
  model: string
  instructions: string
  onEvent: (e: AgentEvent) => void
}

// Roda o Claude Code até o fim; resolve quando o agente termina ou falha.
export async function start({ cwd, prompt, model, instructions, onEvent }: StartOptions): Promise<void> {
  const q = query({
    prompt,
    options: {
      cwd,
      model,
      // Edições dentro da pasta da tarefa passam; o resto segue as regras de permissão do usuário.
      permissionMode: 'acceptEdits',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: instructions },
    },
  })
  for await (const m of q) for (const e of translate(m)) onEvent(e)
}

function translate(m: SDKMessage): AgentEvent[] {
  if (m.type === 'system' && m.subtype === 'init') return [{ type: 'start', sessionId: m.session_id, model: m.model }]
  if (m.type === 'assistant') {
    return m.message.content.flatMap((b): AgentEvent[] => {
      if (b.type === 'text' && b.text.trim()) return [{ type: 'text', text: b.text }]
      if (b.type === 'tool_use') return [{ type: 'tool', id: b.id, name: b.name, input: b.input as Record<string, unknown> }]
      return []
    })
  }
  if (m.type === 'user' && Array.isArray(m.message.content)) {
    return m.message.content.flatMap((b): AgentEvent[] =>
      b.type === 'tool_result'
        ? [{ type: 'tool_result', id: b.tool_use_id, error: !!b.is_error, output: textOf(b.content).slice(0, MAX_OUTPUT) }]
        : [],
    )
  }
  if (m.type === 'result') {
    return [
      {
        type: 'result',
        ok: m.subtype === 'success' && !m.is_error,
        costUsd: m.total_cost_usd,
        durationMs: m.duration_ms,
        turns: m.num_turns,
        error: m.subtype === 'success' ? undefined : m.errors.join('\n') || m.subtype,
      },
    ]
  }
  return []
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c) => (c?.type === 'text' ? c.text : '')).join('\n')
  return ''
}
