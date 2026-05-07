import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import { Search, SortAsc, SortDesc, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import type { Asset } from '../lib/types'

type SortKey = 'name' | 'helium' | 'status' | 'site'
type StatusFilter = 'all' | 'online' | 'offline' | 'warning' | 'critical'

function heClass(v: number | null) {
  if (v == null) return 'level-crit'
  if (v < 60) return 'level-crit'
  if (v < 75) return 'level-warn'
  return 'level-ok'
}

function assetStatus(a: Asset): 'online' | 'offline' | 'warning' | 'critical' {
  if (!a.telemetry?.sampled_at) return 'offline'
  const age = Date.now() - new Date(a.telemetry.sampled_at).getTime()
  if (age > 5 * 60 * 1000) return 'offline'
  const he = a.telemetry.helium_level ?? null
  const flow = a.telemetry.water_flow ?? null
  if (he != null && he < 60) return 'critical'
  if ((he != null && he < 75) || (flow != null && flow < 0.6)) return 'warning'
  return 'online'
}

interface SparkData { t: number; v: number | null }

export default function Dashboard() {
  const { selectedCompany } = useApp()
  const navigate = useNavigate()
  const [assets, setAssets] = useState<Asset[]>([])
  const [sparks, setSparks] = useState<Record<string, SparkData[]>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [siteFilter, setSiteFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    if (!selectedCompany) return
    loadAssets()
    const iv = setInterval(loadAssets, 30000)
    return () => clearInterval(iv)
  }, [selectedCompany])

  async function loadAssets() {
    if (!selectedCompany) return
    setLoading(true)
    const { data } = await supabase
      .from('assets')
      .select(`
        id, name, model, serial, magmon_ip, site_id, company_id, gateway_id,
        site:sites(id, name, city, state),
        telemetry:v_asset_latest_normalized(
          asset_id, helium_level, water_flow, chiller_temp,
          shield_temp, he_pressure, compressor, cs1, coldhead_temp_k, sampled_at
        )
      `)
      .eq('company_id', selectedCompany.id)
      .order('name')
    if (data) {
      const enriched = (data as any[]).map((a: any) => {
        const asset: Asset = {
          ...a,
          site: Array.isArray(a.site) ? a.site[0] ?? null : a.site,
          telemetry: Array.isArray(a.telemetry) ? a.telemetry[0] ?? null : a.telemetry,
        }
        return { ...asset, status: assetStatus(asset) }
      })
      setAssets(enriched)
      loadSparklines(enriched.map(a => a.id))
    }
    setLoading(false)
  }

  async function loadSparklines(ids: string[]) {
    if (ids.length === 0) return
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('telemetry_samples')
      .select('asset_id, sampled_at, helium_level')
      .in('asset_id', ids)
      .gte('sampled_at', since)
      .order('sampled_at', { ascending: true })
    if (data) {
      const map: Record<string, SparkData[]> = {}
      for (const row of data) {
        if (!map[row.asset_id]) map[row.asset_id] = []
        map[row.asset_id].push({ t: new Date(row.sampled_at).getTime(), v: row.helium_level })
      }
      setSparks(map)
    }
  }

  const sites = useMemo(() => {
    const s = new Set<string>()
    assets.forEach(a => { if (a.site?.name) s.add(a.site.name) })
    return Array.from(s).sort()
  }, [assets])

  const filtered = useMemo(() => {
    let list = [...assets]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.site?.name?.toLowerCase().includes(q) ||
        a.site?.city?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter)
    if (siteFilter !== 'all') list = list.filter(a => a.site?.name === siteFilter)
    list.sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0
      if (sortKey === 'name') { av = a.name; bv = b.name }
      else if (sortKey === 'helium') { av = a.telemetry?.helium_level ?? -1; bv = b.telemetry?.helium_level ?? -1 }
      else if (sortKey === 'status') {
        const order = { critical: 0, warning: 1, offline: 2, online: 3 }
        av = order[a.status ?? 'offline'] ?? 2
        bv = order[b.status ?? 'offline'] ?? 2
      }
      else if (sortKey === 'site') { av = a.site?.name ?? ''; bv = b.site?.name ?? '' }
      if (av < bv) return sortAsc ? -1 : 1
      if (av > bv) return sortAsc ? 1 : -1
      return 0
    })
    return list
  }, [assets, search, statusFilter, siteFilter, sortKey, sortAsc])

  const kpi = useMemo(() => {
    const online = assets.filter(a => a.status === 'online').length
    const warning = assets.filter(a => a.status === 'warning').length
    const critical = assets.filter(a => a.status === 'critical').length
    const offline = assets.filter(a => a.status === 'offline').length
    return { total: assets.length, online, warning, critical, offline }
  }, [assets])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(v => !v)
    else { setSortKey(k); setSortAsc(true) }
  }

  const SortIcon = sortAsc ? SortAsc : SortDesc

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Fleet Overview</div>
          <div className="page-subtitle">{assets.length} assets · last refreshed just now</div>
        </div>
        <button className="btn-ghost" onClick={loadAssets} style={{ fontSize: 12 }}>
          ↻ Refresh
        </button>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total Assets</div>
          <div className="kpi-value" style={{ color: 'var(--text-primary)' }}>{kpi.total}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(statusFilter === 'online' ? 'all' : 'online')}>
          <div className="kpi-label">Online</div>
          <div className="kpi-value" style={{ color: 'var(--green)' }}>{kpi.online}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(statusFilter === 'warning' ? 'all' : 'warning')}>
          <div className="kpi-label">Warning</div>
          <div className="kpi-value" style={{ color: 'var(--yellow)' }}>{kpi.warning}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(statusFilter === 'critical' ? 'all' : 'critical')}>
          <div className="kpi-label">Critical</div>
          <div className="kpi-value" style={{ color: 'var(--red)' }}>{kpi.critical}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}>
          <div className="kpi-label">Offline</div>
          <div className="kpi-value" style={{ color: 'var(--text-muted)' }}>{kpi.offline}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            placeholder="Search assets, sites…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 30, maxWidth: 240 }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
          <option value="offline">Offline</option>
        </select>
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
          <option value="all">All Sites</option>
          {sites.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {(['name','helium','status','site'] as SortKey[]).map(k => (
            <button
              key={k}
              className="btn-ghost"
              style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', color: sortKey === k ? 'var(--cyan)' : undefined, borderColor: sortKey === k ? 'var(--cyan)' : undefined }}
              onClick={() => toggleSort(k)}
            >
              {k === 'helium' ? 'He%' : k.charAt(0).toUpperCase() + k.slice(1)}
              {sortKey === k && <SortIcon size={11} />}
            </button>
          ))}
        </div>
      </div>

      {/* Asset grid */}
      {loading ? (
        <div className="empty-state">Loading assets…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <WifiOff size={40} />
          <div>No assets match your filters</div>
        </div>
      ) : (
        <div className="asset-grid">
          {filtered.map(asset => {
            const he = asset.telemetry?.helium_level ?? null
            const flow = asset.telemetry?.water_flow ?? null
            const temp = asset.telemetry?.chiller_temp ?? null
            const spark = sparks[asset.id] ?? []
            const status = asset.status ?? 'offline'
            const dotClass = status === 'online' ? 'dot-online' : status === 'warning' ? 'dot-warning' : status === 'critical' ? 'dot-offline' : 'dot-never'

            return (
              <div
                key={asset.id}
                className={`asset-card status-${status}`}
                onClick={() => navigate(`/assets/${asset.id}`)}
              >
                {/* Card header */}
                <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                        {asset.site?.name ?? 'Unassigned'} · {asset.site?.city}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{asset.name}</div>
                    </div>
                    <span className={`badge badge-${status}`}>
                      <span className={`dot ${dotClass}`} />
                      {status}
                    </span>
                  </div>
                </div>

                {/* Helium level */}
                <div style={{ padding: '12px 16px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Helium Level</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: he == null ? 'var(--text-muted)' : he < 60 ? 'var(--red)' : he < 75 ? 'var(--yellow)' : 'var(--green)' }}>
                      {he != null ? `${he.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div className="he-bar-wrap">
                    <div className="he-bar-bg" style={{ flex: 1 }}>
                      <div className={`he-bar-fill ${heClass(he)}`} style={{ width: `${Math.min(he ?? 0, 100)}%` }} />
                    </div>
                  </div>
                </div>

                {/* Sparkline */}
                {spark.length > 1 ? (
                  <div style={{ padding: '6px 8px 0', height: 56 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={spark} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
                        <Line
                          type="monotone"
                          dataKey="v"
                          stroke={he != null && he < 60 ? '#f05252' : he != null && he < 75 ? '#f0b429' : '#22d3a0'}
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Tooltip
                          contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }}
                          formatter={(v: number) => [`${v.toFixed(1)}%`, 'He Level']}
                          labelFormatter={() => ''}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ height: 56 }} />
                )}

                {/* Metrics row */}
                <div style={{ padding: '8px 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <div className="metric-chip">
                    <span className="metric-chip-label">Flow</span>
                    <span className="metric-chip-value" style={{ color: flow != null && flow < 0.6 ? 'var(--yellow)' : 'var(--text-primary)', fontSize: 13 }}>
                      {flow != null ? `${flow.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="metric-chip">
                    <span className="metric-chip-label">Chiller</span>
                    <span className="metric-chip-value" style={{ color: temp != null && temp > 75 ? 'var(--yellow)' : 'var(--text-primary)', fontSize: 13 }}>
                      {temp != null ? `${temp.toFixed(1)}°` : '—'}
                    </span>
                  </div>
                  <div className="metric-chip">
                    <span className="metric-chip-label">He Press</span>
                    <span className="metric-chip-value" style={{ fontSize: 13 }}>
                      {asset.telemetry?.he_pressure != null ? `${asset.telemetry.he_pressure.toFixed(2)}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
