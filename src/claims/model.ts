import type { DatabaseRows } from '../types/database.generated'
import { workflowLabels, type Category } from '../types/claim'

export type ClaimCategory = DatabaseRows['categories'] & { slug: Category }
export type OwnClaim = DatabaseRows['claims'] & { category: { slug: Category; name: string } }
export type ClaimHistory = DatabaseRows['claim_history']
export interface ClaimDraft { title: string; categoryId: string; description: string; address: string; neighborhood: string }
export interface ClaimCursor { created_at: string; id: string }
export const emptyDraft: ClaimDraft = { title: '', categoryId: '', description: '', address: '', neighborhood: '' }
export const categoryNames: Record<Category, string> = {
  alumbrado: 'Alumbrado público', residuos: 'Residuos y limpieza', baches: 'Baches', veredas: 'Veredas', arbolado: 'Arbolado',
  agua: 'Agua', electricidad: 'Electricidad', gas: 'Gas', otros: 'Otros reclamos',
}
export const moderationLabels = { pendiente: 'Pendiente de revisión', aprobado: 'Aprobado', rechazado: 'Rechazado', oculto: 'Oculto' } as const
export function managementLabel(claim: OwnClaim) {
  return claim.status==='publicado'&&claim.moderation_status!=='aprobado'?'Registrado (sin publicación pública)':workflowLabels[claim.status]
}
export function validateClaim(draft: ClaimDraft, categories: ClaimCategory[]) {
  const errors: Partial<Record<keyof ClaimDraft, string>> = {}
  const limits = { title: [5,160], description: [10,5000], address: [3,240], neighborhood: [2,100] } as const
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const [min,max] = limits[key], size = Array.from(draft[key].trim()).length
    if (size < min || size > max) errors[key] = `Ingresá entre ${min} y ${max} caracteres, sin contar espacios exteriores.`
  }
  if (!categories.some(category => category.id === draft.categoryId)) errors.categoryId = 'Elegí una categoría disponible.'
  return errors
}
export const photoTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
export const maxPhotoBytes = 5 * 1024 * 1024
export async function validatePhoto(file: File): Promise<string | null> {
  if (!Object.hasOwn(photoTypes,file.type)) return 'Elegí una imagen JPEG, PNG o WebP.'
  if (!file.size || file.size > maxPhotoBytes) return 'La fotografía debe pesar entre 1 byte y 5 MiB.'
  const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer())
  const matches = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
      : String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP'
  return matches ? null : 'El contenido no coincide con el formato de imagen indicado.'
}
