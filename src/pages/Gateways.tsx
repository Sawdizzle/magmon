import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import { ArrowUpDown, Search, Plus, X, Copy, Check } from 'lucide-react'
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

interface SiteOption { id: string; name: string }

interface CreatedGateway {
  gateway_id: string
  hostname: string
  site_id: string
  company_id: string
  token: string
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
  const [siteOpts, setSiteOpts] = useState<SiteOption[]>([])
  const [loading, setLoading] = useState(true)

  // Create-gateway state
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<{ hostname: string; site_id: string; kind: 'pi' | 'pc'; ip_address: string }>({
    hostname: '', site_id: '', kind: 'pi', ip_address: ''
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedGateway | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)

  // Persisted filter/sort prefs
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
      // 'kind' is the real column ('pi' | 'pc'); alias it to 'type' for the render code.
      // 'status' is NOT a real column — it's computed client-side from last_heartbeat via gwStatus().
      .select('id, hostname, type:kind, last_heartbeat, site_id')
      .eq('company_id', selectedCompany.id)
    const { data: assets } = await supabase
      .from('assets')
      .select('gateway_id, site_id')
      .eq('company_id', selectedCompany.id)
    const { data: sites } = await supabase
      .from('sites')
      .select('id, name')
      .eq('company_id', selectedCompany.id)
      .order('name')
    if (sites) setSiteOpts(sites as SiteOption[])
    if (gws) {
      const siteMap: Record<string, string> = {}
      sites?.forEach((s: { id: string; name: string }) => { siteMap[s.id] = s.name })
      const assetCountMap: Record<string, number> = {}
      assets?.forEach((a: { gateway_id: string | null }) => {
        if (a.gateway_id) assetCountMap[a.gateway_id] = (assetCountMap[a.gateway_id] || 0) + 1
      })
      setGateways(gws.map((g: { id: string; hostname: string | null; type: string | null; last_heartbeat: number | null; site_id: string | null }) => ({
        ...g,
        status: gwStatus(g),
        site_name: g.site_id ? siteMap[g.site_id] ?? null : null,
        asset_count: assetCountMap[g.id] ?? 0
      })))
    }
    setLoading(false)
  }

  async function handleCreate() {
    if (!selectedCompany) return
    setCreateError(null)
    if (!form.hostname.trim()) { setCreateError('Hostname is required'); return }
    if (!form.site_id) { setCreateError('Pick a site'); return }

    setCreating(true)
    const { data, error } = await supabase.rpc('admin_create_gateway', {
      p_company_id: selectedCompany.id,
      p_site_id: form.site_id,
      p_hostname: form.hostname.trim(),
      p_kind: form.kind,
      p_ip_address: form.ip_address.trim(),
      p_offline_timeout_sec: 120,
    })
    setCreating(false)

    if (error) {
      setCreateError(error.message)
      return
    }
    // RPC returns a table, supabase-js returns it as an array
    const row = Array.isArray(data) ? data[0] : data
    if (row) {
      setCreated(row as CreatedGateway)
      setAdding(false)
      setForm({ hostname: '', site_id: '', kind: 'pi', ip_address: '' })
      load()  // refresh list
    }
  }

  async function copyToken() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.token)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 1500)
    } catch {
      /* clipboard unavailable, just leave token visible */
    }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(v => !v)
    else { setSortKey(k); setSortAsc(true) }
  }

  // Distinct sites that appear in this gateway list, for the filter dropdown
  const siteFilterOpts = useMemo(() => {
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={load} style={{ fontSize: 12 }}>↻ Refresh</button>
          <button
            className="btn-primary"
            onClick={() => { setAdding(v => !v); setCreateError(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <Plus size={14} /> New Gateway
          </button>
        </div>
      </div>

      {/* Token banner — appears after a successful create. Persists until user dismisses. */}
      {created && (
        <div className="card" style={{ borderColor: 'var(--green)', background: 'rgba(52,211,153,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>
                Gateway created: {created.hostname}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Copy this token now — it's the only time you'll see it. Configure your gateway agent to authenticate with it.
              </div>
              <div style={{
                fontFamily: 'monospace', fontSize: 12,
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                padding: '8px 12px',
                borderRadius: 'var(--radius)',
                wordBreak: 'break-all',
              }}>
                {created.token}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Gateway ID: <span style={{ fontFamily: 'monospace' }}>{created.gateway_id}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn-ghost" onClick={copyToken} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                {tokenCopied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
              </button>
              <button className="btn-ghost" onClick={() => setCreated(null)} style={{ padding: 6 }} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New-gateway form */}
      {adding && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>New Gateway</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div className="form-group">
              <label>Hostname *</label>
              <input
                value={form.hostname}
                onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))}
                placeholder="e.g. nm1042-pi"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Site *</label>
              <select value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
                <option value="">— pick a site —</option>
                {siteOpts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Kind</label>
              <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as 'pi' | 'pc' }))}>
                <option value="pi">Raspberry Pi</option>
                <option value="pc">PC</option>
              </select>
            </div>
            <div className="form-group">
              <label>IP address (optional)</label>
              <input
                value={form.ip_address}
                onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))}
                placeholder="192.168.x.x"
              />
            </div>
          </div>
          {createError && (
            <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{createError}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Gateway'}
            </button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setCreateError(null) }}>Cancel</button>
          </div>
        </div>
      )}

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
          {siteFilterOpts.map(s => <option key={s} value={s}>{s}</option>)}
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
            {loading && gateways.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                {gateways.length === 0 ? 'No gateways yet — click "+ New Gateway" to register one' : 'No gateways match your filters'}
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
