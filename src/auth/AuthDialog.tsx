import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff, LockKeyhole, X } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { validateAuthFields, type AuthFields, type AuthMode, type FieldErrors } from './auth-validation'
import { openModal } from '../lib/modal'

function PasswordField({ id, label, name, error, signup }: { id: string; label: string; name: string; error?: string; signup: boolean }) {
  const [visible, setVisible] = useState(false)
  return <div className="auth-field"><label htmlFor={id}>{label}</label>
    <div className="password-input"><input id={id} name={name} type={visible ? 'text' : 'password'} required
      autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined}
      aria-invalid={!!error} aria-describedby={error ? `${id}-error` : signup ? 'auth-password-hint' : undefined} />
      <button type="button" onClick={() => setVisible(value => !value)} aria-pressed={visible}
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLocaleLowerCase('es')}`}>
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button></div>
    {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
  </div>
}

export function AuthDialog({ mode, onClose, onSwitch, onDismiss = onClose }: { mode: AuthMode; onClose: () => void; onSwitch: (mode: AuthMode) => void; onDismiss?: () => void }) {
  const { signIn, signUp, busy, loading, session, logoutUncertain } = useAuth()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const mounted = useRef(false)
  const signup = mode === 'signup'
  const processing = busy !== null
  useEffect(() => {
    mounted.current = true
    const restoreFocus = openModal(dialog.current)
    return () => { mounted.current = false; restoreFocus() }
  }, [])
  useEffect(() => { if (session && !busy) onClose() }, [session, busy, onClose])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (processing || loading || logoutUncertain) return
    const form = event.currentTarget
    const data = new FormData(form)
    const fields: AuthFields = { displayName: String(data.get('displayName') ?? ''), email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''), repeatPassword: String(data.get('repeatPassword') ?? '') }
    const validation = validateAuthFields(mode, fields)
    setErrors(validation); setMessage(null)
    const firstError = Object.keys(validation)[0]
    if (firstError) { (form.elements.namedItem(firstError) as HTMLInputElement | null)?.focus(); return }
    const result = await (signup ? signUp(fields) : signIn(fields))
    // Wipe password inputs after each request; never create a persisted draft.
    for (const name of ['password', 'repeatPassword']) {
      const input = form.elements.namedItem(name) as HTMLInputElement | null
      if (input) input.value = ''
    }
    fields.password = ''; fields.repeatPassword = ''
    if (!mounted.current) return
    if (result.ok && !result.confirmationPending) onClose()
    else setMessage({ error: !result.ok, text: result.message ?? 'No se pudo completar la operación.' })
  }
  return <dialog ref={dialog} className="claim-dialog auth-dialog" aria-labelledby="auth-title" aria-describedby="auth-description"
    onCancel={event => { if (processing) event.preventDefault(); else onDismiss() }}
    onClick={event => { if (!processing && event.target === event.currentTarget) onDismiss() }}>
    <div className="auth-dialog-heading"><span className="auth-dialog-kicker"><LockKeyhole size={16} aria-hidden="true" /> Tu cuenta en ConectaRos</span>
      <button type="button" className="close-button" aria-label="Cerrar formulario de acceso" disabled={processing} onClick={onDismiss}><X size={22} /></button></div>
    <h2 id="auth-title">{signup ? 'Creá tu cuenta' : 'Volvé a conectar'}</h2>
    <p id="auth-description">{signup ? 'Un primer paso para participar en tu barrio.' : 'Ingresá con tu correo y contraseña.'}</p>
    <form noValidate onSubmit={submit} aria-busy={processing}><fieldset disabled={processing || loading || logoutUncertain}>
      {signup && <div className="auth-field"><label htmlFor="auth-name">Nombre visible</label>
        <input id="auth-name" name="displayName" type="text" required autoComplete="nickname" aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'auth-name-error' : 'auth-name-hint'} />
        {errors.displayName ? <p className="field-error" id="auth-name-error">{errors.displayName}</p> : <p className="field-hint" id="auth-name-hint">Así te vamos a identificar. No hace falta tu nombre completo.</p>}</div>}
      <div className="auth-field"><label htmlFor="auth-email">Correo electrónico</label>
        <input id="auth-email" name="email" type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false}
          aria-invalid={!!errors.email} aria-describedby={errors.email ? 'auth-email-error' : undefined} />
        {errors.email && <p className="field-error" id="auth-email-error">{errors.email}</p>}</div>
      <PasswordField id="auth-password" name="password" label="Contraseña" error={errors.password} signup={signup} />
      {signup && <><p className="field-hint password-hint" id="auth-password-hint">Mínimo 8 caracteres. Evitá nombres y datos personales.</p>
        <PasswordField id="auth-repeat" name="repeatPassword" label="Repetir contraseña" error={errors.repeatPassword} signup /></>}
      <button type="submit" className="primary-button auth-submit">{processing ? 'Procesando…' : signup ? 'Crear cuenta' : 'Ingresar'}</button>
    </fieldset>{message && <div className={`auth-message ${message.error ? 'auth-message-error' : ''}`} role={message.error ? 'alert' : 'status'}><p>{message.text}</p>
      {!message.error && signup && <p>Para cuidar tu privacidad, este mensaje no confirma si el correo ya tiene una cuenta. Si corresponde, recibirás un enlace de confirmación. Si ya tenés cuenta, podés ingresar.</p>}</div>}</form>
    <p className="auth-switch">{signup ? '¿Ya tenés una cuenta?' : '¿Todavía no tenés cuenta?'} <button type="button" disabled={processing}
      onClick={() => onSwitch(signup ? 'login' : 'signup')}>{signup ? 'Ingresar' : 'Crear cuenta'}</button></p>
    <p className="auth-public-note">Podés explorar Mi barrio sin iniciar sesión.</p>
  </dialog>
}
