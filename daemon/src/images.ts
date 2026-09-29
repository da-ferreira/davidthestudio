import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './db.ts'
import { HttpError } from './http-error.ts'

// Fora da pasta da tarefa: as imagens continuam no histórico depois de concluir o ticket.
export const IMAGES_DIR = path.join(DATA_DIR, 'images')
fs.mkdirSync(IMAGES_DIR, { recursive: true })

// Limite de imagem da API do Claude.
export const MAX_BYTES = 5 * 1024 * 1024
export const MAX_IMAGES = 10

type MediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

const TYPES: Record<MediaType, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/gif': { ext: 'gif', magic: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
}

const ID = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/

export function mediaTypeOf(id: string): MediaType {
  const ext = path.extname(id).slice(1)
  return (Object.keys(TYPES) as MediaType[]).find((t) => TYPES[t].ext === ext)!
}

export function saveImage(mediaType: string, base64: string): string {
  const type = TYPES[mediaType as MediaType]
  if (!type) throw new HttpError(400, 'Só dá para anexar PNG, JPEG, GIF ou WebP')
  const data = Buffer.from(base64 ?? '', 'base64')
  if (!data.length) throw new HttpError(400, 'A imagem está vazia')
  if (data.length > MAX_BYTES) throw new HttpError(400, 'A imagem passa de 5 MB')
  if (!type.magic(data)) throw new HttpError(400, 'O arquivo não é uma imagem válida')
  const id = `${randomUUID()}.${type.ext}`
  fs.writeFileSync(path.join(IMAGES_DIR, id), data)
  return id
}

export function imagePath(id: string): string {
  const file = path.join(IMAGES_DIR, id)
  if (!ID.test(id) || !fs.existsSync(file)) throw new HttpError(404, 'Imagem não encontrada')
  return file
}

// Valida os ids que chegam com a mensagem; ausente vira lista vazia.
export function checkImages(ids: unknown): string[] {
  if (ids == null) return []
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new HttpError(400, 'Imagens inválidas')
  const list = [...new Set(ids as string[])]
  if (list.length > MAX_IMAGES) throw new HttpError(400, `Dá para anexar até ${MAX_IMAGES} imagens por mensagem`)
  for (const id of list) imagePath(id)
  return list
}

export function imageBlocks(ids: string[]) {
  return ids.map((id) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: mediaTypeOf(id), data: fs.readFileSync(imagePath(id)).toString('base64') },
  }))
}
