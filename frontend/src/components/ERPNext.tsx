import { useState } from 'react'
import { api, useResource } from '../lib/api'
import { ErrorBanner } from './shared'
import { Button } from './ui/button'

type Export = { status: string; erp_document_id: string | null; error_message: string | null }

export function ERPImport({ connected, onImported }: { connected: boolean; onImported: () => void }) {
  if (import.meta.env.VITE_ENABLE_ERPNEXT !== 'true') return null
  return <EnabledERPImport connected={connected} onImported={onImported}/>
}

function EnabledERPImport({ connected, onImported }: { connected: boolean; onImported: () => void }) {
  const { data, error: connectionError, refresh } = useResource<{ enabled: boolean }>('/api/erpnext', connected)
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function importPO() {
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/erpnext/purchase-orders', { method: 'POST', body: JSON.stringify({ reference: reference.trim() }) })
      setNotice('Purchase order and supplier imported. Existing accepted balances were preserved.'); onImported()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  if (connectionError) return <ErrorBanner message={`ERP connection status: ${connectionError}`} retry={refresh}/>
  if (!data?.enabled) return null
  return <section className="panel"><div className="panel-heading"><div><h2>Import from ERPNext</h2><p>Connect a submitted purchase order to this workspace.</p></div></div><form className="review-form" onSubmit={e => { e.preventDefault(); void importPO() }}>
    <p>Demo integration supports unbilled INR orders with one non-stock line and no tax or discounts. Import the PO before uploading its invoice.</p>
    <label>ERPNext purchase order reference<input value={reference} onChange={e => setReference(e.target.value)} maxLength={140} placeholder="PUR-ORD-2026-00001" required/></label>
    {error && <ErrorBanner message={error}/>} {notice && <p role="status">{notice}</p>}
    <Button type="submit" disabled={busy || !reference.trim()}>{busy ? 'Importing…' : 'Import purchase order'}</Button>
  </form></section>
}

export function ERPExport({ id, approved }: { id: string; approved: boolean }) {
  if (import.meta.env.VITE_ENABLE_ERPNEXT !== 'true') return null
  return <EnabledERPExport id={id} approved={approved}/>
}

function EnabledERPExport({ id, approved }: { id: string; approved: boolean }) {
  const { data, error: loadError, refresh } = useResource<{ enabled: boolean; export?: Export | null }>(`/api/executions/${id}/erpnext`, true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function exportDraft() {
    setBusy(true); setError('')
    try { await api(`/api/executions/${id}/erpnext`, { method: 'POST' }) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false); refresh() }
  }
  if (loadError) return <ErrorBanner message={`ERP export status: ${loadError}`} retry={refresh}/>
  if (!data?.enabled) return null
  const result = data.export
  return <section className="panel"><div className="panel-heading"><div><h2>ERPNext draft export</h2><p>Create a purchase invoice for your ERP team to inspect.</p></div></div><div className="review-form">
    <p>Only approved invoices linked to an imported ERP purchase order can be exported. This creates a draft; it does not post accounting entries or initiate payment.</p>
    {(error || result?.error_message) && <ErrorBanner message={error || result?.error_message || ''}/>}
    {result?.status === 'synced' ? <p role="status">Export confirmed: <strong>{result.erp_document_id}</strong>. Created as a draft in ERPNext.</p> : <>
      {!approved && <p>Approve the invoice after its checks pass to enable export.</p>}
      {result?.status === 'pending' && <p>An export was started. Refresh to check the result. After an interruption, wait three minutes before retrying.</p>}
      <div className="review-actions"><Button disabled={busy || !approved} onClick={exportDraft}>{busy ? 'Confirming ERP draft…' : result ? 'Reconcile and retry export' : 'Export draft to ERPNext'}</Button><Button variant="outline" disabled={busy} onClick={refresh}>Refresh status</Button></div>
    </>}
  </div></section>
}
