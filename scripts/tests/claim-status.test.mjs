import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let server, getClaimPresentation
before(async () => {
  server = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ getClaimPresentation } = await server.ssrLoadModule('/src/lib/claim-status.ts'))
})
after(async () => { await server?.close() })

test('approved management states map to a readable traffic-light summary and exact stage', () => {
  const cases = [
    ['publicado', 'red', 'Pendiente', 'Publicado'],
    ['en_revision', 'amber', 'En proceso', 'En revisión'],
    ['presentado', 'amber', 'En proceso', 'Presentado'],
    ['recepcion_confirmada', 'amber', 'En proceso', 'Recepción confirmada'],
    ['en_tratamiento', 'amber', 'En proceso', 'En tratamiento'],
    ['solucion_informada', 'amber', 'En proceso', 'Solución informada'],
    ['resuelto', 'green', 'Resuelto', 'Resuelto'],
  ]
  for (const [status, tone, label, stageLabel] of cases) {
    const result = getClaimPresentation({ status, moderationStatus: 'aprobado' })
    assert.equal(result.tone, tone)
    assert.equal(result.label, label)
    assert.equal(result.stageLabel, stageLabel)
    assert.equal(result.domain, 'management')
    assert.ok(result.helper)
  }
})

test('pending review takes precedence over every management state, including resolved', () => {
  for (const status of ['publicado', 'en_revision', 'presentado', 'recepcion_confirmada', 'en_tratamiento', 'solucion_informada', 'resuelto']) {
    const result = getClaimPresentation({ status, moderationStatus: 'pendiente' })
    assert.equal(result.label, 'En revisión')
    assert.equal(result.tone, 'amber')
    assert.equal(result.domain, 'moderation')
    assert.match(result.helper, /Todavía no es visible/)
    assert.notEqual(result.label, 'Publicado')
    assert.notEqual(result.label, 'Resuelto')
  }
})

test('rejected and hidden claims are not confused with pending management', () => {
  const rejected = getClaimPresentation({ status: 'publicado', moderationStatus: 'rechazado' })
  assert.equal(rejected.label, 'No aprobado')
  assert.equal(rejected.tone, 'red')
  assert.equal(rejected.domain, 'moderation')
  const hidden = getClaimPresentation({ status: 'resuelto', moderationStatus: 'oculto' })
  assert.equal(hidden.label, 'No visible')
  assert.equal(hidden.tone, 'neutral')
  assert.equal(hidden.domain, 'moderation')
})

test('solution reported remains amber until resolution is confirmed', () => {
  const result = getClaimPresentation({ status: 'solucion_informada' })
  assert.equal(result.tone, 'amber')
  assert.equal(result.label, 'En proceso')
  assert.equal(result.stageLabel, 'Solución informada')
})
