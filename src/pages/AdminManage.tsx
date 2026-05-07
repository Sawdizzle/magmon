import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import { Shield } from 'lucide-react'

interface Company { id: string; name: string }
interface Site { id: string; name: string; city: string | null; state: string | null; company_id: string }
interface AssetRow { id: string; name: string; site_id: string | null; company_id: string; magmon_ip: string | null; model: string | null; serial: string | null }
interface GatewayRow { id: string; hostname: string | null; company_id: string; site_id: string | null; type: string | null }

export default function AdminManage() {
  const { isAppAdmin, selectedCompany } = useApp()
  const [tab, setTab] = useState<'companies' | 'sites' | 'assets' | 'gateways'>('companies')
  const [companies, setCompanies] = useState<Company[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [gateways, setGateways] = useState<GatewayRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [c, s, a, g] = await Promise.all([
      supabase.from('companies').select('id, name').order('name'),
      supabase.from('sites').select('*').order('name'),
      supabase.from('assets').select('id, name, site_id, company_id, magmon_ip, model, serial').order('name'),
      supabase.from('gateways').select('id, hostname, company_id, site_id, type').order('hostname')
    ])
    setCompanies(c.data ?? [])
    setSites(s.data ?? [])
    setAssets(a.data ?? [])
    setGateways(g.data ?? [])
    setLoading(false)
  }

  if (!isAppAdmin) {
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <Shield size={48} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>Admin Access Required</div>
        <div>You don't have permission to view this page.</div>
      </div>
    )
  }

  const filteredSites = selectedCompany ? sites.filter(s => s.company_id === selectedCompany.id) : sites
  const filteredAssets = selectedCompany ? assets.filter(a => a.company_id === selectedCompany.id) : assets
  const filteredGateways = selectedCompany ? gateways.filter(g => g.company_id === selectedCompany.id) : gateways

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Admin</div>
          <div className="page-subtitle">Manage companies, sites, assets, and gateways</div>
        </div>
      </div>

      <div className="tabs">
        {(['companies','sites','assets','gateways'] as const).map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : tab === 'companies' ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr><th>ID</th><th>Name</th></tr></thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{c.id}</td>
                  <td>{c.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === 'sites' ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr><th>Name</th><th>City</th><th>State</th><th>Company</th></tr></thead>
            <tbody>
              {filteredSites.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.city ?? '—'}</td>
                  <td>{s.state ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{companies.find(c => c.id === s.company_id)?.name ?? s.company_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === 'assets' ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr><th>Name</th><th>MagMon IP</th><th>Model</th><th>Serial</th><th>Site</th></tr></thead>
            <tbody>
              {filteredAssets.map(a => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.magmon_ip ?? '—'}</td>
                  <td>{a.model ?? '—'}</td>
                  <td>{a.serial ?? '—'}</td>
                  <td>{sites.find(s => s.id === a.site_id)?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr><th>Hostname</th><th>ID</th><th>Type</th><th>Site</th></tr></thead>
            <tbody>
              {filteredGateways.map(g => (
                <tr key={g.id}>
                  <td>{g.hostname ?? '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{g.id}</td>
                  <td>{g.type ?? '—'}</td>
                  <td>{sites.find(s => s.id === g.site_id)?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
