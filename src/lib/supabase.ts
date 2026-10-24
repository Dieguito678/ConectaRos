import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true
  // Compatibilidad con claves anon antiguas; nunca aceptar service_role.
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role === 'anon'
  } catch { return false }
}

// Única instancia compartida. No se crea otra al reintentar una consulta.
export function createSupabaseClient(): SupabaseClient | null {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key || !isPublicSupabaseKey(key)) return null
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    client = createClient(url, key)
    return client
  } catch {
    return null
  }
}
