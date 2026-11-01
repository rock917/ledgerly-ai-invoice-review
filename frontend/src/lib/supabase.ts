import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
let forbiddenKey = key.startsWith('sb_secret_')
try { if (key.startsWith('eyJ')) forbiddenKey ||= JSON.parse(atob(key.split('.')[1])).role === 'service_role' } catch { forbiddenKey = true }
export const authConfigured = Boolean(url && key && !forbiddenKey)
export const supabase = authConfigured ? createClient(url, key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

// Supabase owns password storage and refresh. Application APIs verify every
// access token server-side; browser session data is never authorization proof.
export async function accessToken() {
  if (!supabase) return ''
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session?.access_token || ''
}
