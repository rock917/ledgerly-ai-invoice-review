import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, FileText, LoaderCircle, ShieldCheck, UploadCloud, X } from 'lucide-react'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { ErrorBanner } from '../components/shared'

export function NewInvoice({ connected }: { connected: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const navigate = useNavigate()
  function select(file?: File) {
    setError('')
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 5 * 1024 * 1024) { setError('Choose a PDF no larger than 5 MB.'); return }
    setFile(file)
  }
  async function submit() {
    if (!file) return
    setBusy(true); setError('')
    const body = new FormData(); body.append('file', file)
    try { const result = await api<{ id: string }>('/api/executions', { method: 'POST', body }); navigate(`/runs/${result.id}`) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <><div className="page-heading"><div className="eyebrow">START A WORKFLOW</div><h1>One invoice. A complete picture.</h1><p>Upload a PDF to extract its details, check the PO, and surface exceptions.</p></div><div className="upload-grid"><section className="panel upload-panel"><div className="panel-heading"><div><h2>Upload invoice</h2><p>Use synthetic documents in this demonstration workspace.</p></div><span className="step-pill">STEP 01</span></div>{error && <ErrorBanner message={error}/>}
    <div className={`dropzone ${drag ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); if (!busy) select(e.dataTransfer.files[0]) }}><div className="upload-icon"><UploadCloud size={32}/></div><h3>Drop your invoice here</h3><p>or select a file from your computer</p><label className={`file-select ${busy ? 'disabled' : ''}`}>Browse files<input type="file" accept=".pdf,application/pdf" aria-label="Choose invoice PDF" disabled={busy} onChange={e => select(e.target.files?.[0])}/></label><small>PDF only · Up to 5 MB · Maximum 5 pages</small></div>
    {file && <div className="selected-file"><FileText size={23}/><div><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · Ready to upload</small></div><button aria-label="Remove selected file" className="icon-button" disabled={busy} onClick={() => setFile(null)}><X size={18}/></button></div>}
    <div className="upload-bottom"><span><ShieldCheck size={16}/>Stored in a private bucket</span><Button disabled={!file || !connected || busy} onClick={submit}>{busy ? <LoaderCircle className="spin" size={17}/> : <ArrowRight size={17}/>} {busy ? 'Submitting…' : 'Start workflow'}</Button></div></section>
    <aside className="upload-aside"><div className="eyebrow">WHAT HAPPENS NEXT</div><h2>Less manual checking.<br/>More clarity.</h2><ol>{[['Extract the facts', 'Read PDF text or use OCR for scanned pages, then extract fields with source excerpts.'], ['Check the business rules', 'Verify amounts, vendor identity, duplicate history, and remaining PO balance.'], ['Get a reasoned decision', 'See what passed, what needs attention, and the next action.']].map(([title, text]) => <li key={title}><span><Check size={15}/></span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ol><div className="scope-note"><strong>Document support</strong><p>English text PDFs and clear printed scans. Scanned pages take longer. Unreadable or uncertain text requires review; compare OCR excerpts with the original PDF. No payments are initiated.</p></div></aside></div></>
}
