export const categories = ['alumbrado', 'residuos', 'baches', 'veredas', 'arbolado', 'agua', 'electricidad', 'gas', 'otros'] as const
export type Category = typeof categories[number]
export type ClaimStatus = 'Pendiente' | 'En proceso' | 'Resuelto'
export interface Claim {
  id: string
  title: string
  category: Category
  neighborhood: string
  address: string
  description: string
  status: ClaimStatus
  date: string
}
