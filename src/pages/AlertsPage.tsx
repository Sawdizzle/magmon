import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import { Bell, CheckCircle } from 'lucide-react'

interface Alert {
  id: string
  asset_id: string
  rule_id: string
  severity: string
  message: string
  opened_at: string
  closed_at: string | null
  acked_at: string | null
  asset: { name: string } | null
}

export default function AlertsPage() {
  const { selectedCompany } = useApp()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedCompany) return
    load()
  }, [selectedCompany, tab])

  async function load() {
    if (!selectedCompany) return
    setLoading(true)
    let q = supabase
      .from('alerts')
      .select('*, asset:assets(name)')
      .eq('assets.company_id', selectedCompany.id)
      .order('opened_at', { ascending: false })
      .limit(100)
    if (tab === 'active') q = q.is('closed_at', null)
    else q = q.not('closed_at', 'is', null)
    const { data } = await q
    if (data) setAlerts(data)
    setLoading(false)
  }

  async function ack(id: string) {
    await supabase.from('alerts').update({ acked_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  const sevColor = (s: string) => s === 'critical' ? 'var(--red)' : s === 'warning' ? 'var(--yellow)' : 'var(--cyan)'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Alerts</div>
          <div className="page-subtitle">{tab === 'active' ? `${alerts.length} active alert${alerts.length !== 1 ? 's' : ''}` : 'Alert history'}</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active</button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : alerts.length === 0 ? (
        <div className="empty-state">
          <Bell size={40} />
          <div>{tab === 'active' ? 'No active alerts — all clear!' : 'No alert history'}</div>
        </div>
      ) : (
        <div>
          {alerts.map(a => (
            <div key={a.id} className={`alert-row sev-${a.severity}`}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: sevColor(a.severity), flexShrink: 0, marginTop: 3 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{a.asset?.name ?? a.asset_id}</span>
                  <span className={`badge badge-${a.severity}`} style={{ fontSize: 10 }}>{a.severity}</span>
                  {a.acked_at && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Acked</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{a.message}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {new Date(a.opened_at).toLocaleString()}
                  {a.closed_at && ` → ${new Date(a.closed_at).toLocaleString()}`}
                </div>
              </div>
              {tab === 'active' && !a.acked_at && (
                <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flexShrink: 0 }} onClick={() => ack(a.id)}>
                  <CheckCircle size={13} /> Ack
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
