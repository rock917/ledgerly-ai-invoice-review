import { useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { ArrowUpRight, CircleHelp, FilePlus2, FolderClock, LayoutDashboard, ListChecks, LockKeyhole, LogOut, PanelsTopLeft, ReceiptText, ShieldCheck } from 'lucide-react'
import { API_URL, accessToken, api } from './lib/api'
import { Button } from './components/ui/button'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { Dashboard } from './pages/Dashboard'
import { NewInvoice } from './pages/NewInvoice'
import { History } from './pages/History'
import { Execution } from './pages/Execution'
import { PurchaseOrders } from './pages/PurchaseOrders'

export default function App() {
  const [connected, setConnected] = useState(Boolean(accessToken()))
  const [health, setHealth] = useState<'checking' | 'ready' | 'setup' | 'offline'>('checking')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_URL}/health`, { signal: controller.signal }).then(r => r.json()).then(d => setHealth(d.configured ? 'ready' : 'setup')).catch(() => { if (!controller.signal.aborted) setHealth('offline') })
    return () => controller.abort()
  }, [])
  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    sessionStorage.setItem('ledgerly_access', code)
    try { await api('/api/readiness'); setConnected(true); setHealth('ready'); setCode('') }
    catch (e) { sessionStorage.removeItem('ledgerly_access'); setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <BrowserRouter><div className="app-shell">
    <aside className="sidebar"><Link to="/" className="brand"><span className="brand-mark"><ReceiptText size={22}/></span>ledgerly<span className="brand-period">.</span></Link><div className="workspace"><span className="workspace-logo">AP</span><div><strong>Invoice operations</strong><small>Case study workspace</small></div><span className="workspace-chevron">⌄</span></div><div className="nav-label">WORKSPACE</div><nav>
      <NavLink to="/" end><LayoutDashboard size={18}/>Overview</NavLink><NavLink to="/new"><FilePlus2 size={18}/>New invoice</NavLink><NavLink to="/history"><FolderClock size={18}/>Run history</NavLink><NavLink to="/reviews"><ListChecks size={18}/>Pending reviews</NavLink><NavLink to="/purchase-orders"><PanelsTopLeft size={18}/>Purchase orders</NavLink>
    </nav><div className="sidebar-bottom"><div className="policy-note"><ShieldCheck size={18}/><strong>Every decision, traceable.</strong><p>AI extracts. Rules validate.<br/>People approve.</p></div><a className="help-link" href={`${API_URL}/docs`} target="_blank" rel="noreferrer"><CircleHelp size={17}/>API documentation<ArrowUpRight size={14}/></a><div className="profile"><span className="avatar">AP</span><div><strong>AP workspace</strong><small>Synthetic demo data</small></div>{connected && <button aria-label="Lock workspace" className="icon-button" onClick={() => { sessionStorage.removeItem('ledgerly_access'); setConnected(false) }}><LogOut size={16}/></button>}</div></div></aside>
    <div className="main-shell"><header className="topbar"><span className="breadcrumbs">Workspace <span className="crumb">/</span> Accounts payable</span><div className="topbar-actions"><ThemeSwitcher/><span className={`connection connection-${health}`}><i/>{health === 'ready' ? 'API configured' : health === 'setup' ? 'Setup required' : health === 'checking' ? 'Connecting to API' : 'API offline'}</span></div></header>
      <main>{!connected && <div className="access-panel"><div className="access-heading"><LockKeyhole size={20}/><div><strong>{health === 'setup' ? 'Connect your workspace' : 'Open the demo workspace'}</strong><p>{health === 'setup' ? 'Add Supabase and Groq credentials to backend/.env and apply the SQL schema, then restart the API.' : 'Enter the demo access code to load real invoices and processing history.'}</p></div></div><form onSubmit={unlock}><input aria-label="Demo access code" type="password" placeholder="Demo access code" value={code} onChange={e => setCode(e.target.value)} required/><Button disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</Button></form>{error && <p className="access-error" role="alert">{error}</p>}</div>}
      <Routes><Route path="/" element={<Dashboard connected={connected}/>}/><Route path="/new" element={<NewInvoice connected={connected}/>}/><Route path="/history" element={<History connected={connected}/>}/><Route path="/reviews" element={<History connected={connected} review/>}/><Route path="/runs/:id" element={<Execution connected={connected}/>}/><Route path="/purchase-orders" element={<PurchaseOrders connected={connected}/>}/><Route path="*" element={<div className="page-heading"><h1>Page not found</h1><Link to="/">Return to overview</Link></div>}/></Routes></main>
      <footer><span>Ledgerly / Invoice intelligence</span><span>Human approval required · No payments initiated</span></footer>
    </div></div></BrowserRouter>
}
