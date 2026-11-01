import { useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { ArrowUpRight, CircleHelp, FilePlus2, FolderClock, LayoutDashboard, ListChecks, LogOut, PanelsTopLeft, ReceiptText, ShieldCheck } from 'lucide-react'
import { API_URL, useResource } from './lib/api'
import { useAuth } from './components/AuthProvider'
import { SignIn } from './pages/SignIn'
import { Button } from './components/ui/button'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { Dashboard } from './pages/Dashboard'
import { NewInvoice } from './pages/NewInvoice'
import { History } from './pages/History'
import { Execution } from './pages/Execution'
import { PurchaseOrders } from './pages/PurchaseOrders'

export default function App() {
  const { session, loading, recovery } = useAuth()
  if (loading) return <div className="auth-loading" role="status">Opening your session…</div>
  if (!session || recovery) return <SignIn/>
  return <Workspace key={session.user.id}/>
}

function Workspace() {
  const { signOut } = useAuth()
  const { data: profile, error: profileError, refresh } = useResource<{id: string; display_name: string; email: string; daily_upload_limit: number}>('/api/me')
  const connected = Boolean(profile)
  const [health, setHealth] = useState<'checking' | 'ready' | 'setup' | 'offline'>('checking')
  const [error, setError] = useState('')
  async function logout() { try { await signOut() } catch (e) { setError((e as Error).message) } }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_URL}/health`, { signal: controller.signal }).then(r => r.json()).then(d => setHealth(d.configured ? 'ready' : 'setup')).catch(() => { if (!controller.signal.aborted) setHealth('offline') })
    return () => controller.abort()
  }, [])
  if (!profile) return <div className="auth-loading"><h2>{profileError ? 'We could not open your workspace' : 'Preparing your private workspace…'}</h2><p>{profileError || 'Creating your sample purchase orders.'}</p>{profileError && <Button onClick={refresh}>Try again</Button>}<Button variant="ghost" onClick={logout}>Sign out</Button>{error && <p role="alert">{error}</p>}</div>
  return <BrowserRouter><div className="app-shell">
    <aside className="sidebar"><Link to="/" className="brand"><span className="brand-mark"><ReceiptText size={22}/></span>ledgerly<span className="brand-period">.</span></Link><div className="workspace"><span className="workspace-logo">AP</span><div><strong>Invoice operations</strong><small>Case study workspace</small></div><span className="workspace-chevron">⌄</span></div><div className="nav-label">WORKSPACE</div><nav>
      <NavLink to="/" end><LayoutDashboard size={18}/>Overview</NavLink><NavLink to="/new"><FilePlus2 size={18}/>New invoice</NavLink><NavLink to="/history"><FolderClock size={18}/>Run history</NavLink><NavLink to="/reviews"><ListChecks size={18}/>Pending reviews</NavLink><NavLink to="/purchase-orders"><PanelsTopLeft size={18}/>Purchase orders</NavLink>
    </nav><div className="sidebar-bottom"><div className="policy-note"><ShieldCheck size={18}/><strong>Every decision, traceable.</strong><p>AI extracts. Rules validate.<br/>People approve.</p></div><a className="help-link" href={`${API_URL}/docs`} target="_blank" rel="noreferrer"><CircleHelp size={17}/>API documentation<ArrowUpRight size={14}/></a><div className="profile"><span className="avatar">AP</span><div><strong>{profile.display_name}</strong><small>Private demo workspace</small></div><button aria-label="Sign out" className="icon-button" onClick={logout}><LogOut size={16}/></button></div></div></aside>
    <div className="main-shell"><header className="topbar"><span className="breadcrumbs">Workspace <span className="crumb">/</span> Accounts payable</span><div className="topbar-actions"><ThemeSwitcher/><button className="icon-button mobile-signout" aria-label="Sign out of workspace" onClick={logout}><LogOut size={16}/></button><span className={`connection connection-${health}`}><i/>{health === 'ready' ? 'API configured' : health === 'setup' ? 'Setup required' : health === 'checking' ? 'Connecting to API' : 'API offline'}</span></div></header>
      <main>{error && <p className="access-error" role="alert">{error}</p>}
      <Routes><Route path="/" element={<Dashboard connected={connected}/>}/><Route path="/new" element={<NewInvoice connected={connected}/>}/><Route path="/history" element={<History connected={connected}/>}/><Route path="/reviews" element={<History connected={connected} review/>}/><Route path="/runs/:id" element={<Execution connected={connected}/>}/><Route path="/purchase-orders" element={<PurchaseOrders connected={connected}/>}/><Route path="*" element={<div className="page-heading"><h1>Page not found</h1><Link to="/">Return to overview</Link></div>}/></Routes></main>
      <footer><span>Ledgerly / Invoice intelligence</span><span>Human approval required · No payments initiated</span></footer>
    </div></div></BrowserRouter>
}
