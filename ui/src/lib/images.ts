import type { UploadedImage } from '@studio/shared'
import { api } from '@/lib/api'

// Os mesmos limites do daemon (daemon/src/images.ts).
export const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const MAX_BYTES = 5 * 1024 * 1024
export const MAX_IMAGES = 10

export const imageUrl = (id: string) => `/api/images/${id}`

// Mensagem de erro se o arquivo não pode ser anexado; null se pode.
export function checkFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return 'Só dá para anexar PNG, JPEG, GIF ou WebP'
  if (file.size > MAX_BYTES) return 'A imagem passa de 5 MB'
  return null
}

export async function uploadImage(file: File): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Não deu para ler a imagem'))
    reader.readAsDataURL(file)
  })
  const { id } = await api<UploadedImage>('/images', { method: 'POST', body: { mediaType: file.type, data: url.slice(url.indexOf(',') + 1) } })
  return id
}
