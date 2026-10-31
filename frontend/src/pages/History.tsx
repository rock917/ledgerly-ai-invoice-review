import { useState } from 'react'
import { Search, ArrowLeft, ArrowRight } from 'lucide-react'
import { useResource } from '../lib/api'
import type { Run } from '../types'
import { ErrorBanner, RunsTable } from '../components/shared'
import { Button } from '../components/ui/button'

export function History({ connected, review = false }: { connected: boolean; review?: boolean }) {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const params = new URLSearchParams({ q: search, offset: String(offset), review: String(review), ...(filter === 'failed' ? { status: filter } : { outcome: filter }) })
  const { data, error, loading, refresh } = useResource<Run[]>(`/api/executions?${params}`, connected, 15000)
  return <><div className="page-heading"><div className="eyebrow">{review ? 'KEEP PEOPLE IN CONTROL' : 'THE COMPLETE AUDIT TRAIL'}</div><h1>{review ? 'A decision needs your attention.' : 'Every invoice has a history.'}</h1><p>{review ? 'Review evidence, record a decision, and keep the next step clear.' : 'Find previous executions and inspect the evidence behind each outcome.'}</p></div>{error && <ErrorBanner message={error} retry={refresh}/>}<section className="panel"><div className="filter-bar"><form onSubmit={e => { e.preventDefault(); setSearch(query); setOffset(0) }} className="search-box"><Search size={17}/><input placeholder="Search invoice, vendor, or filename" aria-label="Search execution history" value={query} onChange={e => setQuery(e.target.value)}/><Button size="sm" variant="ghost">Search</Button></form><select aria-label="Filter decisions" value={filter} onChange={e => { setFilter(e.target.value); setOffset(0) }}><option value="">All decisions</option><option value="ready">Ready for approval</option><option value="needs_review">Needs attention</option><option value="blocked">Blocked</option>{!review && <option value="failed">Technical failures</option>}</select></div>{data ? <RunsTable runs={data}/> : <div className="data-placeholder"><p>{loading ? 'Loading execution records…' : 'Connect the workspace to view saved records.'}</p></div>}<div className="pagination"><span>Page {offset / 25 + 1} · Up to 25 runs per page</span><Button variant="outline" size="sm" disabled={!offset} onClick={() => setOffset(v => v - 25)}><ArrowLeft size={14}/>Previous</Button><Button variant="outline" size="sm" disabled={!data || data.length < 25} onClick={() => setOffset(v => v + 25)}>Next<ArrowRight size={14}/></Button></div></section></>
}
