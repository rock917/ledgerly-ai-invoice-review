import { useCallback, useEffect, useState } from 'react'
import { accessToken } from './supabase'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8001').replace(/\/$/, '')

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}` }
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    const timeout = AbortSignal.timeout(70000)
    response = await fetch(`${API_URL}${path}`, { ...options, headers: { ...headers, ...options.headers }, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout })
  } catch {
    throw new Error('Unable to connect to the service. Please try again shortly. If this continues, contact the demo owner.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error?.message || (Array.isArray(data?.detail) ? data.detail.map((d: { msg: string }) => d.msg).join('; ') : 'The request could not be completed.'))
  }
  return data as T
}

export function useResource<T>(path: string, enabled = true, interval = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(enabled)
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion(v => v + 1), [])
  useEffect(() => {
    if (!enabled) { setData(null); setError(''); setLoading(false); return }
    const controller = new AbortController()
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    setData(null)
    setLoading(true)
    async function load() {
      try {
        const result = await api<T>(path, { signal: controller.signal })
        if (alive) { setData(result); setError('') }
      } catch (err) {
        if (alive) setError((err as Error).message)
      } finally {
        if (alive) {
          setLoading(false)
          if (interval) timer = setTimeout(load, interval)
        }
      }
    }
    void load()
    return () => { alive = false; controller.abort(); clearTimeout(timer) }
  }, [path, enabled, interval, version])
  return { data, error, loading, refresh }
}

export function money(value: number | string | null | undefined, currency = 'INR') {
  if (value === null || value === undefined) return '—'
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value)) }
  catch { return `${currency} ${value}` }
}
export const dateTime = (value: string) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
