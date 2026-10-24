import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import { bootstrapSql } from './lib/test-bootstrap.mjs'

// Real PostgreSQL in WASM, with minimal substitutes for hosted Auth/Storage.
// Never connects to a project and never reads .env.local.
const db = new PGlite()
try {
  await db.exec(bootstrapSql)
  for (const file of (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
    console.log(`PASS migración ${file}`)
  }
  await db.exec(await readFile('supabase/seed.sql', 'utf8'))
  await db.exec(await readFile('supabase/seed.sql', 'utf8'))
  const result = await db.query('select count(*)::int as claims from public.claims')
  if (result.rows[0].claims !== 9) throw new Error('Seed no idempotente')
  console.log('PASS seed repetible: 9 reclamos, sin duplicados')
  for (const file of (await readdir('supabase/tests')).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(`supabase/tests/${file}`, 'utf8'))
    console.log(`PASS ${file}`)
  }
  console.log('Pruebas PostgreSQL locales completas. No prueba Auth/Storage HTTP ni concurrencia entre conexiones de un Supabase real.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally { await db.close() }
