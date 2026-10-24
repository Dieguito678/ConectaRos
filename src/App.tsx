import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, Gift, MapPin, Search, SlidersHorizontal, X } from 'lucide-react'
import { useClaims } from './hooks/useClaims'
import type { fetchClaims } from './lib/claims'
import { categories, type Category, type Claim } from './types/claim'
import { CategoryIcon } from './components/CategoryIcon'
import { ClaimCard } from './components/ClaimCard'
import { ClaimStatusBadge } from './components/ClaimStatusBadge'
import { CardSkeletons, EmptyState } from './components/Feedback'
import { CommunityHero } from './components/CommunityHero'
import { SiteHeader, type Section } from './components/SiteHeader'
import { SiteFooter } from './components/SiteFooter'
import { AuthStatus } from './auth/AuthStatus'
import { useAuth } from './auth/AuthProvider'
import { useClaimsRepository } from './claims/hooks'
import { categoryNames } from './claims/model'
import type { ClaimsRepository } from './claims/repository'
import type { AuthMode } from './auth/auth-validation'
import './claims/claims.css'

const MyClaims=lazy(()=>import('./claims/MyClaims').then(module=>({default:module.MyClaims})))
const CreateClaimDialog=lazy(()=>import('./claims/CreateClaimDialog').then(module=>({default:module.CreateClaimDialog})))
const OwnClaimDetail=lazy(()=>import('./claims/OwnClaimDetail').then(module=>({default:module.OwnClaimDetail})))
const AuthDialog=lazy(()=>import('./auth/AuthDialog').then(module=>({default:module.AuthDialog})))
const PublicClaimDetail=lazy(()=>import('./components/PublicClaimDetail').then(module=>({default:module.PublicClaimDetail})))

