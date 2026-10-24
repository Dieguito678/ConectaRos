import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { DatabaseRows } from '../types/database.generated'
import { authErrorMessage } from './auth-errors'
import { validateAuthFields, type AuthFields } from './auth-validation'
import type { AuthReturn } from './auth-return'

export type Profile = DatabaseRows['profiles']
export type UserRole = 'admin' | 'ambassador'
export interface AuthNotice { type: 'info' | 'success' | 'error'; text: string }
export interface AuthState {
  session: Session | null
  profile: Profile | null
  roles: UserRole[]
  loading: boolean
  profileLoading: boolean
  profileError: string | null
  sessionError: string | null
  notice: AuthNotice | null
  busy: 'login' | 'signup' | 'logout' | null
  logoutUncertain: boolean
}
export interface AuthResult { ok: boolean; message?: string; confirmationPending?: boolean }
const noConfiguration = 'Falta una configuración válida de Supabase. Revisá las variables locales y reiniciá la aplicación.'

// A small external store makes session races testable without a real account.
// Credentials never enter this store's snapshot or any custom storage.
export function createAuthStore(client: SupabaseClient | null, origin: string, callback: AuthReturn = { kind: 'none' }) {
  let state: AuthState = {
    session: null, profile: null, roles: [], loading: true, profileLoading: false,
    profileError: null, sessionError: null, notice: null, busy: null, logoutUncertain: false,
  }
  const listeners = new Set<() => void>()
  const getSnapshot = () => state
  let active = false, run = 0, eventVersion = 0, profileVersion = 0, actionVersion = 0
  let logoutGuard = false
  let authCanceledByLogout = false
  let profileAbort: AbortController | null = null
  let profileTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribe: (() => void) | null = null
  let bootstrapPromise: Promise<{ session: Session | null; error: string | null; notice: AuthNotice | null }> | null = null
  const publish = (patch: Partial<AuthState>) => {
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }
  function cancelProfile() {
    profileVersion++
    profileAbort?.abort()
    profileAbort = null
    if (profileTimer) clearTimeout(profileTimer)
    profileTimer = null
  }
  async function loadProfile() {
    const userId = state.session?.user.id
    if (!client || !userId || !active || logoutGuard) return
    cancelProfile()
    const version = profileVersion
    const controller = new AbortController()
    profileAbort = controller
    publish({ profile: null, roles: [], profileLoading: true, profileError: null })
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
      const [profileResult, rolesResult] = await Promise.all([
        client.from('profiles').select('id,display_name,neighborhood,created_at,updated_at').eq('id', userId).abortSignal(signal).single<Profile>(),
        client.from('user_roles').select('role').eq('user_id', userId).abortSignal(signal).returns<{ role: string }[]>(),
      ])
      if (!active || version !== profileVersion || controller.signal.aborted || state.session?.user.id !== userId) return
      if (profileResult.error || rolesResult.error || !profileResult.data || profileResult.data.id !== userId) throw new Error('profile_unavailable')
      const roles: UserRole[] = (rolesResult.data ?? []).flatMap(row => row.role === 'admin' || row.role === 'ambassador' ? [row.role] : [])
      publish({ profile: profileResult.data as Profile, roles, profileLoading: false, profileError: null })
    } catch {
      if (!active || version !== profileVersion || controller.signal.aborted || state.session?.user.id !== userId) return
      publish({ profile: null, roles: [], profileLoading: false, profileError: 'Tu sesión sigue activa, pero no pudimos cargar tu perfil y permisos. Reintentá; si persiste, revisá las migraciones y RLS.' })
    }
  }
  function acceptSession(session: Session | null) {
    if (!active) return
    const changedUser = state.session?.user.id !== session?.user.id
    if (changedUser || !session) {
      cancelProfile()
      publish({ session, profile: null, roles: [], profileError: null, profileLoading: !!session, loading: false, sessionError: null })
    } else publish({ session, loading: false, sessionError: null })
    if (session && (changedUser || (!state.profile && !state.profileError && !profileTimer && !profileAbort))) {
      // Macrotask: never call a Supabase API inside onAuthStateChange's lock.
      profileTimer = setTimeout(() => { profileTimer = null; void loadProfile() }, 0)
    }
  }
  async function bootstrap() {
    if (!client) return { session: null, error: noConfiguration, notice: null }
    let notice: AuthNotice | null = null
    if (callback.kind === 'error') notice = { type: 'error', text: authErrorMessage({ code: callback.code }, 'confirmation') }
    if (callback.kind === 'code') {
      const { code, flowId } = callback
      callback = { kind: 'none' } // Clear our reference; SDK manages the verifier.
      try {
        const { data, error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
        notice = error
          ? { type: 'error', text: authErrorMessage(error, 'confirmation') }
          : data.session ? { type: 'success', text: 'Confirmación procesada. Tu sesión está activa.' }
            : { type: 'info', text: 'Intentá ingresar para comprobar el estado de tu cuenta.' }
      } catch (error) { notice = { type: 'error', text: authErrorMessage(error, 'confirmation') } }
    }
    try {
      const { data, error } = await client.auth.getSession()
      return { session: data.session, error: error ? authErrorMessage(error) : null, notice }
    } catch (error) { return { session: null, error: authErrorMessage(error), notice } }
  }
  function start() {
    active = true
    const currentRun = ++run
    const initialVersion = eventVersion
    const initialAction = actionVersion
    if (client) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (!active || currentRun !== run) return
        // getSession() owns initial recovery. An SDK INITIAL_SESSION(null)
        // must not enable forms while a PKCE exchange is still in flight.
        if (event === 'INITIAL_SESSION') return
        eventVersion++
        if (event === 'SIGNED_OUT' && (state.busy === 'login' || state.busy === 'signup')) {
          authCanceledByLogout = true
          logoutGuard = true
          publish({ logoutUncertain: true })
        }
        if (logoutGuard && session) return
        acceptSession(session)
      })
      unsubscribe = () => data.subscription.unsubscribe()
    }
    // Reused during React StrictMode's setup/cleanup/setup: no double code exchange.
    bootstrapPromise ??= bootstrap()
    void bootstrapPromise.then(result => {
      if (!active || currentRun !== run) return
      if (eventVersion === initialVersion && !logoutGuard) {
        acceptSession(result.error ? null : result.session)
        publish({ sessionError: result.error, loading: false })
      }
      if (result.notice && !logoutGuard && actionVersion === initialAction) publish({ notice: result.notice })
    })
    return () => {
      if (currentRun !== run) return
      active = false
      run++
      unsubscribe?.()
      unsubscribe = null
      cancelProfile()
    }
  }
  async function authenticate(mode: 'login' | 'signup', fields: AuthFields): Promise<AuthResult> {
    if (!client) return { ok: false, message: noConfiguration }
    if (state.busy || state.loading || state.logoutUncertain) return { ok: false, message: 'Esperá a que termine la operación actual.' }
    if (state.session) return { ok: false, message: 'Cerrá la sesión actual antes de ingresar con otra cuenta.' }
    const errors = validateAuthFields(mode, fields)
    if (Object.keys(errors).length) return { ok: false, message: Object.values(errors)[0] }
    const operation = ++actionVersion
    authCanceledByLogout = false
    eventVersion++ // Invalidate any pending initial session response.
    publish({ busy: mode, notice: null, sessionError: null })
    try {
      const response = mode === 'signup'
        ? await client.auth.signUp({ email: fields.email.trim(), password: fields.password,
          options: { data: { display_name: fields.displayName.trim() }, emailRedirectTo: `${new URL(origin).origin}/` } })
        : await client.auth.signInWithPassword({ email: fields.email.trim(), password: fields.password })
      if (active && authCanceledByLogout) return await finishCanceledAuth()
      if (!active || operation !== actionVersion || logoutGuard) return { ok: false, message: 'La sesión cambió. Revisá su estado antes de continuar.' }
      if (response.error) return { ok: false, message: authErrorMessage(response.error) }
      if (response.data.session) {
        const latestSession = getSnapshot().session
        if (latestSession && latestSession.user.id !== response.data.session.user.id) {
          return { ok: false, message: 'La cuenta cambió durante el ingreso. Se conserva la sesión más reciente.' }
        }
        acceptSession(response.data.session)
        return { ok: true }
      }
      if (mode === 'signup') return { ok: true, confirmationPending: true,
        message: 'Revisá tu correo para confirmar tu cuenta' }
      return { ok: false, message: 'No se recibió una sesión. Revisá la confirmación de tu correo e intentá ingresar otra vez.' }
    } catch (error) {
      if (active && authCanceledByLogout) return await finishCanceledAuth()
      return { ok: false, message: authErrorMessage(error) }
    }
    finally { if (active && operation === actionVersion) publish({ busy: null }) }
  }
  async function finishCanceledAuth(): Promise<AuthResult> {
    // A cross-tab SIGNED_OUT can arrive while signIn's request is in flight.
    // Suppress its late session event and remove any SDK session it persisted.
    try {
      const { error } = await client!.auth.signOut({ scope: 'local' })
      if (error) throw error
      if (active) {
        logoutGuard = false
        acceptSession(null)
        publish({ logoutUncertain: false })
      }
    } catch {
      if (active) publish({ logoutUncertain: true, sessionError: 'El ingreso se interrumpió al cerrar la sesión. Reintentá el cierre para confirmar que no quede una sesión local activa.' })
    }
    return { ok: false, message: 'El ingreso se canceló porque la sesión se cerró durante la operación.' }
  }
  async function signOut(): Promise<void> {
    if (!client || state.busy) return
    const operation = ++actionVersion
    eventVersion++
    logoutGuard = true
    cancelProfile()
    // Remove private UI immediately, even if remote revocation later fails.
    publish({ session: null, profile: null, roles: [], profileError: null, profileLoading: false,
      busy: 'logout', notice: null, sessionError: null, logoutUncertain: true, loading: false })
    try {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (!active || operation !== actionVersion) return
      if (error) throw error
      logoutGuard = false
      publish({ busy: null, logoutUncertain: false, notice: { type: 'info', text: 'Cerraste la sesión en este navegador.' } })
    } catch {
      if (active && operation === actionVersion) publish({ busy: null, logoutUncertain: true,
        sessionError: 'No pudimos confirmar el cierre de sesión. Ocultamos tus datos privados; reintentá el cierre antes de ingresar con otra cuenta.' })
    }
  }
  function retrySession() {
    if (state.busy || logoutGuard) return
    bootstrapPromise = null
    publish({ loading: true, sessionError: null })
    // Keep the same subscription; a fresh request may not overwrite newer events.
    const version = eventVersion, currentRun = run
    bootstrapPromise = bootstrap()
    void bootstrapPromise.then(result => {
      if (!active || currentRun !== run || version !== eventVersion || logoutGuard) return
      acceptSession(result.error ? null : result.session)
      publish({ loading: false, sessionError: result.error })
    })
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot,
    start, signIn: (fields: AuthFields) => authenticate('login', fields),
    signUp: (fields: AuthFields) => authenticate('signup', fields), signOut,
    retryProfile: () => { void loadProfile() }, retrySession,
    dismissNotice: () => publish({ notice: null }),
  }
}
export type AuthStore = ReturnType<typeof createAuthStore>
