import { MessageSquare, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import type { AuthMode } from '../auth/auth-validation'
import { useClaimsRepository, useOwnClaims } from './hooks'
import type { ClaimsRepository } from './repository'
import { ClaimCardView } from '../components/ClaimCard'
import { CardSkeletons, EmptyState } from '../components/Feedback'

export function MyClaims({onOpen,onCreate,onDetail,refresh,repository:provided}:{onOpen:(mode:AuthMode)=>void;onCreate:()=>void;onDetail:(id:string)=>void;refresh:number;repository?:ClaimsRepository}) {
  const {session,loading,logoutUncertain,sessionError}=useAuth()
  const repository=useClaimsRepository(provided)
  if(loading)return <section className="my-claims"><h1>Mis reclamos</h1><p role="status">Estamos comprobando tu sesión…</p><CardSkeletons count={3}/></section>
  if(!session)return <section className="my-claims"><div className="section-heading"><div><h1>Mis reclamos</h1><p>Consultá tus publicaciones y seguí cada avance.</p></div></div>
    <EmptyState icon={<MessageSquare size={28} aria-hidden="true"/>} title="Ingresá para acceder a tu espacio"
      description={logoutUncertain?'Reintentá el cierre de la sesión anterior.':sessionError?'No pudimos comprobar tu sesión. Usá el aviso superior para reintentar.':'Con tu cuenta podés consultar tus reclamos y seguir sus novedades. Mi barrio está disponible sin iniciar sesión.'}
      action={!logoutUncertain&&<div className="auth-access-actions"><button className="primary-button" onClick={()=>onOpen('login')}>Ingresar</button><button className="secondary-button" onClick={()=>onOpen('signup')}>Crear cuenta</button></div>}/></section>
  return <OwnClaimsList key={session.user.id} userId={session.user.id} repository={repository} refresh={refresh} onCreate={onCreate} onDetail={onDetail}/>
}
function OwnClaimsList({userId,repository,refresh,onCreate,onDetail}:{userId:string;repository:ClaimsRepository;refresh:number;onCreate:()=>void;onDetail:(id:string)=>void}) {
  const {rows,loading,error,more,loadingMore,retry,loadMore}=useOwnClaims(userId,refresh,repository)
  return <section className="my-claims"><div className="section-heading"><div><p className="eyebrow">Tu participación</p><h1>Mis reclamos</h1><p>Consultá tus publicaciones y seguí cada avance.</p></div><button className="primary-button" onClick={onCreate}><Plus size={17} aria-hidden="true"/>Crear reclamo</button></div>
    {loading?<><p className="loading-copy" role="status">Cargando tus reclamos…</p><CardSkeletons count={3}/></>:<>
      {error&&<div className="auth-message auth-message-error" role="alert"><p>{error}</p><button className="auth-login" onClick={rows.length?()=>{void loadMore()}:retry}>Reintentar mis reclamos</button></div>}
      {!rows.length&&!error?<EmptyState icon={<MessageSquare size={28} aria-hidden="true"/>} title="Todavía no creaste ningún reclamo." description="Contanos qué pasa en tu barrio." action={<button className="primary-button" onClick={onCreate}>Crear mi primer reclamo</button>}/>:<div className="claims-grid">{rows.map(claim=><ClaimCardView key={claim.id} title={claim.title} description={claim.description}
        category={claim.category.slug} categoryName={claim.category.name} address={claim.address} neighborhood={claim.neighborhood} date={claim.created_at}
        status={claim.status} moderationStatus={claim.moderation_status} isExample={claim.is_demo} headingLevel={2} onClick={()=>onDetail(claim.id)} accessibleLabel={`Ver mi reclamo: ${claim.title}`}/>)}</div>}
      {more&&<button className="primary-button load-more" disabled={loadingMore} onClick={()=>{void loadMore()}}>{loadingMore?'Cargando más…':'Cargar más'}</button>}
    </>}
  </section>
}
