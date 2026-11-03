import { useState, type FormEvent } from 'react'
import { ReceiptText, ShieldCheck, LoaderCircle } from 'lucide-react'
import { supabase, authConfigured } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { WalkthroughVideo } from '../components/WalkthroughVideo'
import { Button } from '../components/ui/button'

export function SignIn() {
  const { session, recovery, finishRecovery, signOut } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const query = new URLSearchParams(window.location.search)
  const [error, setError] = useState(query.has('error') ? 'Sign-in was cancelled or could not complete. Please try again.' : '')
  const [notice, setNotice] = useState('')
  const reset = recovery && Boolean(session)
  const redirect = window.location.origin
  function switchMode(next: typeof mode) { setMode(next); setError(''); setNotice(''); setPassword('') }
  async function google() {
    if (!supabase) return
    setBusy(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect + '/auth/callback', scopes: 'openid email profile' } })
      if (error) throw error
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (reset) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setPassword(''); finishRecovery()
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect + '/auth/reset' })
        if (error) throw error
        setNotice('If an account exists for this email, you will receive a password-reset link. Open it in this browser.')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: redirect + '/auth/callback' } })
        if (error) throw error
        setPassword('')
        if (!data.session) setNotice('Check your inbox to confirm your email, then sign in. Open the confirmation link in this browser.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        setPassword('')
      }
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="auth-page"><header className="auth-header"><a href="/" className="brand"><span className="brand-mark"><ReceiptText size={22}/></span>ledgerly<span className="brand-period">.</span></a><ThemeSwitcher/></header><main className="auth-layout"><section className="auth-intro"><span className="eyebrow">INVOICE REVIEW, EXPLAINED</span><h1>Try the complete workflow.<br/>In your own workspace.</h1><p>Upload an invoice, inspect its source evidence, and see how each check leads to a human decision.</p><ul><li>Your own sample purchase orders</li><li>AI extraction and OCR for printed scans</li><li>Private invoice history and review decisions</li></ul><div className="auth-privacy"><ShieldCheck size={20}/><p>We store your account name, email, and workspace records in Supabase. Passwords are handled by Supabase Auth. Please use synthetic invoices; no payments are made.</p></div></section><section className="panel auth-card"><h2>{reset ? 'Choose a new password' : mode === 'signup' ? 'Create your free account' : mode === 'forgot' ? 'Reset your password' : 'Welcome to Ledgerly'}</h2><p>{reset ? 'Use at least 12 characters.' : 'No demo code or invitation needed.'}</p>
    {!authConfigured && <div className="form-note">Sign-in is being configured. Please return shortly.</div>}
    {!reset && mode !== 'forgot' && <><Button variant="outline" className="google-signin" disabled={!authConfigured || busy} onClick={google}><span aria-hidden="true">G</span>Continue with Google</Button><div className="auth-divider"><span>or use email</span></div></>}
    <form onSubmit={submit} className="auth-form">{!reset && mode === 'signup' && <label>Full name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={100}/></label>}{!reset && <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254}/></label>}{(reset || mode !== 'forgot') && <label>{reset ? 'New password' : 'Password'}<input type="password" aria-label={reset ? 'New password' : 'Password'} autoComplete={reset || mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={reset || mode === 'signup' ? 12 : 1} maxLength={128}/>{(reset || mode === 'signup') && <small>At least 12 characters.</small>}</label>}{error && <p className="access-error" role="alert">{error}</p>}{notice && <p className="success-banner" role="status">{notice}</p>}<Button disabled={!authConfigured || busy}>{busy && <LoaderCircle size={16} className="spin"/>}{busy ? 'Please wait…' : reset ? 'Update password' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}</Button></form>
    {reset ? <button className="auth-link" onClick={() => { void signOut().then(finishRecovery).catch(e => setError(e.message)) }}>Cancel and sign out</button> : <div className="auth-links">{mode === 'login' ? <><button onClick={() => switchMode('signup')}>New here? Create an account</button><button onClick={() => switchMode('forgot')}>Forgot password?</button></> : <button onClick={() => switchMode('login')}>Back to sign in</button>}</div>}
    </section></main><details className="auth-tour"><summary>See how Ledgerly works — watch the quick tour</summary><WalkthroughVideo/></details><footer className="auth-legal"><a href="/privacy/">Privacy Policy</a><a href="/terms/">Terms of Use</a><span>Portfolio demo · Synthetic invoices only</span></footer></div>
}
