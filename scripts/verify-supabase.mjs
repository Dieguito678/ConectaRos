import { loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'

// Read-only verification; never print env values, URL, keys or raw errors.
const env = loadEnv('development', process.cwd(), '')
const url = env.VITE_SUPABASE_URL?.trim()
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
console.log(JSON.stringify({ envLocalExists: existsSync('.env.local'), urlConfigured: !!url, publicKeyConfigured: !!key }))
if (!url || !key) { process.exitCode = 1 }
else {
  try {
    const isPublicKey = key.startsWith('sb_publishable_') || (() => {
      try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon' }
      catch { return false }
    })()
    if (!isPublicKey) throw new Error('Key type not allowed')
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const fingerprint = createHash('sha256').update(new URL(url).origin).digest('hex').slice(0, 12)
    console.log(`Huella del destino configurado (no prueba propiedad administrativa): ${fingerprint}`)
    const { data, error, status } = await client.from('claims')
      .select('id,title,description,address,neighborhood,status,created_at,is_demo,category:categories!inner(slug)')
      .eq('moderation_status', 'aprobado').order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, 199).abortSignal(AbortSignal.timeout(15000))
    if (error) {
      console.log(JSON.stringify({ success: false, httpStatus: status, code: /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'NETWORK_OR_UNKNOWN', localFallback: false }))
      process.exitCode = 1
    } else {
      const seedIds = new Set(Array.from({ length: 9 }, (_, i) => `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`))
      console.log(JSON.stringify({ success: true, httpStatus: status, source: 'Supabase REST', visibleRowsInFirstPage: data.length,
        seededRowsInFirstPage: data.filter(row => seedIds.has(row.id) && row.is_demo).length,
        categoriesInFirstPage: [...new Set(data.map(row => row.category?.slug))], localFallback: false }))
    }
  } catch {
    console.log('No fue posible verificar la consulta remota. No se muestran valores ni errores crudos de configuración.')
    process.exitCode = 1
  }
}
