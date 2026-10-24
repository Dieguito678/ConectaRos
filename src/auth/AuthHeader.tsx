import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, LogIn, LogOut } from 'lucide-react'
import { useAuth } from './AuthProvider'
import type { AuthMode } from './auth-validation'

export function AuthHeader({ onOpen }: { onOpen: (mode: AuthMode) => void }) {
  const { session, profile, loading, profileLoading, busy, signOut, logoutUncertain } = useAuth()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const logout = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const userId = session?.user.id
  const name = profile?.display_name ?? (profileLoading ? 'Cargando tu cuenta…' : 'Mi cuenta')
  const initials = (profile?.display_name?.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('') || 'CR').toLocaleUpperCase('es-AR')

  useEffect(() => { setOpen(false) }, [userId, logoutUncertain])
  useEffect(() => {
    if (!open) return
    logout.current?.focus()
    function outside(event: PointerEvent) {
      if (event.target && !container.current?.contains(event.target as Node)) setOpen(false)
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  function menuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
      }
      // Forward Tab keeps native focus order; the container closes on blur.
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      logout.current?.focus()
    }
  }
  if (loading) return <div className="auth-header"><span role="status" className="auth-session-loading">Comprobando sesión…</span></div>
  return <div className="auth-header">
    {logoutUncertain ? <button className="auth-login" disabled={!!busy} onClick={() => { void signOut() }}>{busy ? 'Cerrando sesión…' : 'Reintentar cierre de sesión'}</button>
      : session ? <div className="account-menu" ref={container}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
        <button ref={trigger} type="button" className={`account-trigger${open ? ' is-open' : ''}`}
          aria-label={`Cuenta de ${name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
          disabled={!!busy} onClick={() => setOpen(value => !value)}
          onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}>
          <span className="account-avatar" aria-hidden="true">{initials}</span>
          <span className="account-name">{name}</span><ChevronDown size={16} aria-hidden="true" />
        </button>
        {open && <div id={menuId} className="account-dropdown" role="menu" aria-label="Acciones de tu cuenta" onKeyDown={menuKey}>
          <p className="account-dropdown-caption" role="presentation">Tu cuenta en ConectaRos</p>
          <button ref={logout} type="button" className="account-menu-item" role="menuitem" disabled={!!busy}
            onClick={() => { void signOut() }}><LogOut size={17} aria-hidden="true" />Cerrar sesión</button>
        </div>}
      </div>
        : <><button className="auth-login" disabled={!!busy} onClick={() => onOpen('login')}><LogIn size={15} aria-hidden="true" />Ingresar</button>
          <button className="primary-button auth-create" disabled={!!busy} onClick={() => onOpen('signup')}>Crear cuenta</button></>}
  </div>
}
