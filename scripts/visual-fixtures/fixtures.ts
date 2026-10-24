import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Claim, Category, WorkflowStatus } from '../../src/types/claim'
import type { ClaimsRepository, ClaimScope } from '../../src/claims/repository'
import type { ClaimCategory, OwnClaim } from '../../src/claims/model'

export const scenarioOptions = [
  ['home', 'Inicio · sin sesión'],
  ['session', 'Inicio · con sesión'],
  ['own', 'Cuenta · reclamos con estados'],
  ['empty', 'Cuenta · sin reclamos'],
  ['loading', 'Carga del listado público'],
  ['error', 'Error del listado público'],
  ['own-loading', 'Carga de Mis reclamos'],
  ['own-error', 'Error de Mis reclamos'],
] as const
export type Scenario = typeof scenarioOptions[number][0]
export const fixtureUserId = '33000000-0000-4000-8000-000000000001'
const slugs: Category[] = ['alumbrado','residuos','baches','veredas','arbolado','agua','electricidad','gas','otros']
const names = ['Alumbrado público','Residuos y limpieza','Baches','Veredas','Arbolado','Agua','Electricidad','Gas','Otros reclamos']
export const fixtureCategories: ClaimCategory[] = slugs.map((slug,index) => ({
  id: `10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`, slug, name:names[index],
}))

const sampleText = [
  ['Luminarias apagadas en la cuadra','Dos luces no encienden por la noche. Este relato es un ejemplo aislado para revisar el diseño.','Güemes al 2300','Pichincha'],
  ['Residuos fuera del contenedor','Se observa acumulación de bolsas junto al contenedor. Ejemplo de presentación, sin reporte real.','San Juan al 1200','Centro'],
  ['Bache en el cruce peatonal','La calzada presenta una rotura junto al cruce. Datos ficticios exclusivos de esta revisión visual.','Mendoza y Cafferata','Echesortu'],
  ['Vereda con paso recuperado','Una situación ilustrativa permite mostrar cómo se presenta un reclamo con resolución confirmada.','Entre Ríos al 1900','Abasto'],
  ['Ramas sobre la vereda','Las ramas bajas dificultan el paso. Ejemplo aislado para comprobar el detalle y la categoría.','Jujuy al 2400','Pichincha'],
  ['Pérdida de agua sobre la calzada','Se utiliza un relato inventado sobre una pérdida de agua para revisar el diseño de la tarjeta.','Eva Perón al 8000','Fisherton'],
  ['Interrupción del servicio eléctrico','Ejemplo ficticio sobre el suministro del barrio. No representa una interrupción real.','Bv. Rondeau al 2100','Alberdi'],
  ['Consulta sobre el suministro de gas','Este ejemplo no corresponde a una incidencia real ni a un aviso de emergencia.','Av. Alberdi al 900','Arroyito'],
  ['Señal de la plaza deteriorada','Ejemplo de una situación en el espacio público, creado únicamente para la revisión visual.','Plaza Sarmiento','Centro'],
]
const publicStages: WorkflowStatus[] = ['en_tratamiento','publicado','publicado','resuelto','en_revision','recepcion_confirmada','solucion_informada','presentado','resuelto']
export const publicFixtures: Claim[] = sampleText.map(([title,description,address,neighborhood],index) => ({
  id:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
  title,description,address,neighborhood,category:slugs[index],isDemo:true,date:`2026-10-${String(24-Math.floor(index/2)).padStart(2,'0')}`,
  status:publicStages[index]==='resuelto'?'Resuelto':publicStages[index]==='publicado'?'Pendiente':'En proceso',workflowStatus:publicStages[index],
}))

