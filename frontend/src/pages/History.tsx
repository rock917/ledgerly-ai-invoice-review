import { Link } from 'react-router-dom'
import { InvoiceInbox } from '../components/InvoiceInbox'

export function History({ connected, review = false }: { connected: boolean; review?: boolean }) {
  return <><div className="page-heading"><div><div className="eyebrow">{review ? 'HUMAN REVIEW' : 'THE COMPLETE AUDIT TRAIL'}</div><h1>{review ? 'Pending reviews.' : 'Every invoice has a history.'}</h1><p>{review ? 'Only invoices awaiting a final decision appear here. Approved and rejected invoices stay in ' : 'Browse all invoices, including approved and rejected decisions.'}{review && <Link className="inline-link" to="/history">Run history.</Link>}</p></div></div><InvoiceInbox key={review ? 'pending' : 'all'} connected={connected} pendingOnly={review}/></>
}
