import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Preparado para la futura integración. La demo no importa ni invoca este módulo.
// Inicialización explícita: evita sesiones o solicitudes al abrir la aplicación.
export function createSupabaseClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key)
}
