import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import { ArrowUpDown, Search } from 'lucide-react'
import { naturalCompare, usePersistedState, statusOrder } from '../lib/listControls'

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
type StatusFilter = 'all' | 'online' | 'offline' | 'never'

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

  // Persisted UI prefs
  const [sortKey, setSortKey] = usePersistedState<SortKey>('gw.sortKey', 'hostname')
  const [sortAsc, setSortAsc] = usePersistedState<boolean>('gw.sortAsc', true)
  const [search, setSearch] = usePersistedState<string>('gw.search', '')
  const [statusFilter, setStatusFilter] = usePersistedState<StatusFilter>('gw.statusFilter', 'all')
  const [siteFilter, setSiteFilter] = usePersistedState<string>('gw.siteFilter', 'all')

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

  // Distinct sites that appear in this gateway list, for the filter dropdown
  const siteOptions = useMemo(() => {
    const s = new Set<string>()
    gateways.forEach(g => { if (g.site_name) s.add(g.site_name) })
    return Array.from(s).sort((a, b) => naturalCompare(a, b))
  }, [gateways])

  const filtered = useMemo(() => {
    let list = [...gateways]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(g =>
        (g.hostname ?? '').toLowerCase().includes(q) ||
        (g.site_name ?? '').toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q) ||
        (g.type ?? '').toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') list = list.filter(g => g.status === statusFilter)
    if (siteFilter !== 'all') list = list.filter(g => g.site_name === siteFilter)

    list.sort((a, b) => {
      let result = 0
      if (sortKey === 'hostname') {
        result = naturalCompare(a.hostname ?? a.id, b.hostname ?? b.id)
      } else if (sortKey === 'status') {
        result = statusOrder(a.status) - statusOrder(b.status)
        if (result === 0) result = naturalCompare(a.hostname ?? a.id, b.hostname ?? b.id)
      } else if (sortKey === 'site') {
        result = naturalCompare(a.site_name ?? '', b.site_name ?? '')
        if (result === 0) result = naturalCompare(a.hostname ?? a.id, b.hostname ?? b.id)
      } else if (sortKey === 'heartbeat') {
        result = (a.last_heartbeat ?? 0) - (b.last_heartbeat ?? 0)
      } else if (sortKey === 'assets') {
        result = a.asset_count - b.asset_count
        if (result === 0) result = naturalCompare(a.hostname ?? a.id, b.hostname ?? b.id)
      }
      return sortAsc ? result : -result
    })

    return list
  }, [gateways, search, statusFilter, siteFilter, sortKey, sortAsc])

  const online = gateways.filter(g => g.status === 'online').length
  const offline = gateways.filter(g => g.status === 'offline').length
  const never = gateways.filter(g => g.status === 'never').length

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

  const filtersActive = search.trim() !== '' || statusFilter !== 'all' || siteFilter !== 'all'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Gateways</div>
          <div className="page-subtitle">
            {online}/{gateways.length} reporting
            {filtersActive && ` · showing ${filtered.length}`}
          </div>
        </div>
        <button className="btn-ghost" onClick={load} style={{ fontSize: 12 }}>↻ Refresh</button>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total</div>
          <div className="kpi-value" style={{ color: 'var(--text-primary)' }}>{gateways.length}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(statusFilter === 'online' ? 'all' : 'online')}>
          <div className="kpi-label">Online</div>
          <div className="kpi-value" style={{ color: 'var(--green)' }}>{online}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}>
          <div className="kpi-label">Offline</div>
          <div className="kpi-value" style={{ color: 'var(--red)' }}>{offline}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(statusFilter === 'never' ? 'all' : 'never')}>
          <div className="kpi-label">Never Seen</div>
          <div className="kpi-value" style={{ color: 'var(--text-muted)' }}>{never}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            placeholder="Search gateways, sites…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 30, maxWidth: 240 }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="never">Never Seen</option>
        </select>
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
          <option value="all">All Sites</option>
          {siteOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {filtersActive && (
          <button
            className="btn-ghost"
            style={{ fontSize: 11, padding: '5px 10px' }}
            onClick={() => { setSearch(''); setStatusFilter('all'); setSiteFilter('all') }}
          >
            Clear filters
          </button>
        )}
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
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                {gateways.length === 0 ? 'No gateways found' : 'No gateways match your filters'}
              </td></tr>
            ) : filtered.map(g => (
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
