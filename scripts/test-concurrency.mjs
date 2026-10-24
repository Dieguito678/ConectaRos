import pg from 'pg'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { bootstrapSql } from './lib/test-bootstrap.mjs'

// No .env.local, no hosted Supabase, no cleanup/reset. This script requires a
// NEW disposable local PostgreSQL database and leaves its fixtures for review.
const url = process.env.TEST_DATABASE_URL
if (!url) {
  console.log('NO EJECUTADO: definí TEST_DATABASE_URL para una base PostgreSQL local vacía cuyo nombre termine en _conectaros_test. No usar un proyecto remoto.')
  process.exit(1)
}
let parsed
try { parsed = new URL(url) } catch { console.error('TEST_DATABASE_URL no válida. No se muestran sus valores.'); process.exit(1) }
if (!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_conectaros_test')) {
  console.error('Solo se admite una base local desechable con sufijo _conectaros_test.'); process.exit(1)
}
const pool = new pg.Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000 })
const userA = randomUUID(), userB = randomUUID(), merchant = randomUUID(), business = randomUUID(), reward = randomUUID()
async function tx(user, sql, params) {
  const connection = await pool.connect()
  try {
    await connection.query('begin')
    await connection.query("set local statement_timeout = '10s'")
    await connection.query('set local role authenticated')
    await connection.query("select set_config('request.jwt.claim.sub', $1, true)", [user])
    const result = await connection.query(sql, params)
    await connection.query('commit')
    return result.rows[0]
  } catch (error) { await connection.query('rollback'); throw error }
  finally { connection.release() }
}
try {
  const tables = await pool.query("select count(*)::int as n from information_schema.tables where table_schema in ('public','auth','storage')")
  if (tables.rows[0].n !== 0) throw new Error('La base no está vacía; se abortó sin modificarla.')
  await pool.query(bootstrapSql)
  for (const file of (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    await pool.query(await readFile(`supabase/migrations/${file}`, 'utf8'))
  }
  await pool.query('insert into auth.users(id) values ($1),($2),($3)', [userA,userB,merchant])
  await pool.query("insert into public.businesses(id,owner_id,name,description,address,neighborhood,status) values ($1,$2,'Comercio prueba','Solo pruebas concurrentes','Prueba 123','Centro','aprobado')", [business,merchant])
  await pool.query("insert into public.rewards(id,business_id,title,description,conditions,points_cost,stock,starts_at,ends_at,active) values ($1,$2,'Prueba concurrente','Descripción ficticia','Condiciones de prueba',10,1,now()-interval '1 hour',now()+interval '1 day',true)", [reward,business])
  for (const user of [userA,userB]) {
    await pool.query("insert into public.point_movements(user_id,amount,reason,event_id) values ($1,100,'claim_validated',$2)", [user,randomUUID()])
  }
  let outcomes = await Promise.allSettled([userA,userB].map(user => tx(user, 'select (public.redeem_reward($1,$2)).*', [reward,randomUUID()])))
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1)
  assert.equal((await pool.query('select stock from public.rewards where id=$1', [reward])).rows[0].stock, 0)
  console.log('PASS: dos usuarios compiten por el último stock; solo uno canjea')

  await pool.query('update public.rewards set stock=2 where id=$1', [reward])
  const key = randomUUID()
  outcomes = await Promise.allSettled([1,2].map(() => tx(userA, 'select (public.redeem_reward($1,$2)).*', [reward,key])))
  assert.ok(outcomes.every(o => o.status === 'fulfilled'))
  assert.equal(outcomes[0].value.id, outcomes[1].value.id)
  assert.equal((await pool.query('select stock from public.rewards where id=$1',[reward])).rows[0].stock, 1)
  console.log('PASS: reintentos concurrentes con la misma clave emiten un solo cupón y un débito')

  const balance = Number((await pool.query('select sum(amount) as balance from public.point_movements where user_id=$1',[userA])).rows[0].balance)
  await pool.query('update public.rewards set stock=2,points_cost=$2 where id=$1',[reward,balance])
  outcomes = await Promise.allSettled([1,2].map(() => tx(userA,'select (public.redeem_reward($1,$2)).*',[reward,randomUUID()])))
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length,1)
  assert.equal(Number((await pool.query('select sum(amount) as balance from public.point_movements where user_id=$1',[userA])).rows[0].balance),0)
  console.log('PASS: dos compras simultáneas no gastan el mismo saldo')

  const coupon = (await pool.query('select coupon from public.redemptions limit 1')).rows[0].coupon
  outcomes = await Promise.allSettled([1,2].map(() => tx(merchant,'select public.use_coupon($1)',[coupon])))
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length,1)
  assert.equal(Number((await pool.query("select count(*) as n from public.redemptions where coupon=$1 and status='usado'",[coupon])).rows[0].n),1)
  console.log('PASS: validaciones simultáneas usan el cupón una sola vez')
} catch (error) {
  // Database errors can contain connection credentials; report safe assertions only.
  console.error(error instanceof assert.AssertionError ? 'FALLÓ una aserción de concurrencia.' : 'No se completó la prueba local de concurrencia. Revisá que la base esté vacía y accesible con permisos de creación.')
  process.exitCode = 1
} finally { await pool.end() }
