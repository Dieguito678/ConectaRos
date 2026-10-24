import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Used only by the disposable, in-memory PGlite runner. No environment or HTTP.
const migrationCategory = '11000000-0000-4000-8000-000000000007'
const migrationClaim = '25000000-0000-4000-8000-000000000007'

export async function preparePublicationMigrationCheck(db) {
  await db.exec(`
    insert into public.categories(id,slug,name) values ('${migrationCategory}','otros','Categoría local de prueba');
    insert into public.claims(id,category_id,title,description,address,neighborhood,is_demo,status,moderation_status)
    values ('${migrationClaim}','${migrationCategory}','Pendiente histórico de prueba',
      'Fixture local antes de aplicar la migración','Prueba 123','Centro',true,'en_tratamiento','pendiente');
  `)
  return (await db.query(`select to_jsonb(c) as claim from public.claims c where id='${migrationClaim}'`)).rows
}

export async function verifyPublicationMigrationCheck(db, before) {
  const after = await db.query(`select to_jsonb(c) as claim from public.claims c where id='${migrationClaim}'`)
  assert.deepEqual(after.rows,before,'the structural migration must not publish or alter historical claims')
  assert.equal((await db.query('select count(*)::int as n from public.point_movements')).rows[0].n,0)
  // Remove just these local fixtures before loading the ordinary seed/suites.
  await db.exec(`delete from public.claims where id='${migrationClaim}'; delete from public.categories where id='${migrationCategory}';`)
}

export async function verifyOptionalPublicationScript(db) {
  const optionalSql = await readFile('supabase/scripts/publish_pending_claims.sql','utf8')
  const writeBlock = optionalSql.match(/\/\*\s*(begin;[\s\S]*?commit;)\s*\*\//i)?.[1]
  assert.ok(writeBlock,'the optional UPDATE must remain commented and separate from its preview')
  const prefix = '26000000-0000-4000-8000-0000000000'
  await db.exec(`
    insert into public.claims(id,category_id,title,description,address,neighborhood,is_demo,status,moderation_status)
    select ('${prefix}'||suffix)::uuid,'10000000-0000-4000-8000-000000000001',
      'Publicación opcional '||suffix,'Fixture local para verificar el archivo SQL real',
      'Prueba 456','Centro',true,stage::public.claim_status,moderation::public.moderation_status
    from (values ('01','publicado','pendiente'),('02','en_tratamiento','pendiente'),
      ('03','resuelto','pendiente'),('04','publicado','aprobado'),
      ('05','presentado','rechazado'),('06','publicado','oculto')) as f(suffix,stage,moderation);
  `)
  const snapshot = async () => (await db.query("select to_jsonb(c)-'updated_at' as claim from public.claims c order by id")).rows.map(row=>row.claim)
  const ledger = async () => (await db.query('select * from public.point_movements order by id')).rows
  const before = await snapshot(), pointsBefore = await ledger()
  const pending = before.filter(claim=>claim.moderation_status==='pendiente')
  const preview = await db.exec(optionalSql)
  assert.deepEqual(preview.flatMap(result=>result.rows??[]).map(row=>row.id).sort(),pending.map(claim=>claim.id).sort())
  assert.deepEqual(await snapshot(),before,'running the optional file as-is only previews')
  const changed = (await db.exec(writeBlock)).flatMap(result=>result.rows??[])
  assert.deepEqual(changed.map(({id,title})=>({id,title})).sort((a,b)=>a.id.localeCompare(b.id)),
    pending.map(({id,title})=>({id,title})).sort((a,b)=>a.id.localeCompare(b.id)))
  assert.deepEqual(await snapshot(),before.map(claim=>claim.moderation_status==='pendiente'?{...claim,moderation_status:'aprobado'}:claim),
    'the optional script only approves pending moderation; management and all other content remain unchanged')
  assert.deepEqual(await ledger(),pointsBefore,'optional publication never awards points')
  assert.equal((await db.exec(writeBlock)).flatMap(result=>result.rows??[]).length,0,'repeating optional publication changes no rows')
}
