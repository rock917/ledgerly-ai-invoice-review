import { CheckCheck, Clock3, FileText, ShieldAlert, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useResource } from '../lib/api'
import type { DashboardData } from '../types'
import { Button } from '../components/ui/button'
import { ErrorBanner } from '../components/shared'
import { InvoiceInbox } from '../components/InvoiceInbox'

export function Dashboard({ connected }: { connected: boolean }) {
  const { data, error, loading, refresh } = useResource<DashboardData>('/api/dashboard', connected, 15000)
  const cards = [
    { key: 'total', title: 'Invoices processed', detail: 'All saved workflows', icon: FileText },
    { key: 'pending_reviews', title: 'Pending reviews', detail: 'Awaiting a final decision', icon: Clock3 },
    { key: 'approved', title: 'Approved', detail: 'Accepted by a reviewer', icon: CheckCheck },
    { key: 'failed', title: 'Technical failures', detail: 'Failed or interrupted runs', icon: ShieldAlert },
  ]
  return <><div className="page-heading"><div><div className="eyebrow">ACCOUNTS PAYABLE</div><h1>Your invoice workspace.</h1><p>Every invoice, every check, every decision. In one place.</p></div><Button asChild><Link to="/new"><Upload size={17}/>Upload invoice</Link></Button></div>
    {error && <ErrorBanner message={error} retry={refresh}/>}
    <div className="metric-grid">{cards.map(({key, title, detail, icon: Icon}) => <section className={`metric-card metric-${key}`} key={key}><span className="metric-icon"><Icon size={20}/></span><div><span className="metric-title">{title}</span><strong className="metric-value">{data?.metrics[key] ?? '—'}</strong><small>{loading ? 'Loading…' : detail}</small></div></section>)}</div>
    <InvoiceInbox connected={connected}/>
  </>
}
