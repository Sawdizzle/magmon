import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { ChevronLeft, Edit2, Save, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Asset, Site } from '../lib/types'

interface TelRow {
  ts: number
  helium_level: number | null
  water_flow: number | null
  chiller_temp: number | null
  he_pressure: number | null
  shield_temp: number | null
  compressor: number | null
  cs1: number | null
  coldhead_temp_k: number | null
}

interface LatestSnapshot {
  ts: number | null
  helium_level: number | null
  water_flow: number | null
  chiller_temp: number | null
  he_pressure: number | null
  shield_temp: number | null
  compressor: number | null
  cs1: number | null
  coldhead_temp_k: number | null
}

const HISTORY_RANGES_HOURS = [24, 24 * 7, 24 * 30] as const

function pickNum(v: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!v) return null
  for (const k of keys) {
    const val = v[k]
    if (typeof val === 'number') return val
  }
  return null
}

function formatRelative(ts: number | null): string {
  if (ts == null) return 'Never reported'
  const ago = Date.now() - ts
  if (ago < 60_000) return 'just now'
  if (ago < 3_600_000) return `${Math.floor(ago / 60_000)}m ago`
  if (ago < 86_400_000) return `${Math.floor(ago / 3_600_000)}h ago`
  return `${Math.floor(ago / 86_400_000)}d ago`
}

function freshnessTone(ts: number | null): string {
  if (ts == null) return 'var(--text-muted)'
  const ago = Date.now() - ts
  if (ago < 5 * 60_000) return 'var(--green)'
  if (ago < 60 * 60_000) return 'var(--yellow)'
  return 'var(--red)'
}

