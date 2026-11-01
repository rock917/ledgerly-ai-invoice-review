import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
type Theme = 'light' | 'dark' | 'system'
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const saved = localStorage.getItem('ledgerly_theme'); return saved === 'light' || saved === 'dark' ? saved : 'system' }
    catch { return 'system' }
  })
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme }
    apply()
    try { localStorage.setItem('ledgerly_theme', theme) } catch { /* Storage can be disabled. */ }
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  return <div className="theme-switcher" role="group" aria-label="Appearance">{(['light', 'dark', 'system'] as const).map(value => {
    const Icon = value === 'light' ? Sun : value === 'dark' ? Moon : Monitor
    return <button key={value} aria-label={`${value[0].toUpperCase() + value.slice(1)} theme`} aria-pressed={theme === value} title={`${value} theme`} onClick={() => setTheme(value)}><Icon size={15}/></button>
  })}</div>
}
