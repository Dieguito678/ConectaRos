import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let server, fetchClaims, toClaim, isPublicSupabaseKey
before(async () => {
  server = await createServer({envDir:false, server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ fetchClaims, toClaim } = await server.ssrLoadModule('/src/lib/claims.ts'))
  ;({ isPublicSupabaseKey } = await server.ssrLoadModule('/src/lib/supabase.ts'))
})
after(async () => { await server?.close() })

const row = {
  id: '20000000-0000-4000-8000-000000000006', title: 'Reclamo remoto', description: 'Descripción desde la base',
  address: 'Prueba 123', neighborhood: 'Centro', status: 'en_tratamiento',
  created_at: '2026-10-24T12:00:00Z', is_demo: true, category: { slug: 'agua' },
}

function fakeClient(pages) {
  const calls = []
  const chain = Object.fromEntries(['select','eq','order','range','abortSignal'].map(method => [method, (...args) => { calls.push([method, ...args]); return chain }]))
  chain.returns = async () => pages.shift()
  return { from(table) { calls.push(['from', table]); return chain }, calls }
}

test('missing configuration rejects instead of returning local examples', async () => {
  await assert.rejects(fetchClaims(new AbortController().signal, null), /configuración válida/)
})
test('frontend rejects secret keys and privileged legacy JWTs', () => {
  const jwt = role => `header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`
  assert.equal(isPublicSupabaseKey('sb_secret_not-a-real-key'), false)
  assert.equal(isPublicSupabaseKey(jwt('service_role')), false)
  assert.equal(isPublicSupabaseKey(jwt('anon')), true)
  assert.equal(isPublicSupabaseKey('sb_publishable_test-only'), true)
})
test('remote error is explicit and does not leak raw error text or fallback data', async () => {
  const client = fakeClient([{ error: { code: 'PGRST205', message: 'private details not to expose' }, data: null }])
  await assert.rejects(fetchClaims(new AbortController().signal, client), error => error.message.includes('PGRST205') && !error.message.includes('private details'))
})
test('successful empty database stays empty', async () => {
  assert.deepEqual(await fetchClaims(new AbortController().signal, fakeClient([{ error: null, data: [] }])), [])
})
test('listing uses database projection, visible moderation filter, and keeps remote identity', async () => {
  const client = fakeClient([{ error: null, data: [row] }])
  const claims = await fetchClaims(new AbortController().signal, client)
  assert.equal(claims.length, 1)
  assert.equal(claims[0].id, row.id)
  assert.equal(claims[0].title, row.title)
  assert.equal(claims[0].workflowStatus, 'en_tratamiento')
  assert.equal(claims[0].status, 'En proceso')
  assert.equal(claims[0].isDemo, true)
  assert.ok(client.calls.some(call => call[0] === 'eq' && call[1] === 'moderation_status' && call[2] === 'aprobado'))
})
test('invalid remote category/state fails visibly instead of mislabelling data', () => {
  assert.throws(() => toClaim({ ...row, category: { slug: 'invalid' } }), /no válidos/)
  assert.throws(() => toClaim({ ...row, status: 'invalid' }), /no válidos/)
})
test('pagination continues after a full page and deduplicates concurrent shifts', async () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ ...row, id: `page-id-${i}` }))
  const client = fakeClient([{ error: null, data: rows }, { error: null, data: [rows[199], { ...row, id: 'last-page-id' }] }])
  assert.equal((await fetchClaims(new AbortController().signal, client)).length, 201)
})
