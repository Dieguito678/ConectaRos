import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createSupabaseClient } from '../lib/supabase'
import { createAuthStore, type AuthStore } from './auth-store'
import type { AuthReturn } from './auth-return'

const AuthContext = createContext<AuthStore | null>(null)
export function AuthProvider({ children, callback, store: providedStore }: { children: ReactNode; callback?: AuthReturn; store?: AuthStore }) {
  const [store] = useState(() => providedStore ?? createAuthStore(createSupabaseClient(), window.location.origin, callback))
  useEffect(() => store.start(), [store])
  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const store = useContext(AuthContext)
  if (!store) throw new Error('useAuth requiere AuthProvider')
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { ...state, signIn: store.signIn, signUp: store.signUp, signOut: store.signOut,
    retryProfile: store.retryProfile, retrySession: store.retrySession, dismissNotice: store.dismissNotice, getCurrentUserId: store.getCurrentUserId }
}
