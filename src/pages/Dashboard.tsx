import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { Search, SortAsc, SortDesc, WifiOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import type { Asset } from '../lib/types'
import { naturalCompare, usePersistedState, statusOrder } from '../lib/listControls'

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

interface SparkData { t: number; he: number | null; pressure: number | null }

export default function Dashboard() {
  const { selectedCompany } = useApp()
  const navigate = useNavigate()
  const [assets, setAssets] = useState<Asset[]>([])
  const [sparks, setSparks] = useState<Record<string, SparkData[]>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = usePersistedState<string>('dash.search', '')
  const [statusFilter, setStatusFilter] = usePersistedState<StatusFilter>('dash.statusFilter', 'all')
  const [siteFilter, setSiteFilter] = usePersistedState<string>('dash.siteFilter', 'all')
  const [sortKey, setSortKey] = usePersistedState<SortKey>('dash.sortKey', 'name')
  const [sortAsc, setSortAsc] = usePersistedState<boolean>('dash.sortAsc', true)

  // Live-data plumbing: poll while visible, refetch immediately on focus,
  // never overwrite the grid with an empty/offline snapshot if a single
  // fetch fails transiently.
  const inFlightRef = useRef(false)
  const [lastUpdateMs, setLastUpdateMs] = useState<number | null>(null)

  useEffect(() => {
    if (!selectedCompany) return
    loadAssets()
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') loadAssets()
    }, 20000)
    const onVisible = () => { if (document.visibilityState === 'visible') loadAssets() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [selectedCompany])

  async function loadAssets() {
    if (!selectedCompany) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)

    try {
      // One RPC = assets + sites + latest telemetry, all server-side, single round trip.
      // Uses LATERAL+LIMIT 1 internally to take the (asset_id, ts DESC) index.
      const { data, error } = await supabase.rpc('get_company_dashboard', {
        p_company_id: selectedCompany.id,
      })

      // Don't blank the grid on transient failure if we already have a snapshot.
      if (error) return
      if (!data) return

      type DashRow = {
        asset_id: string; name: string; model: string | null; serial: string | null
        magmon_ip: string | null; site_id: string | null; gateway_id: string | null
        company_id: string | null; site_name: string | null; site_city: string | null
        site_state: string | null; latest_ts: number | string | null
        helium_level: number | string | null; he_pressure: number | string | null
        water_flow: number | string | null; chiller_temp: number | string | null
        shield_temp: number | string | null
      }

      const enriched: Asset[] = (data as DashRow[]).map(row => {
        const tsNum = row.latest_ts == null
          ? null
          : (typeof row.latest_ts === 'number' ? row.latest_ts : Number(row.latest_ts))
        const num = (v: number | string | null) =>
          v == null ? null : (typeof v === 'number' ? v : Number(v))
        const asset = {
          id: row.asset_id,
          name: row.name,
          model: row.model,
          serial: row.serial,
          magmon_ip: row.magmon_ip,
          site_id: row.site_id,
          company_id: row.company_id,
          gateway_id: row.gateway_id,
          site: row.site_name ? {
            id: row.site_id ?? '',
            name: row.site_name,
            city: row.site_city,
            state: row.site_state,
            company_id: row.company_id ?? '',
          } : null,
          telemetry: tsNum != null ? {
            asset_id: row.asset_id,
            helium_level: num(row.helium_level),
            water_flow:   num(row.water_flow),
            chiller_temp: num(row.chiller_temp),
            shield_temp:  num(row.shield_temp),
            he_pressure:  num(row.he_pressure),
            compressor: null,
            cs1: null,
            coldhead_temp_k: null,
            sampled_at: tsNum as unknown as string,  // assetStatus reads it as ms-since-epoch
          } : null,
        } as Asset
        return { ...asset, status: assetStatus(asset) }
      })

      setAssets(enriched)
      setLastUpdateMs(Date.now())
      loadSparklines()
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  /**
   * Bucketed sparklines via server-side RPC. Browser receives ~60 numeric
   * points per asset over 2h instead of thousands of raw JSONB rows.
   */
  async function loadSparklines() {
    if (!selectedCompany) return
    const sinceMs = Date.now() - 2 * 60 * 60 * 1000
    const { data, error } = await supabase.rpc('get_company_sparklines', {
      p_company_id: selectedCompany.id,
      p_since_ms: sinceMs,
      p_bucket_seconds: 120,
      p_max_buckets_per_asset: 60,
    })
    if (error || !data) return
    const map: Record<string, SparkData[]> = {}
    for (const row of data as Array<{ asset_id: string; bucket_ts: number | string; helium_level: number | string | null; he_pressure: number | string | null }>) {
      const t = typeof row.bucket_ts === 'number' ? row.bucket_ts : Number(row.bucket_ts)
      const he = row.helium_level == null ? null : Number(row.helium_level)
      const pressure = row.he_pressure == null ? null : Number(row.he_pressure)
      if (!map[row.asset_id]) map[row.asset_id] = []
      map[row.asset_id].push({ t, he, pressure })
    }
    setSparks(map)
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
      let result = 0
      if (sortKey === 'name') {
        result = naturalCompare(a.name, b.name)
      } else if (sortKey === 'helium') {
        result = (a.telemetry?.helium_level ?? -1) - (b.telemetry?.helium_level ?? -1)
        if (result === 0) result = naturalCompare(a.name, b.name)
      } else if (sortKey === 'status') {
        result = statusOrder(a.status) - statusOrder(b.status)
        if (result === 0) result = naturalCompare(a.name, b.name)
      } else if (sortKey === 'site') {
        result = naturalCompare(a.site?.name ?? '', b.site?.name ?? '')
        if (result === 0) result = naturalCompare(a.name, b.name)
      }
      return sortAsc ? result : -result
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
      <div className="page-header">
        <div>
          <div className="page-title">Fleet Overview</div>
          <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>{assets.length} assets</span>
            {lastUpdateMs && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  color: (Date.now() - lastUpdateMs) < 90_000 ? 'var(--green)' : 'var(--yellow)',
                }}>
                  <span className={(Date.now() - lastUpdateMs) < 90_000 ? 'dot dot-online' : 'dot dot-warning'} />
                  {(Date.now() - lastUpdateMs) < 5_000 ? 'live' : `updated ${Math.floor((Date.now() - lastUpdateMs) / 1000)}s ago`}
                </span>
              </>
            )}
          </div>
        </div>
        <button className="btn-ghost" onClick={loadAssets} style={{ fontSize: 12 }} disabled={loading}>
          {loading ? '⟳ Refreshing…' : '↻ Refresh'}
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
          <input placeholder="Search assets, sites…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, maxWidth: 240 }} />
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

      {/* Asset grid — only show "Loading" on first paint; subsequent refreshes update in place */}
      {loading && assets.length === 0 ? (
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
              <div key={asset.id} className={`asset-card status-${status}`} onClick={() => navigate(`/assets/${asset.id}`)}>
                <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                        {asset.site?.name ?? 'Unassigned'}{asset.site?.city ? ` · ${asset.site.city}` : ''}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{asset.name}</div>
                    </div>
                    <span className={`badge badge-${status}`}>
                      <span className={`dot ${dotClass}`} />
                      {status}
                    </span>
                  </div>
                </div>

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

                {spark.length > 1 ? (
                  <div style={{ padding: '6px 8px 0', height: 56 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={spark} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
                        <YAxis yAxisId="he" hide domain={['auto', 'auto']} />
                        <YAxis yAxisId="pressure" hide domain={['auto', 'auto']} />
                        <Line
                          yAxisId="he"
                          name="He Level"
                          type="monotone"
                          dataKey="he"
                          stroke={he != null && he < 60 ? '#f05252' : he != null && he < 75 ? '#f0b429' : '#22d3a0'}
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                          connectNulls
                        />
                        <Line
                          yAxisId="pressure"
                          name="He Press"
                          type="monotone"
                          dataKey="pressure"
                          stroke="#00c8dc"
                          strokeWidth={1.2}
                          strokeDasharray="3 3"
                          dot={false}
                          isAnimationActive={false}
                          connectNulls
                        />
                        <Tooltip
                          contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }}
                          formatter={(value: number, name: string) => {
                            if (name === 'He Level') return [`${value.toFixed(1)}%`, name]
                            if (name === 'He Press') return [value.toFixed(2), name]
                            return [value, name]
                          }}
                          labelFormatter={() => ''}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div style={{ height: 56 }} />}

                <div style={{ padding: '8px 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <div className="metric-chip">
                    <span className="metric-chip-label">Flow</span>
                    <span className="metric-chip-value" style={{ color: flow != null && flow < 0.6 ? 'var(--yellow)' : 'var(--text-primary)', fontSize: 13 }}>{flow != null ? flow.toFixed(2) : '—'}</span>
                  </div>
                  <div className="metric-chip">
                    <span className="metric-chip-label">Chiller</span>
                    <span className="metric-chip-value" style={{ color: temp != null && temp > 75 ? 'var(--yellow)' : 'var(--text-primary)', fontSize: 13 }}>{temp != null ? `${temp.toFixed(1)}°` : '—'}</span>
                  </div>
                  <div className="metric-chip">
                    <span className="metric-chip-label">He Press</span>
                    <span className="metric-chip-value" style={{ fontSize: 13 }}>{asset.telemetry?.he_pressure != null ? asset.telemetry.he_pressure.toFixed(2) : '—'}</span>
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
