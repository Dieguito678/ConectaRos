import { createSupabaseClient } from '../lib/supabase'
import { categories } from '../types/claim'
import type { ClaimCategory, ClaimCursor, ClaimDraft, ClaimHistory, OwnClaim } from './model'

export interface ClaimScope { userId: string; signal: AbortSignal; isCurrent: () => boolean }
export function checkScope(scope: ClaimScope) {
  if (scope.signal.aborted || !scope.isCurrent()) throw new DOMException('Operación cancelada', 'AbortError')
}
export class ClaimError extends Error {
  constructor(message: string, public uncertain = false) { super(message) }
}
function safeError(error: { code?: string; status?: number } | null) {
  if (['42501','PGRST301','PGRST302','PGRST303'].includes(error?.code??'') || error?.status === 401) return 'Tu sesión venció o no tiene permiso. Volvé a ingresar y comprobá el reclamo antes de continuar.'
  if (error?.code === '23503') return 'La categoría ya no está disponible. Recargá las categorías.'
  if (error?.code === '22023' || error?.code === '23514') return 'Revisá los campos o el contenido asociado a este intento.'
  if (error?.code === 'PGRST202') return 'Falta aplicar la migración de creación de reclamos o recargar el esquema de Supabase.'
  return 'No pudimos completar la operación. Revisá la conexión y los permisos y reintentá.'
}
const projection = 'id,author_id,category_id,entity_id,title,description,address,neighborhood,latitude,longitude,status,moderation_status,is_demo,created_at,updated_at,category:categories!inner(slug,name)'
export function createClaimsRepository(client = createSupabaseClient()) {
  function db() { if (!client) throw new ClaimError('Falta configurar Supabase.'); return client }
  const signal = (scope: ClaimScope) => AbortSignal.any([scope.signal, AbortSignal.timeout(20000)])
  async function getOwn(id: string, scope: ClaimScope): Promise<OwnClaim | null> {
    checkScope(scope)
    const { data, error } = await db().from('claims').select(projection).eq('author_id', scope.userId).eq('id', id)
      .abortSignal(signal(scope)).maybeSingle<OwnClaim>()
    checkScope(scope)
    if (error) throw new ClaimError(safeError(error), true)
    return data
  }
  return {
    async categories(abort: AbortSignal): Promise<ClaimCategory[]> {
      const { data,error } = await db().from('categories').select('id,slug,name').order('name').abortSignal(abort)
      if (error) throw new ClaimError('No pudimos cargar las categorías desde Supabase.')
      return (data ?? []).filter(row => categories.includes(row.slug)).map(row => row as ClaimCategory)
    },
    getOwn,
    async list(scope: ClaimScope, cursor?: ClaimCursor) {
      checkScope(scope)
      let query = db().from('claims').select(projection).eq('author_id', scope.userId)
        .order('created_at', { ascending:false }).order('id', { ascending:false })
      if (cursor) {
        if (!/^[\dTZ:.+\-]+$/.test(cursor.created_at) || !/^[a-f\d-]{36}$/i.test(cursor.id)) throw new ClaimError('Paginación no válida.')
        query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
      }
      const {data,error} = await query.limit(13).abortSignal(signal(scope)).returns<OwnClaim[]>()
      checkScope(scope)
      if (error) throw new ClaimError(safeError(error))
      const rows = (data ?? []).slice(0,12)
      return { rows, more: (data?.length ?? 0) > 12, cursor: rows.at(-1) }
    },
    async submit(id: string, draft: ClaimDraft, scope: ClaimScope) {
      checkScope(scope)
      // Reconcile before every attempt, including retries after lost responses.
      const existing = await getOwn(id,scope)
      if (existing) {
        if (existing.title!==draft.title.trim()||existing.description!==draft.description.trim()||existing.address!==draft.address.trim()||existing.neighborhood!==draft.neighborhood.trim()||existing.category_id!==draft.categoryId) throw new ClaimError('Este intento ya corresponde a otro contenido. Comprobá Mis reclamos antes de continuar.',true)
        return existing.id
      }
      let failure: {code?:string;status?:number} | null = null
      try {
        const { data,error } = await db().rpc('submit_demo_claim', {
          p_request_id:id, p_expected_user:scope.userId, p_category_id:draft.categoryId,
          p_title:draft.title.trim(), p_description:draft.description.trim(), p_address:draft.address.trim(), p_neighborhood:draft.neighborhood.trim(),
        }).abortSignal(signal(scope))
        checkScope(scope)
        if (!error && data === id) return id
        failure = error
      } catch { checkScope(scope) }
      try { if (await getOwn(id,scope)) return id } catch { checkScope(scope) }
      const definite = failure?.code && ['42501','23503','22023','23514','PGRST202'].includes(failure.code)
      throw new ClaimError(definite ? safeError(failure) : 'No pudimos confirmar si el reclamo se guardó. Conservamos el intento: comprobá y continuá antes de enviar otro.', !definite)
    },
    async attach(id: string, path: string, file: File, scope: ClaimScope) {
      async function bind() {
        checkScope(scope)
        const response = await db().rpc('attach_own_claim_photo', { p_claim_id:id, p_expected_user:scope.userId, p_storage_path:path }).abortSignal(signal(scope))
        checkScope(scope)
        return response
      }
      // A prior upload may have succeeded even when its HTTP response was lost.
      const prior = await bind()
      if (!prior.error) return
      if (prior.error.code !== 'P0002') throw new ClaimError(safeError(prior.error))
      checkScope(scope)
      try {
        // No upsert: immutable evidence must never be replaced.
        await db().storage.from('claim-photos').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'0'})
      } catch { checkScope(scope) }
      checkScope(scope)
      // Check association after any upload result (including conflict/network).
      const associated = await bind()
      if (associated.error) throw new ClaimError('El reclamo se guardó, pero no pudimos confirmar la foto. Reintentá solo la imagen; no vuelvas a crear el reclamo.')
    },
    async details(id: string, scope: ClaimScope) {
      const claim = await getOwn(id,scope)
      if (!claim) return null
      const [attachments,history] = await Promise.all([
        db().from('claim_attachments').select('storage_path').eq('claim_id',id).eq('owner_id',scope.userId).is('contribution_id',null).limit(1).abortSignal(signal(scope)),
        db().from('claim_history').select('id,claim_id,previous_status,new_status,public_note,created_at').eq('claim_id',id)
          .order('created_at',{ascending:true}).order('id').limit(100).abortSignal(signal(scope)).returns<ClaimHistory[]>(),
      ])
      checkScope(scope)
      return {claim,path:attachments.error ? null : attachments.data?.[0]?.storage_path ?? null,
        history:history.data ?? [], attachmentError:!!attachments.error, historyError:!!history.error}
    },
    async photo(path: string, scope: ClaimScope): Promise<Blob> {
      checkScope(scope)
      const {data,error} = await db().storage.from('claim-photos').download(path,{}, {signal:signal(scope)})
      checkScope(scope)
      if (error || !data) throw new ClaimError('No pudimos cargar la fotografía privada. Reintentá.')
      return data
    },
  }
}
export type ClaimsRepository = ReturnType<typeof createClaimsRepository>