function rangeLabel(hours: number): string {
  if (hours <= 24) return '24-hour'
  if (hours <= 24 * 7) return '7-day'
  return '30-day'
}

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [latest, setLatest] = useState<LatestSnapshot | null>(null)
  const [telemetry, setTelemetry] = useState<TelRow[]>([])
  const [historyHours, setHistoryHours] = useState<number>(24)
  const [sites, setSites] = useState<Site[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Asset>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    loadAll()
  }, [id])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadAsset(), loadLatest(), loadHistory(), loadSites()])
    setLoading(false)
  }

  async function loadAsset() {
    const { data } = await supabase
      .from('assets')
      .select('*, site:sites(*)')
      .eq('id', id)
      .single()
    if (data) {
      setAsset(data)
      setForm({ name: data.name, serial: data.serial, model: data.model, site_id: data.site_id, magmon_ip: data.magmon_ip })
    }
  }

  /** Always pull the most recent sample regardless of age, so the metric
   * cards show real values (with a freshness badge) even for stale assets. */
  async function loadLatest() {
    if (!id) return
    const { data } = await supabase
      .from('telemetry_samples')
      .select('ts, values')
      .eq('asset_id', id)
      .order('ts', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      const v = (data as { ts: number | string; values: Record<string, unknown> | null }).values
      const tsNum = typeof data.ts === 'number' ? data.ts : Number(data.ts)
      setLatest({
        ts: tsNum,
        helium_level:    pickNum(v, 'helium_level', 'he_level', 'helium_level_pct'),
        water_flow:      pickNum(v, 'flow', 'water_flow', 'compressor_helium_flow_g_min'),
        chiller_temp:    pickNum(v, 'chiller_temp', 'room_temp_c'),
        he_pressure:     pickNum(v, 'he_pressure', 'magnet_pressure_mbar'),
        shield_temp:     pickNum(v, 'shield_temp', 'shield_temp_k', 'shield'),
        compressor:      pickNum(v, 'compressor', 'compressor_pressure_psi'),
        cs1:             pickNum(v, 'cs1'),
        coldhead_temp_k: pickNum(v, 'coldhead_temp_k'),
      })
    } else {
      setLatest(null)
    }
  }

  /** Bucketed history via server-side RPC. Tries 24h → 7d → 30d, stopping at
   * the first window that has any data. */
  async function loadHistory() {
    if (!id) return
    for (const hours of HISTORY_RANGES_HOURS) {
      const sinceMs = Date.now() - hours * 60 * 60 * 1000
      // Keep buckets to ~300 points: 5min for 24h, 30min for 7d, 2h for 30d
      const bucketSecs = hours <= 24 ? 300 : hours <= 24 * 7 ? 1800 : 7200
      const { data, error } = await supabase.rpc('get_asset_telemetry_buckets', {
        p_asset_id: id,
        p_since_ms: sinceMs,
        p_bucket_seconds: bucketSecs,
        p_max_buckets: 500,
      })
      if (error) continue
      if (data && data.length > 0) {
        const rows: TelRow[] = (data as Array<{
          bucket_ts:       number | string
          helium_level:    number | string | null
          he_pressure:     number | string | null
          water_flow:      number | string | null
          chiller_temp:    number | string | null
          shield_temp:     number | string | null
          compressor:      number | string | null
          cs1:             number | string | null
          coldhead_temp_k: number | string | null
        }>).map(row => ({
          ts:              typeof row.bucket_ts === 'number' ? row.bucket_ts : Number(row.bucket_ts),
          helium_level:    row.helium_level    == null ? null : Number(row.helium_level),
          water_flow:      row.water_flow      == null ? null : Number(row.water_flow),
          chiller_temp:    row.chiller_temp    == null ? null : Number(row.chiller_temp),
          he_pressure:     row.he_pressure     == null ? null : Number(row.he_pressure),
          shield_temp:     row.shield_temp     == null ? null : Number(row.shield_temp),
          compressor:      row.compressor      == null ? null : Number(row.compressor),
          cs1:             row.cs1             == null ? null : Number(row.cs1),
          coldhead_temp_k: row.coldhead_temp_k == null ? null : Number(row.coldhead_temp_k),
        }))
        setTelemetry(rows)
        setHistoryHours(hours)
        return
      }
    }
    setTelemetry([])
    setHistoryHours(24)
  }

  async function loadSites() {
    const { data } = await supabase.from('sites').select('id, name, city, state, company_id').order('name')
    if (data) setSites(data)
  }

  async function handleSave() {
    if (!id) return
    setSaving(true)
    await supabase.from('assets').update({
      name: form.name,
      serial: form.serial,
      model: form.model,
      site_id: form.site_id,
      magmon_ip: form.magmon_ip
    }).eq('id', id)
    await loadAsset()
    setEditing(false)
    setSaving(false)
  }

  const chartData = telemetry.map(t => ({
    time: new Date(t.ts).toLocaleString([], historyHours > 24
      ? { month: 'short', day: 'numeric', hour: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' }),
    'He Level':  t.helium_level,
    'Flow':      t.water_flow,
    'Chiller':   t.chiller_temp,
    'He Press':  t.he_pressure,
    'Shield':    t.shield_temp,
    'Compressor': t.compressor,
    'Cold Head': t.coldhead_temp_k,
    'CS1':       t.cs1,
  }))

  if (loading) return <div className="empty-state">Loading…</div>
  if (!asset) return <div className="empty-state">Asset not found</div>

  return (
    <div className="page">
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }} onClick={() => navigate('/')}>
          <ChevronLeft size={15} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <div className="page-title">{asset.name}</div>
          <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>
              {asset.site?.name ?? 'Unassigned'}
              {asset.site?.city ? ` · ${asset.site.city}` : ''}
              {asset.site?.state ? `, ${asset.site.state}` : ''}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: freshnessTone(latest?.ts ?? null), fontWeight: 600 }}>
              {latest?.ts ? `Last seen ${formatRelative(latest.ts)}` : 'Never reported'}
            </span>
          </div>
        </div>
        {!editing ? (
          <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEditing(true)}>
            <Edit2 size={13} /> Edit Asset
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleSave} disabled={saving}>
              <Save size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-ghost" onClick={() => setEditing(false)}><X size={13} /></button>
          </div>
        )}
      </div>

      <div className="asset-detail-grid">
        {/* Left: chart + metrics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. Combined chart — all metrics overlaid. Auto-widens 24h -> 7d -> 30d. */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{rangeLabel(historyHours)} Telemetry History (all metrics)</div>
              {chartData.length > 1 && historyHours > 24 && (
                <div style={{ fontSize: 11, color: 'var(--yellow)' }}>
                  No data in last 24 hours — showing {rangeLabel(historyHours).toLowerCase()} window
                </div>
              )}
            </div>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,220,0.08)" />
                  <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="He Level"   stroke="#22d3a0" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="He Press"   stroke="#f05252" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="Flow"       stroke="#00c8dc" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="Chiller"    stroke="#f0b429" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="Shield"     stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="Compressor" stroke="#fb923c" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="Cold Head"  stroke="#67e8f9" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="CS1"        stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 40 }}>
                {latest?.ts
                  ? `Latest sample is from ${formatRelative(latest.ts)} — no data in the last 30 days`
                  : 'This asset has never reported telemetry'}
              </div>
            )}
          </div>

          {/* 2. Latest values — fixed 4-column grid (8 metrics → 4×2 layout). */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { label: 'Helium Level', val: latest?.helium_level ?? null,    unit: '%',    decimals: 1, warn: (v: number) => v < 60,  caution: (v: number) => v < 75 },
              { label: 'He Pressure',  val: latest?.he_pressure ?? null,     unit: 'mbar', decimals: 2, warn: (v: number) => v > 3,   caution: () => false },
              { label: 'Water Flow',   val: latest?.water_flow ?? null,      unit: 'L/min',decimals: 2, warn: (v: number) => v < 0.6, caution: () => false },
              { label: 'Chiller Temp', val: latest?.chiller_temp ?? null,    unit: '°C',   decimals: 1, warn: (v: number) => v > 75,  caution: () => false },
              { label: 'Shield Temp',  val: latest?.shield_temp ?? null,     unit: 'K',    decimals: 1, warn: () => false,            caution: () => false },
              { label: 'Compressor',   val: latest?.compressor ?? null,      unit: 'PSI',  decimals: 0, warn: () => false,            caution: () => false },
              { label: 'Cold Head',    val: latest?.coldhead_temp_k ?? null, unit: 'K',    decimals: 1, warn: () => false,            caution: () => false },
              { label: 'CS1',          val: latest?.cs1 ?? null,             unit: '',     decimals: 2, warn: () => false,            caution: () => false },
            ].map(m => {
              const color = m.val == null ? 'var(--text-muted)' : m.warn(m.val) ? 'var(--red)' : m.caution(m.val) ? 'var(--yellow)' : 'var(--green)'
              return (
                <div key={m.label} className="card">
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{m.val != null ? m.val.toFixed(m.decimals) : '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.unit || ' '}</div>
                </div>
              )
            })}
          </div>

          {/* Per-metric trends — one chart per measurable on its own y-axis,
              so trends within each metric are easy to read regardless of the
              other metrics' scales. */}
          {chartData.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              {([
                { key: 'He Level',   label: 'Helium Level', unit: '%',     color: '#22d3a0', precision: 1 },
                { key: 'He Press',   label: 'He Pressure',  unit: 'mbar',  color: '#f05252', precision: 2 },
                { key: 'Flow',       label: 'Water Flow',   unit: 'L/min', color: '#00c8dc', precision: 2 },
                { key: 'Chiller',    label: 'Chiller Temp', unit: '°C',    color: '#f0b429', precision: 1 },
                { key: 'Shield',     label: 'Shield Temp',  unit: 'K',     color: '#a78bfa', precision: 1 },
                { key: 'Compressor', label: 'Compressor',   unit: 'PSI',   color: '#fb923c', precision: 0 },
                { key: 'Cold Head',  label: 'Cold Head',    unit: 'K',     color: '#67e8f9', precision: 1 },
                { key: 'CS1',        label: 'CS1',          unit: '',      color: '#94a3b8', precision: 2 },
              ] as Array<{ key: keyof typeof chartData[0]; label: string; unit: string; color: string; precision: number }>).map(m => {
                // Filter to a slim {time, v} payload — keeps the chart isolated to its own metric.
                const series = chartData.map(c => ({ time: c.time, v: c[m.key] }))
                const hasData = series.some(p => p.v != null)
                if (!hasData) return null
                return (
                  <div key={m.key} className="card" style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.unit}</div>
                    </div>
                    <ResponsiveContainer width="100%" height={130}>
                      <LineChart data={series} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,220,0.06)" />
                        <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={42} />
                        <Tooltip
                          contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }}
                          formatter={(value: number) => [`${value.toFixed(m.precision)} ${m.unit}`, m.label]}
                        />
                        <Line type="monotone" dataKey="v" stroke={m.color} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: asset info / edit */}
        <div className="card" style={{ height: 'fit-content' }}>
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>Asset Information</div>
          {editing ? (
            <div>
              <div className="form-group">
                <label>Asset Name</label>
                <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Model</label>
                <input value={form.model ?? ''} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Serial</label>
                <input value={form.serial ?? ''} onChange={e => setForm(f => ({ ...f, serial: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>MagMon IP</label>
                <input value={form.magmon_ip ?? ''} onChange={e => setForm(f => ({ ...f, magmon_ip: e.target.value }))} placeholder="192.168.x.x" />
              </div>
              <div className="form-group">
                <label>Site</label>
                <select value={form.site_id ?? ''} onChange={e => setForm(f => ({ ...f, site_id: e.target.value || null }))}>
                  <option value="">— Unassigned —</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Asset ID', val: asset.id },
                { label: 'Name', val: asset.name },
                { label: 'Model', val: asset.model },
                { label: 'Serial', val: asset.serial },
                { label: 'MagMon IP', val: asset.magmon_ip },
                { label: 'Site', val: asset.site ? `${asset.site.name}${asset.site.city ? ` — ${asset.site.city}` : ''}` : '—' },
                { label: 'Company', val: asset.company_id },
              ].map(row => (
                <div key={row.label}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{row.label}</div>
                  <div style={{ fontSize: 13, wordBreak: 'break-all' }}>{row.val ?? '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
