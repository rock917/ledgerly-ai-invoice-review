import { ArrowUpRight, FileText, AlertCircle, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Run } from '../types'
import { dateTime, money } from '../lib/api'
import { Button } from './ui/button'

const labels: Record<string, string> = { ready: 'Ready for approval', needs_review: 'Needs attention', blocked: 'Blocked', running: 'Processing', failed: 'Failed', interrupted: 'Interrupted', approved: 'Approved', rejected: 'Rejected', information_requested: 'Information requested', pending: 'Awaiting review', completed: 'Completed' }
export function Badge({ value }: { value: string }) { return <span className={`badge badge-${value}`}><span className="badge-dot"/>{labels[value] || value}</span> }
export function ErrorBanner({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-banner" role="alert"><AlertCircle size={18}/><span>{message}</span>{retry && <Button variant="ghost" size="sm" onClick={retry}><RefreshCw size={14}/>Retry</Button>}</div>
}
export function Empty({ title, description, action = false }: { title: string; description: string; action?: boolean }) {
  return <div className="empty"><div className="empty-icon"><FileText size={27}/></div><h3>{title}</h3><p>{description}</p>{action && <Button asChild><Link to="/new">Process your first invoice <ArrowUpRight size={15}/></Link></Button>}</div>
}
export function RunsTable({ runs }: { runs: Run[] }) {
  if (!runs.length) return <Empty title="Your invoice history starts here" description="Processed invoices, decisions, and review records will appear here." action/>
  return <div className="table-wrap"><table><thead><tr><th>Invoice / vendor</th><th>Amount</th><th>Decision</th><th>Received</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{runs.map(run => <tr key={run.id}><td><Link className="invoice-cell" to={`/runs/${run.id}`}><span className="file-icon"><FileText size={18}/></span><span><strong>{run.invoice_number || run.filename}</strong><small>{run.vendor_name || 'Extraction pending'}</small></span></Link></td><td className="numeric">{money(run.total, run.currency || 'INR')}</td><td><Badge value={['approved', 'rejected'].includes(run.review_status) ? run.review_status : run.status === 'completed' ? run.outcome || 'completed' : run.status}/></td><td className="muted nowrap">{dateTime(run.created_at)}</td><td><Link className="table-open" aria-label={`Open ${run.invoice_number || run.filename}`} to={`/runs/${run.id}`}><ArrowUpRight size={18}/></Link></td></tr>)}</tbody></table></div>
}
