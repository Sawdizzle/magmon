import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import MagmonLogo from '../components/MagmonLogo'
import { useNavigate } from 'react-router-dom'

const PUBLIC_COMPANY = 'demo-medical-imaging'

function assetStatus(tel: any): 'online' | 'offline' | 'warning' | 'critical' {
  if (!tel?.ts) return 'offline'
  const age = Date.now() - new Date(tel.ts).getTime()
  if (age > 5 * 60 * 1000) return 'offline'
  const he = tel.helium_level ?? null
  const flow = tel.flow ?? null
  if (he != null && he < 60) return 'critical'
  if ((he != null && he < 75) || (flow != null && flow < 0.6)) return 'warning'
  return 'online'
}

export default function PublicDashboard() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: assetData } = await supabase
      .from('assets')
      .select('id, name, site:sites(name, city)')
      .eq('company_id', PUBLIC_COMPANY)
      .order('name')

    if (!assetData) { setLoading(false); return }
    const ids = assetData.map((a: any) => a.id)

    const { data: telData } = await supabase
      .from('v_asset_latest_normalized')
      .select('asset_id, helium_level, flow, chiller_temp, he_pressure, ts')
      .in('asset_id', ids)

    const telMap: Record<string, any> = {}
    telData?.forEach((t: any) => { telMap[t.asset_id] = t })

    setAssets(assetData.map((a: any) => ({
      ...a,
      site: Array.isArray(a.site) ? a.site[0] ?? null : a.site,
      tel: telMap[a.id] ?? null,
      status: assetStatus(telMap[a.id] ?? null),
    })))
    setLoading(false)
  }

  const kpi = useMemo(() => ({
    total: assets.length,
    online: assets.filter(a => a.status === 'online').length,
    warning: assets.filter(a => a.status === 'warning').length,
    offline: assets.filter(a => a.status === 'offline' || a.status === 'critical').length,
  }), [assets])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', backgroundImage: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(0,200,220,0.05) 0%, transparent 70%)' }}>
      {/* Top bar */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MagmonLogo size={28} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>Mag<span style={{ color: 'var(--cyan)' }}>Mon</span></span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>Demo Medical Imaging — Public View</span>
        </div>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => navigate('/login')}>
          Sign In
        </button>
      </div>

      <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Fleet Overview</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Live read-only view · refreshes every 30s</div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card"><div className="kpi-label">Total Assets</div><div className="kpi-value">{kpi.total}</div></div>
          <div className="kpi-card"><div className="kpi-label">Online</div><div className="kpi-value" style={{ color: 'var(--green)' }}>{kpi.online}</div></div>
          <div className="kpi-card"><div className="kpi-label">Warning</div><div className="kpi-value" style={{ color: 'var(--yellow)' }}>{kpi.warning}</div></div>
          <div className="kpi-card"><div className="kpi-label">Offline</div><div className="kpi-value" style={{ color: 'var(--text-muted)' }}>{kpi.offline}</div></div>
        </div>

        {loading ? <div className="empty-state">Loading…</div> : assets.length === 0 ? (
          <div className="empty-state">No assets in demo company</div>
        ) : (
          <div className="asset-grid">
            {assets.map(a => {
              const he = a.tel?.helium_level ?? null
              const flow = a.tel?.flow ?? null
              const temp = a.tel?.chiller_temp ?? null
              const status = a.status
              const dotClass = status === 'online' ? 'dot-online' : status === 'warning' ? 'dot-warning' : 'dot-never'
              return (
                <div key={a.id} className={`asset-card status-${status}`}>
                  <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{a.site?.name ?? 'Unassigned'}{a.site?.city ? ` · ${a.site.city}` : ''}</div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{a.name}</div>
                      </div>
                      <span className={`badge badge-${status}`}><span className={`dot ${dotClass}`} />{status}</span>
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Helium Level</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: he == null ? 'var(--text-muted)' : he < 60 ? 'var(--red)' : he < 75 ? 'var(--yellow)' : 'var(--green)' }}>{he != null ? `${he.toFixed(1)}%` : '—'}</span>
                    </div>
                    <div className="he-bar-bg"><div className={`he-bar-fill ${he == null ? 'level-crit' : he < 60 ? 'level-crit' : he < 75 ? 'level-warn' : 'level-ok'}`} style={{ width: `${Math.min(he ?? 0, 100)}%` }} /></div>
                  </div>
                  <div style={{ height: 56 }} />
                  <div style={{ padding: '8px 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <div className="metric-chip"><span className="metric-chip-label">Flow</span><span className="metric-chip-value" style={{ fontSize: 13 }}>{flow != null ? flow.toFixed(2) : '—'}</span></div>
                    <div className="metric-chip"><span className="metric-chip-label">Chiller</span><span className="metric-chip-value" style={{ fontSize: 13 }}>{temp != null ? `${temp.toFixed(1)}°` : '—'}</span></div>
                    <div className="metric-chip"><span className="metric-chip-label">He Press</span><span className="metric-chip-value" style={{ fontSize: 13 }}>{a.tel?.he_pressure != null ? a.tel.he_pressure.toFixed(2) : '—'}</span></div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
