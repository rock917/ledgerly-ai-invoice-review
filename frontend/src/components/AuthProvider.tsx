import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthState = { session: Session | null; loading: boolean; recovery: boolean; finishRecovery: () => void; signOut: () => Promise<void> }
const AuthContext = createContext<AuthState>({ session: null, loading: true, recovery: false, finishRecovery: () => {}, signOut: async () => {} })
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [recovery, setRecovery] = useState(window.location.pathname === '/auth/reset')
  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return
      if (next && window.location.pathname === '/auth/callback') history.replaceState(null, '', '/')
      setSession(next); setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') { setRecovery(false); sessionStorage.removeItem('ledgerly_access') }
    })
    void supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setLoading(false) } })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [])
  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
    setSession(null)
  }
  return <AuthContext.Provider value={{ session, loading, recovery, finishRecovery: () => { setRecovery(false); history.replaceState(null, '', '/') }, signOut }}>{children}</AuthContext.Provider>
}