export default function App({claimsRepository,loadPublicClaims}:{claimsRepository?:ClaimsRepository;loadPublicClaims?:typeof fetchClaims}={}) {
  const {claims,loading,error,retry}=useClaims(loadPublicClaims)
  const {session,loading:authLoading,busy:authBusy,logoutUncertain}=useAuth()
  const repository=useClaimsRepository(claimsRepository)
  const userId=session?.user.id??null
  const [createIntent,setCreateIntent]=useState(false)
  const [creatorFor,setCreatorFor]=useState<string|null>(null)
  const [ownDetail,setOwnDetail]=useState<{owner:string;id:string}|null>(null)
  const [ownRefresh,setOwnRefresh]=useState(0)
  const [authMode,setAuthMode]=useState<AuthMode|null>(null)
  const [section,setSection]=useState<Section>('Mi barrio')
  const [category,setCategory]=useState<Category|'Todas'>('Todas')
  const [neighborhood,setNeighborhood]=useState('Todos los barrios')
  const [query,setQuery]=useState('')
  const [status,setStatus]=useState('Todos los estados')
  const [selected,setSelected]=useState<Claim|null>(null)
  const main=useRef<HTMLElement>(null)
  const results=claims.filter(claim=>(category==='Todas'||claim.category===category)&&(neighborhood==='Todos los barrios'||claim.neighborhood===neighborhood)&&(status==='Todos los estados'||claim.status===status)&&`${claim.title} ${claim.address} ${claim.neighborhood}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')))
  const filtered=category!=='Todas'||neighborhood!=='Todos los barrios'||status!=='Todos los estados'||query!==''
  const createDisabled=authLoading||!!authBusy||logoutUncertain

  useEffect(()=>{document.title=`ConectaRos · ${section}`},[section])
  useEffect(()=>{setCreatorFor(null);setOwnDetail(null)},[userId])
  useEffect(()=>{if(createIntent&&userId&&!authMode){setCreateIntent(false);setCreatorFor(userId)}},[createIntent,userId,authMode])
  function openAuth(mode:AuthMode){setCreateIntent(false);setAuthMode(mode)}
  function createClaim(){
    if(createDisabled)return
    if(userId){setCreatorFor(userId);setCreateIntent(false)}
    else{setCreateIntent(true);setAuthMode('login')}
  }
  function navigate(next:Section){setSection(next);main.current?.scrollIntoView?.({block:'start'})}
  function resetFilters(){setCategory('Todas');setNeighborhood('Todos los barrios');setStatus('Todos los estados');setQuery('')}

  return <div className="app-layout">
    <a className="skip-link" href="#main">Saltar al contenido</a>
    <SiteHeader section={section} onSection={navigate} onCreate={createClaim} onAuth={openAuth} createDisabled={createDisabled}/>
    <main id="main" className="shell main-content" ref={main}>
      <AuthStatus/>
      {section==='Mi barrio'?<>
        <CommunityHero onCreate={createClaim} disabled={createDisabled}/>
        <section id="reclamos" className="claims-section" aria-labelledby="claims-title">
          <div className="section-heading"><div><p className="eyebrow">Lo que pasa cerca tuyo</p><h2 id="claims-title">Reclamos de la comunidad</h2><p>Conocé los temas de tu barrio y cómo avanza cada reclamo.</p></div></div>
          <div className="filter-panel">
            <div className="search-tools">
              <label className="search-wrap"><Search size={20} aria-hidden="true"/><span className="sr-only">Buscar por título, dirección o barrio</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscá un reclamo, una calle o un barrio"/></label>
              <label className="select-wrap"><MapPin size={18} aria-hidden="true"/><span className="sr-only">Filtrar por barrio</span><select value={neighborhood} onChange={event=>setNeighborhood(event.target.value)}><option>Todos los barrios</option>{[...new Set(claims.map(claim=>claim.neighborhood))].sort().map(name=><option key={name}>{name}</option>)}</select><ChevronDown size={15} aria-hidden="true"/></label>
              <label className="select-wrap"><SlidersHorizontal size={18} aria-hidden="true"/><span className="sr-only">Filtrar por estado</span><select value={status} onChange={event=>setStatus(event.target.value)}><option>Todos los estados</option><option>Pendiente</option><option>En proceso</option><option>Resuelto</option></select><ChevronDown size={15} aria-hidden="true"/></label>
            </div>
            <div className="category-filters" aria-label="Filtrar por categoría"><button type="button" className={category==='Todas'?'selected':''} aria-pressed={category==='Todas'} onClick={()=>setCategory('Todas')}><SlidersHorizontal size={17} aria-hidden="true"/>Todas</button>{categories.map(item=><button type="button" key={item} className={category===item?'selected':''} aria-pressed={category===item} onClick={()=>setCategory(item)}><CategoryIcon category={item} size={17}/><span>{item==='alumbrado'?'Alumbrado':item==='residuos'?'Residuos':item==='otros'?'Otros':categoryNames[item]}</span></button>)}</div>
          </div>
          <div className="results-toolbar"><div className="results-count" aria-live="polite">{loading?'Buscando reclamos…':error?'No pudimos cargar el listado':<><strong>{results.length}</strong> {results.length===1?'reclamo en este listado':'reclamos en este listado'}</>}{filtered&&<button type="button" className="clear-button" onClick={resetFilters}>Limpiar filtros <X size={14} aria-hidden="true"/></button>}</div>
            <div className="status-legend" aria-label="Estados de gestión"><span className="legend-label">Estados:</span><ClaimStatusBadge status="publicado"/><ClaimStatusBadge status="en_tratamiento"/><ClaimStatusBadge status="resuelto"/></div>
          </div>
          {loading?<><p className="sr-only" role="status">Cargando reclamos de la comunidad</p><CardSkeletons/></>:error?<EmptyState icon={<Search size={28}/>} title="No pudimos cargar los reclamos" description="En este momento no podemos mostrar el listado. Revisá tu conexión y volvé a intentar." action={<button className="primary-button" onClick={retry}>Reintentar</button>} headingLevel={3}/>:results.length?<div className="claims-grid">{results.map(claim=><ClaimCard key={claim.id} claim={claim} onOpen={setSelected}/>)}</div>:<EmptyState icon={<Search size={28}/>} title={filtered?'No encontramos coincidencias':'Todavía no hay reclamos para mostrar'} description={filtered?'Probá con otra búsqueda o explorá todos los barrios.':'Los reclamos que comparta la comunidad aparecerán acá.'} action={filtered?<button className="secondary-button" onClick={resetFilters}>Limpiar filtros</button>:<button className="primary-button" disabled={createDisabled} onClick={createClaim}>Crear reclamo</button>} headingLevel={3}/>}
        </section>
      </>:section==='Mis reclamos'?<Suspense fallback={<CardSkeletons count={3}/>}><MyClaims onOpen={openAuth} onCreate={createClaim} onDetail={id=>{if(userId)setOwnDetail({owner:userId,id})}} refresh={ownRefresh} repository={repository}/></Suspense>:<section className="benefits-section"><div className="section-heading"><div><p className="eyebrow">Más cerca de tu comunidad</p><h1>Beneficios</h1><p>Un espacio para descubrir oportunidades en tu barrio.</p></div></div><EmptyState icon={<Gift size={30} aria-hidden="true"/>} title="Los beneficios disponibles aparecerán acá" description="Cuando haya nuevas propuestas para la comunidad, vas a poder conocerlas en este espacio." action={<button className="secondary-button" onClick={()=>navigate('Mi barrio')}>Explorar Mi barrio <ArrowRight size={17}/></button>}/></section>}
    </main>
    <SiteFooter onSection={navigate}/>
    <Suspense fallback={<p className="floating-loading" role="status">Abriendo acceso…</p>}>{authMode&&<AuthDialog key={authMode} mode={authMode} onClose={()=>setAuthMode(null)} onDismiss={()=>{setAuthMode(null);setCreateIntent(false)}} onSwitch={setAuthMode}/>}</Suspense>
    <Suspense fallback={<p className="floating-loading" role="status">Abriendo formulario…</p>}>{userId&&creatorFor===userId&&<CreateClaimDialog key={userId} userId={userId} repository={repository} onClose={()=>setCreatorFor(null)} onSaved={()=>{setOwnRefresh(value=>value+1);retry()}} onView={id=>{setCreatorFor(null);navigate('Mis reclamos');setOwnDetail({owner:userId,id})}}/>}</Suspense>
    <Suspense fallback={<p className="floating-loading" role="status">Abriendo detalle…</p>}>{userId&&ownDetail?.owner===userId&&<OwnClaimDetail key={`${userId}:${ownDetail.id}`} id={ownDetail.id} userId={userId} repository={repository} onClose={()=>setOwnDetail(null)}/>}</Suspense>
    <Suspense fallback={<p className="floating-loading" role="status">Abriendo detalle…</p>}>{selected&&<PublicClaimDetail key={selected.id} claim={selected} onClose={()=>setSelected(null)}/>}</Suspense>
  </div>
}
