import { LogIn, LogOut, UserRound } from 'lucide-react'
import { useAuth } from './AuthProvider'
import type { AuthMode } from './auth-validation'

export function AuthHeader({ onOpen }: { onOpen: (mode: AuthMode) => void }) {
  const { session, profile, loading, profileLoading, busy, signOut, logoutUncertain } = useAuth()
  if (loading) return <div className="auth-header"><span role="status" className="auth-session-loading">Comprobando sesión…</span></div>
  return <div className="auth-header">
    {logoutUncertain ? <button className="auth-login" disabled={!!busy} onClick={() => { void signOut() }}>{busy ? 'Cerrando sesión…' : 'Reintentar cierre de sesión'}</button>
      : session ? <><span className="auth-user"><UserRound size={16} aria-hidden="true" /><span>{profile?.display_name ?? (profileLoading ? 'Cargando perfil…' : 'Mi cuenta')}</span></span>
        <button className="auth-login" disabled={!!busy} onClick={() => { void signOut() }}><LogOut size={15} aria-hidden="true" />Cerrar sesión</button></>
        : <><button className="auth-login" disabled={!!busy} onClick={() => onOpen('login')}><LogIn size={15} aria-hidden="true" />Ingresar</button>
          <button className="primary-button auth-create" disabled={!!busy} onClick={() => onOpen('signup')}>Crear cuenta</button></>}
  </div>
}
