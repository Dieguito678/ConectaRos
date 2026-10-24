import { ArrowRight, MessageSquare } from 'lucide-react'
import { useAuth } from './AuthProvider'
import type { AuthMode } from './auth-validation'

export function MyClaimsAccess({ onOpen, onExplore }: { onOpen: (mode: AuthMode) => void; onExplore: () => void }) {
  const { session, loading, logoutUncertain, sessionError } = useAuth()
  return <section className="future-section"><p className="eyebrow">CONECTAROS · TU BARRIO</p>
    <div className="future-icon"><MessageSquare size={32} aria-hidden="true" /></div><h1>Mis reclamos</h1>
    {loading ? <p role="status">Estamos comprobando tu sesión…</p> : session ? <><h2>Tu sesión está activa</h2><p>El módulo de reclamos personales está pendiente. Todavía no podés publicar ni gestionar reclamos desde esta sección.</p><span className="outline-pill">Próximamente</span></>
      : <><h2>Ingresá para acceder a tu espacio</h2><p>{logoutUncertain ? 'Reintentá el cierre de la sesión anterior antes de ingresar.' : sessionError ? 'No pudimos comprobar tu sesión. Podés reintentar desde el aviso superior.' : 'Usá tu cuenta de ConectaRos o creá una. El módulo de reclamos personales todavía está en construcción.'}</p>
        {!logoutUncertain && <div className="auth-access-actions"><button className="primary-button" onClick={() => onOpen('login')}>Ingresar <ArrowRight size={17} /></button><button className="auth-login" onClick={() => onOpen('signup')}>Crear cuenta</button></div>}</>}
    <button className="auth-explore" onClick={onExplore}>Explorar Mi barrio sin publicar</button>
  </section>
}