const ownStates: Array<[OwnClaim['moderation_status'], WorkflowStatus]> = [
  ['pendiente','publicado'],['aprobado','publicado'],['aprobado','en_revision'],['aprobado','en_tratamiento'],
  ['aprobado','solucion_informada'],['aprobado','resuelto'],['rechazado','publicado'],['oculto','en_tratamiento'],
]
function makeOwnFixture(index: number): OwnClaim {
  const [moderation_status,status] = ownStates[index % ownStates.length]
  const sample = sampleText[index % sampleText.length]
  const category = fixtureCategories[index % fixtureCategories.length]
  return {
    id:`23000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,author_id:fixtureUserId,
    title:sample[0],description:sample[1],address:sample[2],neighborhood:sample[3],category_id:category.id,
    entity_id:null,latitude:null,longitude:null,status,moderation_status,is_demo:true,
    created_at:new Date(Date.UTC(2026,9,24-index,12,30)).toISOString(),updated_at:new Date(Date.UTC(2026,9,24-index,12,30)).toISOString(),
    category:{slug:category.slug,name:category.name},
  }
}

function ensureCurrent(scope: ClaimScope) {
  if(scope.signal.aborted || !scope.isCurrent()) throw new DOMException('Consulta cancelada','AbortError')
}
async function wait(signal?: AbortSignal, milliseconds = 160): Promise<void> {
  if(signal?.aborted) throw new DOMException('Consulta cancelada','AbortError')
  await new Promise<void>((resolve,reject) => {
    const timer=setTimeout(() => { signal?.removeEventListener('abort',abort); resolve() },milliseconds)
    function abort(){clearTimeout(timer);reject(new DOMException('Consulta cancelada','AbortError'))}
    signal?.addEventListener('abort',abort,{once:true})
  })
}
async function hold(signal: AbortSignal): Promise<never> {
  if(signal.aborted) throw new DOMException('Consulta cancelada','AbortError')
  return new Promise((_resolve,reject) => signal.addEventListener('abort',() => reject(new DOMException('Consulta cancelada','AbortError')),{once:true}))
}

export function createFixtureRepository(scenario: Scenario): ClaimsRepository {
  const rows = scenario==='empty' ? [] : Array.from({length:14},(_,index)=>makeOwnFixture(index))
  const images = new Map<string,Blob>()
  const illustratedPhotoId=rows[3]?.id
  let illustratedPhoto:Promise<Blob>|null=null
  function imageFixture():Promise<Blob>{
    illustratedPhoto??=new Promise(resolve=>{
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540
      const context=canvas.getContext('2d')!
      context.fillStyle='#d9e4d0';context.fillRect(0,0,960,540)
      context.fillStyle='#e8ede1';context.fillRect(0,0,960,180)
      context.fillStyle='#8b9485';context.fillRect(0,230,960,310)
      context.fillStyle='#65705d';context.beginPath();context.ellipse(500,385,150,55,-.1,0,Math.PI*2);context.fill()
      context.fillStyle='#fff';context.fillRect(50,48,620,115)
      context.fillStyle='#244c35';context.font='bold 34px Segoe UI, Arial';context.fillText('Imagen de ejemplo',74,98)
      context.font='22px Segoe UI, Arial';context.fillText('Revisión visual aislada · sin reporte real',74,135)
      canvas.toBlob(blob=>resolve(blob!),'image/png')
    })
    return illustratedPhoto
  }
  return {
    async categories(signal){await wait(signal);return fixtureCategories},
    async getOwn(id,scope){ensureCurrent(scope);await wait(scope.signal);return rows.find(row=>row.id===id&&row.author_id===scope.userId)??null},
    async list(scope,cursor){
      ensureCurrent(scope)
      if(scenario==='own-loading') return hold(scope.signal)
      await wait(scope.signal)
      if(scenario==='own-error') throw new Error('Fallo aislado de consulta')
      const own=rows.filter(row=>row.author_id===scope.userId)
      const start=cursor ? own.findIndex(row=>row.id===cursor.id)+1 : 0
      const page=own.slice(start,start+12)
      return {rows:page,more:start+12<own.length,cursor:page.at(-1)}
    },
    async submit(id,draft,scope){
      ensureCurrent(scope);await wait(scope.signal,450);ensureCurrent(scope)
      if(!rows.some(row=>row.id===id)){
        const category=fixtureCategories.find(value=>value.id===draft.categoryId)!
        rows.unshift({...makeOwnFixture(0),id,author_id:scope.userId,title:draft.title.trim(),description:draft.description.trim(),address:draft.address.trim(),neighborhood:draft.neighborhood.trim(),category_id:category.id,category:{slug:category.slug,name:category.name},created_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      }
      return id
    },
    async attach(id,_path,file,scope){ensureCurrent(scope);await wait(scope.signal,500);ensureCurrent(scope);images.set(id,file)},
    async details(id,scope){
      ensureCurrent(scope);await wait(scope.signal)
      const claim=rows.find(row=>row.id===id&&row.author_id===scope.userId)
      if(!claim)return null
      const history=claim.moderation_status==='aprobado'&&claim.status!=='publicado' ? [
        {id:`90000000-0000-4000-8000-000000000001`,claim_id:id,previous_status:null,new_status:'publicado' as const,public_note:'Registro ilustrativo disponible para seguimiento.',created_at:claim.created_at},
        {id:`90000000-0000-4000-8000-000000000002`,claim_id:id,previous_status:'publicado' as const,new_status:claim.status,public_note:'Actualización de ejemplo para revisar la línea de tiempo.',created_at:claim.updated_at},
      ] : []
      return {claim,path:images.has(id)||id===illustratedPhotoId?id:null,history,attachmentError:false,historyError:false}
    },
    async photo(path,scope){ensureCurrent(scope);await wait(scope.signal);return images.get(path)??imageFixture() },
  }
}

export function loadFixtureClaims(scenario: Scenario) {
  return async(signal:AbortSignal):Promise<Claim[]> => {
    if(scenario==='loading')return hold(signal)
    await wait(signal,280)
    if(scenario==='error')throw new Error('No pudimos cargar los reclamos. Revisá tu conexión y volvé a intentar.')
    return publicFixtures
  }
}

export function createFixtureAuth(signedIn: boolean): SupabaseClient {
  function makeSession(): Session {
    return {
      access_token:'isolated-not-a-real-token',refresh_token:'isolated-not-a-real-token',token_type:'bearer',expires_in:3600,
      expires_at:Math.floor(Date.now()/1000)+3600,
      user:{id:fixtureUserId,aud:'authenticated',email:'vecina@example.invalid',app_metadata:{},user_metadata:{display_name:'Lucía R.'},created_at:'2026-10-01T12:00:00Z'},
    }
  }
  let session:Session|null=signedIn?makeSession():null
  const subscribers=new Set<(event:string,session:Session|null)=>void>()
  const emit=(event:string)=>subscribers.forEach(callback=>callback(event,session))
  return {
    auth:{
      async getSession(){await wait();return {data:{session},error:null}},
      onAuthStateChange(callback:(event:string,session:Session|null)=>void){subscribers.add(callback);return {data:{subscription:{unsubscribe(){subscribers.delete(callback)}}}}},
      async signInWithPassword(){await wait(undefined,350);session=makeSession();emit('SIGNED_IN');return {data:{session,user:session.user},error:null}},
      async signUp(){await wait(undefined,350);return {data:{user:{id:'obfuscated-fixture-user'},session:null},error:null}},
      async signOut(){session=null;emit('SIGNED_OUT');return {error:null}},
      async exchangeCodeForSession(){return {data:{session:null},error:{code:'flow_state_not_found'}}},
    },
    from(table:string){
      const query={
        select(){return query},eq(){return query},abortSignal(){return query},
        async single(){await wait();return {data:{id:fixtureUserId,display_name:'Lucía R.',neighborhood:'Pichincha',created_at:'2026-10-01T12:00:00Z',updated_at:'2026-10-01T12:00:00Z'},error:null}},
        async returns(){await wait();return {data:table==='user_roles'?[]:null,error:null}},
      }
      return query
    },
  } as unknown as SupabaseClient
}
