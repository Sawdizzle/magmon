import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import { AlertTriangle, ToggleLeft, ToggleRight } from 'lucide-react'

interface Rule {
  id: string
  company_id: string
  metric: string
  operator: string
  threshold: number | null
  severity: string
  enabled: boolean
}

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--red)',
  warning: 'var(--yellow)',
  info: 'var(--cyan)'
}

export default function ThresholdRules() {
  const { selectedCompany } = useApp()
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedCompany) return
    load()
  }, [selectedCompany])

  async function load() {
    if (!selectedCompany) return
    setLoading(true)
    const { data } = await supabase
      .from('threshold_rules')
      .select('*')
      .eq('company_id', selectedCompany.id)
      .order('metric')
    if (data) setRules(data)
    setLoading(false)
  }

  async function toggleRule(id: string, enabled: boolean) {
    await supabase.from('threshold_rules').update({ enabled: !enabled }).eq('id', id)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Threshold Rules</div>
          <div className="page-subtitle">{rules.filter(r => r.enabled).length} of {rules.length} rules enabled</div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="empty-state"><AlertTriangle size={40} /><div>No threshold rules configured</div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Condition</th>
                <th>Severity</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.5 }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.metric}</td>
                  <td>
                    {r.operator} {r.threshold != null ? r.threshold : '(change)'}
                  </td>
                  <td>
                    <span className={`badge badge-${r.severity}`}>{r.severity}</span>
                  </td>
                  <td>
                    <button
                      style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', color: r.enabled ? 'var(--cyan)' : 'var(--text-muted)' }}
                      onClick={() => toggleRule(r.id, r.enabled)}
                    >
                      {r.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
