import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, Search, X, FileText } from 'lucide-react'
import { api, dateTime, money, useResource } from '../lib/api'
import type { Detail, PO, Run } from '../types'
import { Badge, Empty, ErrorBanner } from './shared'
import { Button } from './ui/button'

export function InvoiceInbox({ connected, pendingOnly = false }: { connected: boolean; pendingOnly?: boolean }) {
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const params = new URLSearchParams({ q: search, offset: String(offset) })
  if (pendingOnly || tab === 'pending') params.set('review', 'true')
  if (tab === 'approved' || tab === 'rejected') params.set('review_status', tab)
  if (tab === 'needs_review' || tab === 'blocked') params.set('outcome', tab)
  const { data, error, loading, refresh } = useResource<Run[]>(`/api/executions?${params}`, connected, 15000)
  const tabs = pendingOnly ? [['all', 'All pending'], ['needs_review', 'Needs attention'], ['blocked', 'Blocked']] : [['all', 'All invoices'], ['pending', 'Pending review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['needs_review', 'Needs attention'], ['blocked', 'Blocked']]
  return <div className={`inbox-layout ${selected ? 'has-selection' : ''}`}>
    <section className="panel inbox-panel">
      <div className="panel-heading"><div><h2>{pendingOnly ? 'Pending reviews' : 'Invoices'}</h2><p>{pendingOnly ? 'Invoices awaiting a final human decision.' : 'Select an invoice for a quick summary, or open its full record.'}</p></div></div>
      <form className="inbox-search" onSubmit={e => { e.preventDefault(); setSearch(query); setOffset(0); setSelected(null) }}><Search size={17}/><input aria-label="Search invoices" placeholder="Search invoice, vendor, or filename…" value={query} onChange={e => setQuery(e.target.value)}/><Button size="sm" variant="outline">Search</Button></form>
      <div className="inbox-tabs" role="group" aria-label="Invoice filters">{tabs.map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => { setTab(key); setOffset(0); setSelected(null) }}>{label}</button>)}</div>
      {error && <ErrorBanner message={error} retry={refresh}/>}
      {!data ? <div className="data-placeholder"><FileText size={26}/><p>{loading ? 'Loading invoices…' : 'Connect the workspace to view invoices.'}</p></div> : !data.length ? <Empty title={search || tab !== 'all' ? 'No matching invoices' : pendingOnly ? 'No pending reviews' : 'No invoices yet'} description={pendingOnly ? 'Approved and rejected invoices remain in Run history.' : 'Try another filter or upload an invoice to begin.'}/> : <div className="table-wrap"><table><thead><tr><th>Invoice / vendor</th><th>Amount</th><th>Status</th><th>Received</th><th><span className="sr-only">Open invoice</span></th></tr></thead><tbody>{data.map(run => <tr key={run.id} className={selected === run.id ? 'selected-row' : ''}><td><button className="invoice-select" aria-pressed={selected === run.id} onClick={() => setSelected(run.id)}><strong>{run.invoice_number || run.filename}</strong><small>{run.vendor_name || 'Extraction pending'}</small></button></td><td className="numeric">{money(run.total, run.currency || 'INR')}</td><td><Badge value={['approved', 'rejected', 'information_requested'].includes(run.review_status) ? run.review_status : run.status === 'completed' ? run.outcome || 'completed' : run.status}/></td><td className="muted nowrap">{dateTime(run.created_at)}</td><td><Link className="table-open" aria-label={`Open ${run.invoice_number || run.filename}`} to={`/runs/${run.id}`}><ArrowUpRight size={17}/></Link></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Page {offset / 25 + 1} · 25 invoices per page</span><Button variant="ghost" size="sm" disabled={!offset} onClick={() => { setOffset(v => v - 25); setSelected(null) }}><ArrowLeft size={14}/>Previous</Button><Button variant="ghost" size="sm" disabled={!data || data.length < 25} onClick={() => { setOffset(v => v + 25); setSelected(null) }}>Next<ArrowRight size={14}/></Button></div>
    </section>
    {selected && connected && <InvoicePreview key={selected} id={selected} close={() => setSelected(null)}/>}
  </div>
}

function InvoicePreview({ id, close }: { id: string; close: () => void }) {
  const { data: run, error, refresh } = useResource<Detail>(`/api/executions/${id}`)
  const { data: pos } = useResource<PO[]>('/api/purchase-orders')
  const [documentError, setDocumentError] = useState('')
  const po = pos?.find(p => p.reference === run?.extraction?.po_reference)
  const final = run && ['approved', 'rejected'].includes(run.review_status)
  async function openDocument() {
    const popup = window.open('', '_blank'); if (popup) popup.opener = null
    try { const result = await api<{url: string}>(`/api/executions/${id}/document`); if (popup) popup.location.href = result.url; else setDocumentError('Allow pop-ups to view the PDF.') }
    catch (e) { popup?.close(); setDocumentError((e as Error).message) }
  }
  return <aside className="panel invoice-preview" aria-label="Invoice summary"><div className="panel-heading"><h2>Invoice summary</h2><button className="icon-button" aria-label="Close invoice summary" onClick={close}><X size={18}/></button></div>{error && <ErrorBanner message={error} retry={refresh}/>}<div className="preview-body">{!run ? <p>Loading summary…</p> : <><h3>{run.invoice_number || run.filename}</h3><Badge value={final ? run.review_status : run.outcome || run.status}/><p className="muted">{final ? 'Final human decision recorded.' : 'Review the evidence before recording a decision.'}</p><dl className="preview-facts"><dt>Vendor</dt><dd>{run.vendor_name || 'Not extracted'}</dd><dt>Invoice amount</dt><dd>{money(run.total, run.currency || 'INR')}</dd><dt>Validation result</dt><dd>{run.outcome === 'ready' ? 'Checks passed' : run.outcome === 'needs_review' ? 'Needs attention' : run.outcome === 'blocked' ? 'Blocked' : 'Not available'}</dd><dt>Human review</dt><dd><Badge value={run.review_status}/></dd>{po && <><dt>Purchase order</dt><dd>{po.reference}</dd><dt>PO amount</dt><dd>{money(po.amount, po.currency)}</dd><dt>Accepted to date</dt><dd>{money(po.accepted_amount, po.currency)}</dd><dt>Remaining balance</dt><dd>{money(Number(po.amount) - Number(po.accepted_amount), po.currency)}</dd></>}</dl><h4>Review history</h4>{run.reviews.length ? <ol className="preview-timeline">{run.reviews.map(r => <li key={r.id}><strong>{r.action.replace('_', ' ')} · {r.reviewer}</strong><small>{dateTime(r.created_at)}</small><p>{r.comment}</p></li>)}</ol> : <p className="muted">No human decision recorded yet.</p>}<Button variant="outline" onClick={openDocument}><FileText size={15}/>Original PDF</Button>{documentError && <ErrorBanner message={documentError}/>}<Button asChild><Link to={`/runs/${id}`}>Open full invoice<ArrowUpRight size={15}/></Link></Button></>}</div></aside>
}
