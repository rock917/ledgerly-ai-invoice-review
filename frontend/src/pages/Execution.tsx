import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, CheckCircle2, Circle, Clock3, FileSearch, LoaderCircle, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react'
import type { Detail } from '../types'
import { api, dateTime, money, useResource } from '../lib/api'
import { Badge, ErrorBanner } from '../components/shared'
import { Button } from '../components/ui/button'

const names = ['Receive invoice', 'Extract invoice', 'Validate information', 'Match purchase order', 'Evaluate business rules', 'Save decision']
function stageDuration(start: string, finish: string) {
  const elapsed = new Date(finish).getTime() - new Date(start).getTime()
  return elapsed < 0 ? 'timing unavailable (clock offset)' : `${(elapsed / 1000).toFixed(1)}s`
}
export function Execution({ connected }: { connected: boolean }) {
  const { id } = useParams()
  const { data, error, loading, refresh } = useResource<Detail>(`/api/executions/${id}`, connected)
  const [live, setLive] = useState<Detail | null>(null)
  const [liveError, setLiveError] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [reviewCode, setReviewCode] = useState('')
  const [comment, setComment] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { setLive(data) }, [data])
  useEffect(() => {
    if (!connected || data?.status !== 'running') return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      let again = true
      try {
        const result = await api<Detail>(`/api/executions/${id}`, { signal: controller.signal })
        if (!controller.signal.aborted) { setLive(result); setLiveError(''); again = result.status === 'running' }
      } catch (e) { if (!controller.signal.aborted) setLiveError((e as Error).message) }
      if (again && !controller.signal.aborted) timer = setTimeout(poll, 2500)
    }
    timer = setTimeout(poll, 2500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [id, connected, data])
  async function openDocument() {
    setActionError('')
    const popup = window.open('', '_blank')
    if (popup) popup.opener = null
    try { const result = await api<{ url: string }>(`/api/executions/${id}/document`); if (popup) popup.location.href = result.url; else setActionError('Allow pop-ups for this site to view the original PDF.') }
    catch (e) { popup?.close(); setActionError((e as Error).message) }
  }
  async function review(action: string) {
    setBusy(true); setActionError(''); setNotice('')
    try {
      await api(`/api/executions/${id}/reviews`, { method: 'POST', headers: { 'X-Review-Token': reviewCode }, body: JSON.stringify({ action, reviewer, comment }) })
      setNotice('Your review was saved to Supabase.'); setReviewCode(''); refresh()
    } catch (e) { setActionError((e as Error).message) }
    finally { setBusy(false) }
  }
  const run = live || data
  if (!run) return <><Link className="back-link" to="/history"><ArrowLeft size={15}/>Run history</Link>{error && <ErrorBanner message={error} retry={refresh}/>}<div className="data-placeholder"><FileSearch size={30}/><h3>{loading ? 'Loading execution…' : 'Connect the workspace to inspect this run.'}</h3></div></>
  const reviewFinal = ['approved', 'rejected'].includes(run.review_status)
  return <><Link className="back-link" to="/history"><ArrowLeft size={15}/>Run history</Link><div className="page-heading"><div><div className="eyebrow">EXECUTION DETAILS</div><h1>{run.invoice_number || run.filename}</h1><p>{run.vendor_name || 'Invoice processing'} <span className="inline-divider">/</span> {dateTime(run.created_at)}</p></div><Button variant="outline" onClick={openDocument}><ArrowUpRight size={16}/>Original PDF</Button></div>
    {(error || liveError) && <ErrorBanner message={error || liveError} retry={() => { setLiveError(''); refresh() }}/>}{actionError && <ErrorBanner message={actionError}/>}{notice && <div className="success-banner" role="status"><CheckCircle2 size={17}/>{notice}</div>}
    <div className="run-summary"><div><span>Execution status</span><Badge value={run.status}/></div><div><span>Business decision</span>{run.outcome ? <Badge value={run.outcome}/> : <strong>Awaiting result</strong>}</div><div><span>Invoice total</span><strong>{money(run.total, run.currency || 'INR')}</strong></div><div><span>Processing time</span><strong>{run.duration_ms !== null ? `${(run.duration_ms / 1000).toFixed(1)}s` : 'In progress'}</strong></div></div>
    {run.error_message && <ErrorBanner message={run.error_message}/>}
    {run.decision && <div className={`decision-banner decision-${run.outcome}`}><ShieldCheck size={24}/><div><strong>{run.decision.summary}</strong><p>Policy {run.policy_version} · {run.ai_model ? `Extracted with ${run.ai_model}` : 'AI extraction not completed'}</p></div></div>}
    <div className="execution-grid"><section className="panel stages-panel"><div className="panel-heading"><div><h2>Workflow timeline</h2><p>Actual stage events from this execution</p></div>{run.status === 'running' && <LoaderCircle size={18} className="spin"/>}</div><ol className="timeline">{names.map((name, position) => {
      const stage = run.stages.find(s => s.position === position)
      const state = stage?.status || (run.status === 'running' ? 'waiting' : 'not_run')
      const Icon = state === 'completed' ? Check : state === 'running' ? LoaderCircle : state === 'failed' ? XCircle : Circle
      return <li key={name} className={`stage-${state}`}><span className="stage-icon"><Icon size={15} className={state === 'running' ? 'spin' : ''}/></span><div><strong>{name}</strong><span className="stage-state">{state.replace('_', ' ')}</span>{stage?.detail && <p>{stage.detail}</p>}{stage && <small>{dateTime(stage.started_at)}{stage.finished_at && ` · ${stageDuration(stage.started_at, stage.finished_at)}`}</small>}</div></li>
    })}</ol><div className="execution-id">Execution ID<code>{run.id}</code></div></section>
    <div className="detail-column"><section className="panel"><div className="panel-heading"><div><h2>Validation & business rules</h2><p>What we detected, the policy applied, and what comes next.</p></div></div>{run.decision ? <div className="rules-list">{run.decision.rules.map(rule => <details key={rule.code} className={`rule rule-${rule.status}`} open={rule.status !== 'pass'}><summary>{rule.status === 'pass' ? <CheckCircle2 size={18}/> : <TriangleAlert size={18}/>}<strong>{rule.title}</strong><span>{rule.status === 'pass' ? 'Passed' : rule.status === 'block' ? 'Blocked' : 'Review'}</span></summary><div><dl><dt>Detected</dt><dd>{rule.detected}</dd><dt>Rule</dt><dd>{rule.rule}</dd><dt>Next action</dt><dd>{rule.next_action}</dd></dl></div></details>)}</div> : <div className="data-placeholder"><Clock3 size={26}/><p>{run.status === 'running' ? 'Checks will appear after extraction and PO matching.' : 'No business decision was generated.'}</p></div>}</section>
    {run.extraction && <section className="panel"><div className="panel-heading"><div><h2>Document evidence</h2><p>Verified excerpts from the uploaded PDF</p></div></div><div className="evidence-list">{run.extraction.evidence.map((e, i) => <div className="evidence" key={`${e.field}-${i}`}><div><span>{e.field.replaceAll('_', ' ')}</span><small>PAGE {e.page}</small></div><strong>{String(run.extraction?.[e.field] ?? '—')}</strong><blockquote>“{e.quote}”</blockquote></div>)}</div>{run.extraction.line_items.length > 0 && <div className="table-wrap"><table><thead><tr><th>Line item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>{run.extraction.line_items.map((line, i) => <tr key={i}><td>{line.description}</td><td>{line.quantity || '—'}</td><td>{money(line.amount, run.currency || 'INR')}</td></tr>)}</tbody></table></div>}</section>}
    {run.status === 'completed' && <section className="panel review-panel"><div className="panel-heading"><div><h2>Human review</h2><p>Your decision becomes part of the audit trail.</p></div><Badge value={run.review_status}/></div>{!reviewFinal && <div className="review-form"><div className="form-row"><label>Reviewer name<input value={reviewer} onChange={e => setReviewer(e.target.value)} placeholder="Your name" maxLength={100}/></label><label>Reviewer access code<input type="password" value={reviewCode} onChange={e => setReviewCode(e.target.value)} placeholder="Separate reviewer code" autoComplete="off"/></label></div><label>Decision notes<textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Explain the decision and any follow-up needed…" rows={3} minLength={5} maxLength={2000}/></label>{run.outcome !== 'ready' && <p className="form-note">Approval is unavailable while checks remain unresolved. Request a corrected document or reject this submission.</p>}<div className="review-actions"><Button disabled={busy || run.outcome !== 'ready' || comment.trim().length < 5 || !reviewCode || reviewer.trim().length < 2} onClick={() => review('approve')}><Check size={16}/>Approve invoice</Button><Button variant="outline" disabled={busy || comment.trim().length < 5 || !reviewCode || reviewer.trim().length < 2} onClick={() => review('request_info')}>Request information</Button><Button variant="ghost" disabled={busy || comment.trim().length < 5 || !reviewCode || reviewer.trim().length < 2} onClick={() => review('reject')}>Reject</Button></div></div>}{run.reviews.length > 0 && <div className="review-history">{run.reviews.map(r => <div key={r.id}><strong>{r.reviewer} · {r.action.replace('_', ' ')}</strong><small>{dateTime(r.created_at)}</small><p>{r.comment}</p></div>)}</div>}</section>}
    </div></div></>
}
