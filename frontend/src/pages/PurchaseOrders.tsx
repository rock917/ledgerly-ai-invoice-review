import { useResource, money } from '../lib/api'
import type { PO } from '../types'
import { ErrorBanner, Empty } from '../components/shared'
import { ERPImport } from '../components/ERPNext'

export function PurchaseOrders({ connected }: { connected: boolean }) {
  const { data, error, refresh } = useResource<PO[]>('/api/purchase-orders', connected)
  return <><div className="page-heading"><div className="eyebrow">PROCUREMENT REFERENCE</div><h1>Know what’s left on every PO.</h1><p>Gross amounts, including tax. Accepted balances change only after human approval.</p></div><ERPImport connected={connected} onImported={refresh}/>{error && <ErrorBanner message={error} retry={refresh}/>}<section className="panel"><div className="panel-heading"><div><h2>Purchase orders</h2><p>Reference data from your Supabase workspace</p></div></div>{data?.length ? <div className="table-wrap"><table><thead><tr><th>Purchase order</th><th>Vendor</th><th>PO amount</th><th>Accepted</th><th>Remaining</th><th>Status</th><th>Source</th></tr></thead><tbody>{data.map(po => <tr key={po.id}><td><strong>{po.reference}</strong></td><td>{po.vendor.name}</td><td>{money(po.amount, po.currency)}</td><td>{money(po.accepted_amount, po.currency)}</td><td><strong>{money(Number(po.amount) - Number(po.accepted_amount), po.currency)}</strong></td><td>{po.status}</td><td>{po.erp_snapshot ? "ERPNext" : "Demo dataset"}</td></tr>)}</tbody></table></div> : <Empty title="No purchase orders loaded" description="Connect the workspace and apply the synthetic seed dataset to get started."/>}</section></>
}
