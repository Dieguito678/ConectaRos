import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Building2, Check, ChevronDown, Compass, Gift, Hexagon, Info, ListFilter, MapPin, MessageSquare, Search, Sprout, X } from 'lucide-react'
import { useClaims } from './hooks/useClaims'
import { categories, type Category, type Claim } from './types/claim'
import { CategoryIcon } from './components/CategoryIcon'
import { ClaimCard, StatusBadge } from './components/ClaimCard'

const sections = ['Mi barrio', 'Mis reclamos', 'Beneficios'] as const
type Section = typeof sections[number]
const navIcons = [Compass, MessageSquare, Gift]

export default function App() {
  const { claims, loading, error, retry } = useClaims()
  const [section, setSection] = useState<Section>('Mi barrio')
  const [category, setCategory] = useState<Category | 'Todas'>('Todas')
  const [neighborhood, setNeighborhood] = useState('Todos los barrios')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Todos los estados')
  const [selected, setSelected] = useState<Claim | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const results = claims.filter(claim => (category === 'Todas' || claim.category === category) && (neighborhood === 'Todos los barrios' || claim.neighborhood === neighborhood) && (status === 'Todos los estados' || claim.status === status) && `${claim.title} ${claim.address} ${claim.neighborhood}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')))
  const filtered = category !== 'Todas' || neighborhood !== 'Todos los barrios' || status !== 'Todos los estados' || query !== ''

  useEffect(() => { document.title = `ConectaRos · ${section}` }, [section])
  function openClaim(claim: Claim) { setSelected(claim); dialog.current?.showModal() }
  function resetFilters() { setCategory('Todas'); setNeighborhood('Todos los barrios'); setStatus('Todos los estados'); setQuery('') }

  return <>
    <a className="skip-link" href="#main">Saltar al contenido</a>
    <div className="demo-bar"><span className="demo-dot" /> Estás explorando una demo <span className="hidden sm:inline">— puede contener ejemplos ficticios.</span><span className="demo-pill">EN DESARROLLO</span></div>
    <header className="site-header">
      <div className="shell header-inner">
        <a className="brand" href="#" onClick={event => { event.preventDefault(); setSection('Mi barrio') }} aria-label="ConectaRos, inicio"><span className="brand-icon"><Hexagon size={27} strokeWidth={1.8} /><span /></span>Conecta<span className="brand-light">Ros</span></a>
        <nav aria-label="Navegación principal">{sections.map((item, index) => { const Icon = navIcons[index]; return <button key={item} onClick={() => setSection(item)} className={`nav-item ${section === item ? 'active' : ''}`} aria-current={section === item ? 'page' : undefined}><Icon size={17} />{item}</button> })}</nav>
        <span className="city-label"><MapPin size={15} /> Rosario, Santa Fe</span>
      </div>
    </header>

    <main id="main" className="shell main-content">
      {section === 'Mi barrio' ? <>
        <div className="breadcrumb"><span>Rosario</span><span>/</span> Mi barrio</div>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy"><p className="eyebrow"><span /> LA CIUDAD QUE HACEMOS JUNTOS</p><h1 id="hero-title">Un mejor barrio<br />empieza con <em>vos.</em></h1><p className="hero-description">Lo que pasa en tu cuadra, nos importa a todos.<br className="hidden sm:block" /> Conectemos las ganas de mejorar Rosario.</p><a className="primary-button" href="#reclamos">Explorar reclamos <ArrowRight size={17} /></a><span className="hero-note"><Sprout size={15} /> Pequeñas acciones. Una ciudad mejor.</span></div>
          <div className="neighborhood-art" aria-hidden="true">
            <div className="map-grid" /><div className="river" /><div className="park park-one" /><div className="park park-two" />
            <span className="map-label label-one">PICHINCHA</span><span className="map-label label-two">CENTRO</span><span className="river-label">Río Paraná</span>
            <span className="map-marker marker-one"><CategoryIcon category="alumbrado" size={21} /></span><span className="map-marker marker-two"><CategoryIcon category="arbolado" size={21} /></span><span className="map-marker marker-three"><Check size={21} /></span>
            <div className="map-caption"><span className="map-caption-icon"><Building2 size={21} /></span><div><strong>Cada cuadra cuenta.</strong><span>Imaginemos una Rosario mejor.</span></div><ArrowUpRight size={17} /></div>
            <span className="map-disclaimer">Ilustración del barrio · no es un mapa real</span>
          </div>
        </section>

        <section className="overview" aria-label="Resumen de reclamos públicos"><div className="overview-heading"><span className="overview-icon"><Compass size={21} /></span><div><strong>El barrio, de un vistazo</strong><span>Reclamos públicos</span></div></div><div className="stat"><strong>{loading || error ? '—' : claims.length.toString().padStart(2, '0')}</strong><span>reclamos visibles</span></div><div className="stat"><strong className="amber-text">{loading || error ? '—' : claims.filter(c => c.status === 'En proceso').length.toString().padStart(2, '0')}</strong><span>en proceso</span></div><div className="stat"><strong className="green-text">{loading || error ? '—' : claims.filter(c => c.status === 'Resuelto').length.toString().padStart(2, '0')}</strong><span>resueltos</span></div><span className="sample-label">{loading ? 'Consultando Supabase…' : error ? 'Sin conexión verificada' : 'Fuente: Supabase'}</span></section>

        <section id="reclamos" className="claims-section" aria-labelledby="claims-title">
          <div className="section-heading"><div><p className="eyebrow section-eyebrow">CERCA TUYO</p><h2 id="claims-title">¿Qué pasa en los barrios?</h2><p>Explorá los reclamos y descubrí cómo se vería una ciudad conectada.</p></div><label className="select-wrap neighborhood-select"><MapPin size={16} /><span className="sr-only">Filtrar por barrio</span><select value={neighborhood} onChange={e => setNeighborhood(e.target.value)}><option>Todos los barrios</option>{[...new Set(claims.map(c => c.neighborhood))].sort().map(n => <option key={n}>{n}</option>)}</select><ChevronDown size={14} /></label></div>
          <div className="category-filters" aria-label="Filtrar por categoría"><button className={category === 'Todas' ? 'selected' : ''} aria-pressed={category === 'Todas'} onClick={() => setCategory('Todas')}><ListFilter size={16} />Todas</button>{categories.map(c => <button key={c} className={category === c ? 'selected' : ''} aria-pressed={category === c} onClick={() => setCategory(c)}><CategoryIcon category={c} size={16} /><span className="capitalize">{c}</span></button>)}</div>
          <div className="results-toolbar"><p aria-live="polite"><strong>{loading || error ? '—' : results.length}</strong> {results.length === 1 ? 'reclamo' : 'reclamos'} visibles{filtered && <button className="clear-button" onClick={resetFilters}>Limpiar filtros <X size={12} /></button>}</p><div className="search-tools"><label className="search-wrap"><Search size={16} /><span className="sr-only">Buscar por título, dirección o barrio</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en el barrio…" /></label><label className="select-wrap"><span className="sr-only">Filtrar por estado</span><select value={status} onChange={e => setStatus(e.target.value)}><option>Todos los estados</option><option>Pendiente</option><option>En proceso</option><option>Resuelto</option></select><ChevronDown size={14} /></label></div></div>
          <div aria-live="polite" aria-busy={loading}>{loading && <div className="empty-state" role="status"><h3>Cargando reclamos desde Supabase…</h3><p>Consultando la base de datos.</p></div>}{error && <div className="empty-state" role="alert"><Info size={29} /><h3>No pudimos cargar los reclamos</h3><p>{error}</p><button className="primary-button" onClick={retry}>Reintentar</button></div>}</div><div className="claims-grid">{results.map(claim => <ClaimCard key={claim.id} claim={claim} onOpen={openClaim} />)}</div>
          {!loading && !error && results.length === 0 && <div className="empty-state"><Search size={29} /><h3>{claims.length === 0 ? 'Todavía no hay reclamos visibles' : 'No hay coincidencias'}</h3><p>{claims.length === 0 ? 'La base no devolvió reclamos públicos. Si esperabas ejemplos, ejecutá el seed y comprobá RLS.' : 'Probá con otra búsqueda o explorá todos los ejemplos.'}</p><button className="primary-button" onClick={resetFilters}>Limpiar filtros</button></div>}
        </section>
        <aside className="community-note"><span className="community-icon"><Sprout size={27} /></span><div><h3>Tu mirada puede transformar tu cuadra.</h3><p>Este es el primer paso de ConectaRos. Por ahora, podés explorar cómo se verían los reclamos de tu ciudad.</p></div><span className="outline-pill">Estamos empezando <ArrowUpRight size={14} /></span></aside>
      </> : <section className="future-section"><p className="eyebrow">CONECTAROS · DEMO</p><div className="future-icon">{section === 'Mis reclamos' ? <MessageSquare size={32} /> : <Gift size={32} />}</div><h1>{section}</h1><h2>{section === 'Mis reclamos' ? 'Tu espacio para hacer seguimiento' : 'Más conexiones con tu barrio'}</h2><p>{section === 'Mis reclamos' ? 'En una próxima etapa vas a poder iniciar sesión, crear reclamos y seguir su estado. Esta demo no tiene cuentas ni reclamos personales.' : 'Estamos dando forma a esta sección. Los beneficios, puntos y canjes todavía no están habilitados en esta pantalla.'}</p><span className="outline-pill">Próximamente</span><button className="primary-button" onClick={() => setSection('Mi barrio')}>Explorar la demo <ArrowRight size={17} /></button></section>}
      <div className="demo-notice"><Info size={17} /><p><strong>Una idea en construcción.</strong> Esta demo no envía reclamos ni está conectada a la Municipalidad o a prestadores de servicios. No es un canal de atención ni de emergencias.</p></div>
    </main>
    <footer className="shell site-footer"><span className="footer-brand">ConectaRos <span>Hecho para conectar nuestra ciudad.</span></span><span>Rosario, Argentina <span className="dot">·</span> Demo inicial</span></footer>

    <dialog ref={dialog} className="claim-dialog" aria-labelledby="detail-title" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close() }}>
      {selected && <><div className="flex items-center justify-between"><span className="outline-pill">{selected.isDemo ? 'Reclamo ficticio' : 'Reclamo'} · {selected.id}</span><button className="close-button" aria-label="Cerrar detalle" onClick={() => dialog.current?.close()} autoFocus><X size={22} /></button></div><div className={`category-icon detail-icon ${selected.category}`}><CategoryIcon category={selected.category} size={27} /></div><p className="category-label">{selected.category}</p><h2 id="detail-title">{selected.title}</h2><p className="detail-address"><MapPin size={17} />{selected.address} · {selected.neighborhood}, Rosario</p><StatusBadge status={selected.status} workflowStatus={selected.workflowStatus} /><p className="detail-description">{selected.description}</p><div className="detail-disclaimer"><Info size={18} /><p>{selected.isDemo ? 'Datos ficticios del seed. El estado es ilustrativo y no indica una intervención real.' : 'Reclamo consultado desde Supabase. ConectaRos no confirma por sí mismo intervenciones de organismos.'}</p></div></>}
    </dialog>
  </>
}
