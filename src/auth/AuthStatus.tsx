import { Info, X } from 'lucide-react'
import { useAuth } from './AuthProvider'

export function AuthStatus() {
  const { notice, sessionError, profileError, retryProfile, retrySession, dismissNotice, logoutUncertain, busy } = useAuth()
  return <div className="auth-status-stack">
    {sessionError && <div className="auth-status auth-status-error" role="alert"><Info size={17} aria-hidden="true" /><p>{sessionError}</p>
      {!logoutUncertain && <button disabled={!!busy} onClick={retrySession}>Reintentar sesión</button>}</div>}
    {profileError && <div className="auth-status auth-status-error" role="alert"><Info size={17} aria-hidden="true" /><p>{profileError}</p><button onClick={retryProfile}>Reintentar perfil</button></div>}
    {notice && <div className={`auth-status ${notice.type === 'error' ? 'auth-status-error' : ''}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      <Info size={17} aria-hidden="true" /><p>{notice.text}</p><button aria-label="Cerrar aviso de autenticación" onClick={dismissNotice}><X size={16} /></button></div>}
  </div>
}
