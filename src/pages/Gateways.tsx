import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import { ArrowUpDown } from 'lucide-react'

interface GW {
  id: string
  hostname: string | null
  type: string | null
  status: string
  last_heartbeat: number | null
  site_name: string | null
  asset_count: number
}

type SortKey = 'hostname' | 'status' | 'site' | 'heartbeat' | 'assets'

function fmt(ts: number | null) {
  if (!ts || ts === 0) return 'Never'
  const d = new Date(ts * 1000)
  const ago = Math.floor((Date.now() - d.getTime()) / 1000)
  if (ago < 60) return `${ago}s ago`
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`
  return d.toLocaleDateString()
}

function gwStatus(g: { last_heartbeat: number | null }): 'online' | 'offline' | 'never' {
  if (!g.last_heartbeat || g.last_heartbeat === 0) return 'never'
  const age = Date.now() - g.last_heartbeat * 1000
  return age < 120000 ? 'online' : 'offline'
}

export default function Gateways() {
  const { selectedCompany } = useApp()
  const [gateways, setGateways] = useState<GW[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    if (!selectedCompany) return
    load()
    const iv = setInterval(load, 15000)
    return () => clearInterval(iv)
  }, [selectedCompany])

  async function load() {
    if (!selectedCompany) return
    setLoading(true)
    const { data: gws } = await supabase
      .from('gateways')
      .select('id, hostname, type, status, last_heartbeat, site_id')
      .eq('company_id', selectedCompany.id)
    const { data: assets } = await supabase
      .from('assets')
      .select('gateway_id, site_id')
      .eq('company_id', selectedCompany.id)
    const { data: sites } = await supabase
      .from('sites')
      .select('id, name')
    if (gws) {
      const siteMap: Record<string, string> = {}
      sites?.forEach((s: { id: string; name: string }) => { siteMap[s.id] = s.name })
      const assetCountMap: Record<string, number> = {}
      assets?.forEach((a: { gateway_id: string | null }) => {
        if (a.gateway_id) assetCountMap[a.gateway_id] = (assetCountMap[a.gateway_id] || 0) + 1
      })
      setGateways(gws.map((g: { id: string; hostname: string | null; type: string | null; status: string; last_heartbeat: number | null; site_id: string | null }) => ({
        ...g,
        status: gwStatus(g),
        site_name: g.site_id ? siteMap[g.site_id] ?? null : null,
        asset_count: assetCountMap[g.id] ?? 0
      })))
    }
    setLoading(false)
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(v => !v)
    else { setSortKey(k); setSortAsc(true) }
  }

  const sorted = [...gateways].sort((a, b) => {
    let av: string | number = 0, bv: string | number = 0
    if (sortKey === 'hostname') { av = a.hostname ?? ''; bv = b.hostname ?? '' }
    else if (sortKey === 'status') {
      const o = { online: 0, offline: 1, never: 2 }
      av = o[a.status as keyof typeof o] ?? 2
      bv = o[b.status as keyof typeof o] ?? 2
    }
    else if (sortKey === 'site') { av = a.site_name ?? ''; bv = b.site_name ?? '' }
    else if (sortKey === 'heartbeat') { av = a.last_heartbeat ?? 0; bv = b.last_heartbeat ?? 0 }
    else if (sortKey === 'assets') { av = a.asset_count; bv = b.asset_count }
    if (av < bv) return sortAsc ? -1 : 1
    if (av > bv) return sortAsc ? 1 : -1
    return 0
  })

  const online = gateways.filter(g => g.status === 'online').length

  function SortTh({ k, label }: { k: SortKey; label: string }) {
    return (
      <th className="sortable" onClick={() => toggleSort(k)} style={{ color: sortKey === k ? 'var(--cyan)' : undefined }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {label}
          <ArrowUpDown size={11} style={{ opacity: sortKey === k ? 1 : 0.4 }} />
        </span>
      </th>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Gateways</div>
          <div className="page-subtitle">{online}/{gateways.length} reporting</div>
        </div>
        <button className="btn-ghost" onClick={load} style={{ fontSize: 12 }}>↻ Refresh</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <SortTh k="hostname" label="Gateway" />
              <SortTh k="status" label="Status" />
              <SortTh k="site" label="Site" />
              <th>Type</th>
              <SortTh k="heartbeat" label="Last Heartbeat" />
              <SortTh k="assets" label="Assets" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No gateways found</td></tr>
            ) : sorted.map(g => (
              <tr key={g.id}>
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                  {g.hostname ?? g.id.slice(0, 12)}
                </td>
                <td>
                  <span className={`badge badge-${g.status}`}>
                    <span className={`dot dot-${g.status}`} />
                    {g.status}
                  </span>
                </td>
                <td>{g.site_name ?? '—'}</td>
                <td style={{ textTransform: 'capitalize' }}>{g.type ?? '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(g.last_heartbeat)}</td>
                <td>{g.asset_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
