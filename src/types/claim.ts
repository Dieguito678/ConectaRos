import type { DatabaseEnums } from './database.generated'

export const categories = ['alumbrado', 'residuos', 'baches', 'veredas', 'arbolado', 'agua', 'electricidad', 'gas', 'otros'] as const
export type Category = typeof categories[number]
export type ClaimStatus = 'Pendiente' | 'En proceso' | 'Resuelto'
export const workflowLabels = {
  publicado: 'Publicado', en_revision: 'En revisión', presentado: 'Presentado',
  recepcion_confirmada: 'Recepción confirmada', en_tratamiento: 'En tratamiento',
  solucion_informada: 'Solución informada', resuelto: 'Resuelto',
} as const satisfies Record<DatabaseEnums['claim_status'], string>
export type WorkflowStatus = keyof typeof workflowLabels
export interface Claim {
  id: string
  title: string
  category: Category
  neighborhood: string
  address: string
  description: string
  status: ClaimStatus
  date: string
  workflowStatus?: WorkflowStatus
  isDemo?: boolean
}
