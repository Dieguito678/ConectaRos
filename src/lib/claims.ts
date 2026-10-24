import { categories, workflowLabels, type Category, type Claim } from '../types/claim'
import { createSupabaseClient } from './supabase'
import type { DatabaseRows } from '../types/database.generated'

// Tipos generados desde las migraciones locales, no desde un proyecto remoto.
export type PublicClaimRow = Pick<DatabaseRows['claims'],
  'id' | 'title' | 'description' | 'address' | 'neighborhood' | 'status' | 'created_at' | 'is_demo'
> & { category: Pick<DatabaseRows['categories'], 'slug'> | null }

export const claimsProjection = 'id,title,description,address,neighborhood,status,created_at,is_demo,category:categories!inner(slug)'

export function toClaim(row: PublicClaimRow): Claim {
  if (!row.category || !categories.includes(row.category.slug as Category) || !(row.status in workflowLabels)
    || !Number.isFinite(Date.parse(row.created_at))) {
    throw new Error('La base devolvió un reclamo con categoría, estado o fecha no válidos.')
  }
  return {
    id: row.id, title: row.title, description: row.description, address: row.address,
    neighborhood: row.neighborhood, category: row.category.slug as Category,
    status: row.status === 'resuelto' ? 'Resuelto' : row.status === 'publicado' ? 'Pendiente' : 'En proceso',
    workflowStatus: row.status, date: row.created_at.slice(0, 10), isDemo: row.is_demo,
  }
}

export async function fetchClaims(signal: AbortSignal, supabase = createSupabaseClient()): Promise<Claim[]> {
  if (!supabase) throw new Error('Falta una configuración válida de Supabase. Revisá VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local y reiniciá Vite.')
  // RLS + filtro explícito: la pantalla pública nunca muestra filas pendientes
  // aunque en el futuro el visitante tenga una sesión de administrador.
  // Paginación estable para no truncar silenciosamente al límite REST de 1000.
  const allRows: PublicClaimRow[] = []
  const pageSize = 200
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('claims').select(claimsProjection)
      .eq('moderation_status', 'aprobado').order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(offset, offset + pageSize - 1)
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(15000)])).returns<PublicClaimRow[]>()
    if (error) {
      // No registrar URLs, cabeceras, claves ni el cuerpo crudo del error.
      const code = /^[A-Z0-9_]+$/.test(error.code) ? ` (${error.code})` : ''
      throw new Error(`No se pudieron consultar los reclamos en Supabase${code}. Verificá la conexión, las migraciones y los permisos RLS. No se cargaron datos locales.`)
    }
    if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError')
    allRows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  // A concurrent insertion during pagination can shift page boundaries.
  return [...new Map(allRows.map(row => [row.id, toClaim(row)])).values()]
}
