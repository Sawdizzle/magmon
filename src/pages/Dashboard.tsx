import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { Search, SortAsc, SortDesc, WifiOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import type { Asset } from '../lib/types'
import { naturalCompare, usePersistedState, statusOrder } from '../lib/listControls'

type SortKey = 'name' | 'helium' | 'status' | 'site'
// 'reporting'        = any asset with fresh telemetry (online/warning/critical combined).
// 'recently_offline' = currently offline but had telemetry in the last 24h (i.e. just dropped).
// 'online'           = reserved if you ever want "online and healthy" back as a filter.
type StatusFilter = 'all' | 'reporting' | 'online' | 'offline' | 'warning' | 'critical' | 'recently_offline'

// An asset that was reporting within the last 24h but is now stale/offline.
const RECENTLY_OFFLINE_WINDOW_MS = 24 * 60 * 60 * 1000
function isRecentlyOffline(a: Asset): boolean {
  if (a.status !== 'offline') return false
  const ts = a.telemetry?.sampled_at
  if (!ts) return false  // never reported doesn't count as "recently" dropped
  const sampled = typeof ts === 'number' ? ts : new Date(ts as unknown as string).getTime()
  if (!Number.isFinite(sampled)) return false
  return (Date.now() - sampled) < RECENTLY_OFFLINE_WINDOW_MS
}

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
        shield_temp: number | string | null; compressor: number | string | null
        cs1: number | string | null; coldhead_temp_k: number | string | null
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
            helium_level:    num(row.helium_level),
            water_flow:      num(row.water_flow),
            chiller_temp:    num(row.chiller_temp),
            shield_temp:     num(row.shield_temp),
            he_pressure:     num(row.he_pressure),
            compressor:      num(row.compressor),
            cs1:             num(row.cs1),
            coldhead_temp_k: num(row.coldhead_temp_k),
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
    if (statusFilter === 'reporting') {
      // Any alive gateway: online OR warning OR critical (i.e. not offline)
      list = list.filter(a => a.status !== 'offline')
    } else if (statusFilter === 'recently_offline') {
      list = list.filter(isRecentlyOffline)
    } else if (statusFilter !== 'all') {
      list = list.filter(a => a.status === statusFilter)
    }
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
    // "Online" KPI counts any reporting gateway (online + warning + critical),
    // matching the user's mental model of "machines on and reporting".
    // Warning/Critical are sub-categories so their counts overlap with Online.
    // "Recently Offline" is also a sub-category of Offline (just-dropped assets).
    const reporting        = assets.filter(a => a.status !== 'offline').length
    const warning          = assets.filter(a => a.status === 'warning').length
    const critical         = assets.filter(a => a.status === 'critical').length
    const offline          = assets.filter(a => a.status === 'offline').length
    const recentlyOffline  = assets.filter(isRecentlyOffline).length
    return { total: assets.length, reporting, warning, critical, offline, recentlyOffline }
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

      {/* KPI row — every tile is a filter. Click a tile to scope the grid below; click again
          (or click Total Assets) to clear. The active tile gets a colored border + glow. */}
      <div className="kpi-grid">
        {([
          { key: 'all',              label: 'Total Assets',     color: 'var(--text-primary)', count: kpi.total },
          { key: 'reporting',        label: 'Online',           color: 'var(--green)',        count: kpi.reporting },
          { key: 'warning',          label: 'Warning',          color: 'var(--yellow)',       count: kpi.warning },
          { key: 'critical',         label: 'Critical',         color: 'var(--red)',          count: kpi.critical },
          { key: 'recently_offline', label: 'Recently Offline', color: 'var(--orange)',       count: kpi.recentlyOffline },
          { key: 'offline',          label: 'Offline',          color: 'var(--text-muted)',   count: kpi.offline },
        ] as Array<{ key: StatusFilter; label: string; color: string; count: number }>).map(tile => {
          const active = statusFilter === tile.key
          return (
            <div
              key={tile.key}
              className="kpi-card"
              role="button"
              tabIndex={0}
              onClick={() => setStatusFilter(active ? 'all' : tile.key)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter(active ? 'all' : tile.key) } }}
              style={{
                cursor: 'pointer',
                borderColor: active ? tile.color : undefined,
                boxShadow: active ? `0 0 0 1px ${tile.color}, 0 0 14px -4px ${tile.color}` : undefined,
                transition: 'border-color 0.12s, box-shadow 0.12s',
              }}
            >
              <div className="kpi-label" style={{ color: active ? tile.color : undefined }}>{tile.label}</div>
              <div className="kpi-value" style={{ color: tile.color }}>{tile.count}</div>
            </div>
          )
        })}
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input placeholder="Search assets, sites…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, maxWidth: 240 }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">All Status</option>
          <option value="reporting">Online (any reporting)</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
          <option value="recently_offline">Recently Offline (last 24h)</option>
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
            const tel = asset.telemetry
            const he       = tel?.helium_level ?? null
            const press    = tel?.he_pressure ?? null
            const flow     = tel?.water_flow ?? null
            const chiller  = tel?.chiller_temp ?? null
            const shield   = tel?.shield_temp ?? null
            const compr    = tel?.compressor ?? null
            const coldhead = tel?.coldhead_temp_k ?? null
            const spark = sparks[asset.id] ?? []
            const status = asset.status ?? 'offline'
            const dotClass = status === 'online' ? 'dot-online' : status === 'warning' ? 'dot-warning' : status === 'critical' ? 'dot-offline' : 'dot-never'

            const heLineColor = he != null && he < 60 ? '#f05252' : he != null && he < 75 ? '#f0b429' : '#22d3a0'
            const heValueColor = he == null ? 'var(--text-muted)' : he < 60 ? 'var(--red)' : he < 75 ? 'var(--yellow)' : 'var(--green)'
            const hasHeSpark    = spark.some(p => p.he != null)
            const hasPressSpark = spark.some(p => p.pressure != null)

            return (
              <div key={asset.id} className={`asset-card status-${status}`} onClick={() => navigate(`/assets/${asset.id}`)}>
                {/* Header */}
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

                {/* KPI 1 — Helium Level: value + bar + own sparkline */}
                <div style={{ padding: '12px 16px 6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Helium Level</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: heValueColor }}>
                      {he != null ? `${he.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div className="he-bar-wrap">
                    <div className="he-bar-bg" style={{ flex: 1 }}>
                      <div className={`he-bar-fill ${heClass(he)}`} style={{ width: `${Math.min(he ?? 0, 100)}%` }} />
                    </div>
                  </div>
                  <div style={{ height: 28, marginTop: 6 }}>
                    {hasHeSpark && spark.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={spark.map(p => ({ t: p.t, v: p.he }))}
                          margin={{ top: 2, bottom: 2, left: 0, right: 0 }}
                        >
                          <YAxis hide domain={['auto', 'auto']} />
                          <Line type="monotone" dataKey="v" name="He Level" stroke={heLineColor} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                          <Tooltip
                            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }}
                            formatter={(value: number) => [`${value.toFixed(1)}%`, 'He Level']}
                            labelFormatter={() => ''}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : null}
                  </div>
                </div>

                {/* KPI 2 — He Pressure: value + own sparkline */}
                <div style={{ padding: '6px 16px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>He Pressure</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: press == null ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {press != null ? press.toFixed(2) : '—'}
                    </span>
                  </div>
                  <div style={{ height: 28 }}>
                    {hasPressSpark && spark.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={spark.map(p => ({ t: p.t, v: p.pressure }))}
                          margin={{ top: 2, bottom: 2, left: 0, right: 0 }}
                        >
                          <YAxis hide domain={['auto', 'auto']} />
                          <Line type="monotone" dataKey="v" name="He Press" stroke="#00c8dc" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                          <Tooltip
                            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }}
                            formatter={(value: number) => [value.toFixed(2), 'He Press']}
                            labelFormatter={() => ''}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : null}
                  </div>
                </div>

                {/* Quick view — secondary measurables */}
                <div style={{ padding: '10px 16px 14px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
                  <div className="metric-chip">
                    <span className="metric-chip-label">Flow</span>
                    <span className="metric-chip-value" style={{ color: flow != null && flow < 0.6 ? 'var(--yellow)' : 'var(--text-primary)', fontSize: 12 }}>{flow != null ? flow.toFixed(2) : '—'}</span>
                  </div>
                  <div className="metric-chip">
                    <span className="metric-chip-label">Chiller</span>
                    <span className="metric-chip-value" style={{ color: chiller != null && chiller > 75 ? 'var(--yellow)' : 'var(--text-primary)', fontSize: 12 }}>{chiller != null ? `${chiller.toFixed(1)}°` : '—'}</span>
                  </div>
                  <div className="metric-chip">
                    <span className="metric-chip-label">Shield</span>
                    <span className="metric-chip-value" style={{ fontSize: 12 }}>{shield != null ? `${shield.toFixed(1)}K` : '—'}</span>
                  </div>
                  <div className="metric-chip">
                    <span className="metric-chip-label">Compr</span>
                    <span className="metric-chip-value" style={{ fontSize: 12 }}>{compr != null ? compr.toFixed(0) : '—'}</span>
                  </div>
                  <div className="metric-chip">
                    <span className="metric-chip-label">ColdHd</span>
                    <span className="metric-chip-value" style={{ fontSize: 12 }}>{coldhead != null ? `${coldhead.toFixed(1)}K` : '—'}</span>
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
