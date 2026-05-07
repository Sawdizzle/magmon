import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { ChevronLeft, Edit2, Save, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Asset, Site } from '../lib/types'

interface TelRow {
  sampled_at: string
  helium_level: number | null
  water_flow: number | null
  chiller_temp: number | null
  he_pressure: number | null
  shield_temp: number | null
}

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [telemetry, setTelemetry] = useState<TelRow[]>([])
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
    await Promise.all([loadAsset(), loadTelemetry(), loadSites()])
    setLoading(false)
  }

  async function loadAsset() {
    const { data } = await supabase
      .from('assets')
      .select('*, site:sites(*)')
      .eq('id', id)
      .single()
    if (data) { setAsset(data); setForm({ name: data.name, serial: data.serial, model: data.model, site_id: data.site_id, magmon_ip: data.magmon_ip }) }
  }

  async function loadTelemetry() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('telemetry_samples')
      .select('sampled_at, helium_level, water_flow, chiller_temp, he_pressure, shield_temp')
      .eq('asset_id', id)
      .gte('sampled_at', since)
      .order('sampled_at', { ascending: true })
    if (data) setTelemetry(data)
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
    time: new Date(t.sampled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    'He Level': t.helium_level,
    'Flow': t.water_flow,
    'Chiller': t.chiller_temp,
    'He Press': t.he_pressure,
  }))

  if (loading) return <div className="empty-state">Loading…</div>
  if (!asset) return <div className="empty-state">Asset not found</div>

  const latest = telemetry[telemetry.length - 1]

  return (
    <div className="page">
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }} onClick={() => navigate('/')}>
          <ChevronLeft size={15} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <div className="page-title">{asset.name}</div>
          <div className="page-subtitle">{asset.site?.name} · {asset.site?.city}, {asset.site?.state}</div>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18 }}>
        {/* Left: chart + metrics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Latest metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { label: 'Helium Level', val: latest?.helium_level, unit: '%', warn: (v: number) => v < 60, caution: (v: number) => v < 75 },
              { label: 'Water Flow', val: latest?.water_flow, unit: 'L/min', warn: (v: number) => v < 0.6, caution: () => false },
              { label: 'Chiller Temp', val: latest?.chiller_temp, unit: '°C', warn: (v: number) => v > 75, caution: () => false },
              { label: 'He Pressure', val: latest?.he_pressure, unit: 'mbar', warn: (v: number) => v > 3, caution: () => false },
            ].map(m => {
              const color = m.val == null ? 'var(--text-muted)' : m.warn(m.val) ? 'var(--red)' : m.caution(m.val) ? 'var(--yellow)' : 'var(--green)'
              return (
                <div key={m.label} className="card">
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color }}>{m.val != null ? m.val.toFixed(m.unit === '%' || m.unit === 'mbar' ? 1 : 2) : '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.unit}</div>
                </div>
              )
            })}
          </div>

          {/* Chart */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>24-Hour Telemetry History</div>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,220,0.08)" />
                  <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="He Level" stroke="#22d3a0" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="Flow" stroke="#00c8dc" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="Chiller" stroke="#f0b429" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="He Press" stroke="#f05252" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 40 }}>No telemetry data for the past 24 hours</div>
            )}
          </div>
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
