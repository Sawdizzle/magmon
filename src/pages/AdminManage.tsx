import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import {
  Shield, Plus, Edit2, Save, X, Trash2, ServerCog, MapPin, Building2,
  Users as UsersIcon, FileCode2, Copy, Check, ChevronDown, ChevronRight,
} from 'lucide-react'
import { naturalCompare } from '../lib/listControls'

// --------------------------- types ---------------------------
interface Company { id: string; name: string }
interface Site { id: string; name: string; city: string | null; state: string | null; company_id: string; timezone?: string | null }
interface GatewayRow { id: string; hostname: string | null; company_id: string; site_id: string | null; type: string | null; ip_address?: string | null }
interface RegisteredUser { user_id: string; email: string; created_at: string; is_app_admin: boolean }
interface CompanyMember { user_id: string; email: string; role: string; created_at: string }

type Tab = 'companies' | 'sites' | 'gateways' | 'users' | 'architecture'

// =============================================================
// Top-level page
// =============================================================
export default function AdminManage() {
  const { isAppAdmin, selectedCompany, companies: ctxCompanies } = useApp()
  const [tab, setTab] = useState<Tab>('companies')

  if (!isAppAdmin) {
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <Shield size={48} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>Admin Access Required</div>
        <div>You don't have permission to view this page.</div>
      </div>
    )
  }

  const tabs: Array<{ key: Tab; label: string; icon: typeof Building2 }> = [
    { key: 'companies',    label: 'Companies',    icon: Building2 },
    { key: 'sites',        label: 'Sites',        icon: MapPin },
    { key: 'gateways',     label: 'Gateways',     icon: ServerCog },
    { key: 'users',        label: 'Users',        icon: UsersIcon },
    { key: 'architecture', label: 'Architecture', icon: FileCode2 },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Admin</div>
          <div className="page-subtitle">Manage companies, sites, gateways, users, and review project architecture</div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'companies'    && <CompaniesTab />}
      {tab === 'sites'        && <SitesTab />}
      {tab === 'gateways'     && <GatewaysTab />}
      {tab === 'users'        && <UsersTab selectedCompany={selectedCompany} ctxCompanies={ctxCompanies} />}
      {tab === 'architecture' && <ArchitectureTab />}
    </div>
  )
}

// =============================================================
// Companies
// =============================================================
function CompaniesTab() {
  const [rows, setRows] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', slug: '' })
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; slug: string }>({ name: '', slug: '' })
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('companies').select('id, name').order('name')
    setRows(data ?? [])
    setLoading(false)
  }

  async function create() {
    setErr(null)
    if (!form.id.trim() || !form.name.trim() || !form.slug.trim()) {
      setErr('All fields required'); return
    }
    const { error } = await supabase.rpc('admin_create_company', {
      p_company_id: form.id.trim(), p_name: form.name.trim(), p_slug: form.slug.trim(),
    })
    if (error) { setErr(error.message); return }
    setForm({ id: '', name: '', slug: '' })
    setAdding(false)
    load()
  }

  async function save(id: string) {
    setErr(null)
    const { error } = await supabase.rpc('admin_update_company', {
      p_company_id: id, p_name: editForm.name, p_slug: editForm.slug,
    })
    if (error) { setErr(error.message); return }
    setEditing(null)
    load()
  }

  async function remove(id: string) {
    if (!confirm(`Delete company "${id}"? This cannot be undone.`)) return
    setErr(null)
    const { error } = await supabase.rpc('admin_delete_company', { p_company_id: id })
    if (error) { setErr(error.message); return }
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{rows.length} companies</div>
        <button className="btn-primary" onClick={() => { setAdding(v => !v); setErr(null) }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New Company
        </button>
      </div>

      {adding && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>New Company</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="form-group"><label>Company ID</label><input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="e.g. acme-medical" /></div>
            <div className="form-group"><label>Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Medical, Inc." /></div>
            <div className="form-group"><label>Slug</label><input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="acme" /></div>
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={create}>Create</button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setErr(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {err && !adding && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th style={{ width: 140 }}></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={3} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Loading…</td></tr> :
             rows.length === 0 ? <tr><td colSpan={3} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No companies.</td></tr> :
             rows.map(c => (
              <tr key={c.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{c.id}</td>
                <td>
                  {editing === c.id
                    ? <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    : c.name}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {editing === c.id ? (
                      <>
                        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => save(c.id)}><Save size={11} /></button>
                        <button className="btn-ghost"   style={{ padding: '4px 8px',  fontSize: 11 }} onClick={() => setEditing(null)}><X size={11} /></button>
                      </>
                    ) : (
                      <>
                        <button className="btn-ghost"  style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => { setEditing(c.id); setEditForm({ name: c.name, slug: c.id }) }}><Edit2 size={11} /></button>
                        <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => remove(c.id)}><Trash2 size={11} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =============================================================
// Sites
// =============================================================
function SitesTab() {
  const { selectedCompany, companies: ctxCompanies } = useApp()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ company_id: '', name: '', city: '', state: '' })
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; city: string; state: string }>({ name: '', city: '', state: '' })
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { load() }, [])
  useEffect(() => { if (selectedCompany) setForm(f => ({ ...f, company_id: selectedCompany.id })) }, [selectedCompany])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('sites').select('id, name, city, state, company_id, timezone').order('name')
    setSites((data ?? []) as Site[])
    setLoading(false)
  }

  async function create() {
    setErr(null)
    if (!form.company_id || !form.name.trim()) { setErr('Company and Name required'); return }
    const { error } = await supabase.rpc('admin_create_site', {
      p_company_id: form.company_id, p_name: form.name.trim(),
      p_city: form.city.trim(), p_state: form.state.trim(), p_timezone: 'UTC',
    })
    if (error) { setErr(error.message); return }
    setForm(f => ({ ...f, name: '', city: '', state: '' }))
    setAdding(false)
    load()
  }

  async function save(id: string) {
    setErr(null)
    const { error } = await supabase.rpc('admin_update_site', {
      p_site_id: id, p_name: editForm.name, p_city: editForm.city, p_state: editForm.state,
    })
    if (error) { setErr(error.message); return }
    setEditing(null)
    load()
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete site "${name}"? This cannot be undone.`)) return
    setErr(null)
    const { error } = await supabase.rpc('admin_delete_site', { p_site_id: id })
    if (error) { setErr(error.message); return }
    load()
  }

  const filtered = selectedCompany ? sites.filter(s => s.company_id === selectedCompany.id) : sites

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {filtered.length} sites{selectedCompany ? ` in ${selectedCompany.name}` : ' (all companies)'}
        </div>
        <button className="btn-primary" onClick={() => { setAdding(v => !v); setErr(null) }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New Site
        </button>
      </div>

      {adding && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>New Site</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label>Company *</label>
              <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}>
                <option value="">— pick a company —</option>
                {ctxCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Hospital Name" /></div>
            <div className="form-group"><label>City</label><input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
            <div className="form-group"><label>State</label><input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="TX" /></div>
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={create}>Create</button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setErr(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {err && !adding && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead><tr><th>Name</th><th>City</th><th>State</th><th>Company</th><th style={{ width: 140 }}></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Loading…</td></tr> :
             filtered.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No sites.</td></tr> :
             filtered.map(s => editing === s.id ? (
              <tr key={s.id}>
                <td><input value={editForm.name}  onChange={e => setEditForm(f => ({ ...f, name:  e.target.value }))} /></td>
                <td><input value={editForm.city}  onChange={e => setEditForm(f => ({ ...f, city:  e.target.value }))} /></td>
                <td><input value={editForm.state} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))} /></td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ctxCompanies.find(c => c.id === s.company_id)?.name ?? s.company_id}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => save(s.id)}><Save size={11} /></button>
                    <button className="btn-ghost"   style={{ padding: '4px 8px',  fontSize: 11 }} onClick={() => setEditing(null)}><X size={11} /></button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.city ?? '—'}</td>
                <td>{s.state ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ctxCompanies.find(c => c.id === s.company_id)?.name ?? s.company_id}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost"  style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => { setEditing(s.id); setEditForm({ name: s.name, city: s.city ?? '', state: s.state ?? '' }) }}><Edit2 size={11} /></button>
                    <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => remove(s.id, s.name)}><Trash2 size={11} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =============================================================
// Gateways
// =============================================================
function GatewaysTab() {
  const { selectedCompany, companies: ctxCompanies } = useApp()
  const [gateways, setGateways] = useState<GatewayRow[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ company_id: '', site_id: '', hostname: '', kind: 'pi' as 'pi' | 'pc', ip_address: '' })
  const [created, setCreated] = useState<{ token: string; gateway_id: string; hostname: string } | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ hostname: string; ip_address: string; site_id: string }>({ hostname: '', ip_address: '', site_id: '' })
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { load() }, [])
  useEffect(() => { if (selectedCompany) setForm(f => ({ ...f, company_id: selectedCompany.id })) }, [selectedCompany])

  async function load() {
    setLoading(true)
    const [gw, s] = await Promise.all([
      supabase.from('gateways').select('id, hostname, company_id, site_id, type, ip_address').order('hostname'),
      supabase.from('sites').select('id, name, city, state, company_id').order('name'),
    ])
    setGateways(gw.data ?? [])
    setSites((s.data ?? []) as Site[])
    setLoading(false)
  }

  async function create() {
    setErr(null)
    if (!form.company_id || !form.site_id || !form.hostname.trim()) { setErr('Company, site, and hostname required'); return }
    const { data, error } = await supabase.rpc('admin_create_gateway', {
      p_company_id: form.company_id, p_site_id: form.site_id, p_hostname: form.hostname.trim(),
      p_kind: form.kind, p_ip_address: form.ip_address.trim(), p_offline_timeout_sec: 120,
    })
    if (error) { setErr(error.message); return }
    const row = Array.isArray(data) ? data[0] : data
    if (row) setCreated({ token: row.token, gateway_id: row.gateway_id, hostname: row.hostname })
    setForm(f => ({ ...f, hostname: '', ip_address: '' }))
    setAdding(false)
    load()
  }

  async function save(id: string) {
    setErr(null)
    const { error } = await supabase.rpc('admin_update_gateway', {
      p_gateway_id: id, p_hostname: editForm.hostname, p_ip_address: editForm.ip_address,
      p_site_id: editForm.site_id, p_kind: null, p_os_version: null, p_offline_timeout_sec: null,
    })
    if (error) { setErr(error.message); return }
    setEditing(null)
    load()
  }

  async function remove(id: string, hostname: string | null) {
    if (!confirm(`Delete gateway "${hostname ?? id}"? This cannot be undone.`)) return
    setErr(null)
    const { error } = await supabase.rpc('admin_delete_gateway', { p_gateway_id: id })
    if (error) { setErr(error.message); return }
    load()
  }

  async function copyToken() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.token)
      setTokenCopied(true); setTimeout(() => setTokenCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const filtered = selectedCompany ? gateways.filter(g => g.company_id === selectedCompany.id) : gateways
  const sitesForCompany = (cid: string) => sites.filter(s => s.company_id === cid)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {filtered.length} gateways{selectedCompany ? ` in ${selectedCompany.name}` : ' (all companies)'}
        </div>
        <button className="btn-primary" onClick={() => { setAdding(v => !v); setErr(null) }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New Gateway
        </button>
      </div>

      {created && (
        <div className="card" style={{ borderColor: 'var(--green)', background: 'rgba(52,211,153,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>Gateway created: {created.hostname}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>Copy this token now — it's only shown once. Configure your gateway agent with it.</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 'var(--radius)', wordBreak: 'break-all' }}>{created.token}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Gateway ID: <span style={{ fontFamily: 'monospace' }}>{created.gateway_id}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn-ghost" onClick={copyToken} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                {tokenCopied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
              </button>
              <button className="btn-ghost" onClick={() => setCreated(null)} style={{ padding: 6 }} aria-label="Dismiss"><X size={14} /></button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>New Gateway</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label>Company *</label>
              <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value, site_id: '' }))}>
                <option value="">— pick —</option>
                {ctxCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Site *</label>
              <select value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))} disabled={!form.company_id}>
                <option value="">— pick —</option>
                {sitesForCompany(form.company_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Hostname *</label><input value={form.hostname} onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))} placeholder="nm1042-pi" /></div>
            <div className="form-group">
              <label>Kind</label>
              <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as 'pi' | 'pc' }))}>
                <option value="pi">Raspberry Pi</option>
                <option value="pc">PC</option>
              </select>
            </div>
            <div className="form-group"><label>IP (optional)</label><input value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))} placeholder="192.168.x.x" /></div>
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={create}>Create</button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setErr(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {err && !adding && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead><tr><th>Hostname</th><th>Site</th><th>Type</th><th>IP</th><th>Company</th><th style={{ width: 140 }}></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Loading…</td></tr> :
             filtered.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No gateways.</td></tr> :
             filtered.map(g => editing === g.id ? (
              <tr key={g.id}>
                <td><input value={editForm.hostname} onChange={e => setEditForm(f => ({ ...f, hostname: e.target.value }))} /></td>
                <td>
                  <select value={editForm.site_id} onChange={e => setEditForm(f => ({ ...f, site_id: e.target.value }))}>
                    {sitesForCompany(g.company_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td>{g.type ?? '—'}</td>
                <td><input value={editForm.ip_address} onChange={e => setEditForm(f => ({ ...f, ip_address: e.target.value }))} /></td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ctxCompanies.find(c => c.id === g.company_id)?.name ?? g.company_id}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => save(g.id)}><Save size={11} /></button>
                    <button className="btn-ghost"   style={{ padding: '4px 8px',  fontSize: 11 }} onClick={() => setEditing(null)}><X size={11} /></button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={g.id}>
                <td>{g.hostname ?? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{g.id.slice(0, 12)}</span>}</td>
                <td>{sites.find(s => s.id === g.site_id)?.name ?? '—'}</td>
                <td style={{ textTransform: 'capitalize' }}>{g.type ?? '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{g.ip_address || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ctxCompanies.find(c => c.id === g.company_id)?.name ?? g.company_id}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost"  style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => { setEditing(g.id); setEditForm({ hostname: g.hostname ?? '', ip_address: g.ip_address ?? '', site_id: g.site_id ?? '' }) }}><Edit2 size={11} /></button>
                    <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => remove(g.id, g.hostname)}><Trash2 size={11} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =============================================================
// Users (App Admins + Company Members)
// =============================================================
interface Membership { company_id: string; company_name: string; role: string; created_at: string }

function UsersTab({ selectedCompany, ctxCompanies }: { selectedCompany: { id: string; name: string } | null; ctxCompanies: Company[] }) {
  const [users, setUsers] = useState<RegisteredUser[]>([])
  const [members, setMembers] = useState<CompanyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [err, setErr] = useState<string | null>(null)

  // Per-user membership state
  const [expanded, setExpanded] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<Record<string, Membership[]>>({})
  const [membLoading, setMembLoading] = useState<Record<string, boolean>>({})
  // Per-user "add to company" mini-form state
  const [addCompanyId, setAddCompanyId] = useState<Record<string, string>>({})
  const [addCompanyRole, setAddCompanyRole] = useState<Record<string, 'admin' | 'member' | 'viewer'>>({})

  useEffect(() => { load() }, [selectedCompany?.id])

  async function load() {
    setLoading(true)
    const [u, m] = await Promise.all([
      supabase.rpc('list_registered_users'),
      selectedCompany ? supabase.rpc('list_company_members', { p_company_id: selectedCompany.id }) : Promise.resolve({ data: [] }),
    ])
    setUsers((u.data ?? []) as RegisteredUser[])
    setMembers((m.data ?? []) as CompanyMember[])
    setLoading(false)
  }

  async function loadMemberships(userId: string) {
    setMembLoading(m => ({ ...m, [userId]: true }))
    const { data, error } = await supabase.rpc('list_user_memberships', { p_user_id: userId })
    setMembLoading(m => ({ ...m, [userId]: false }))
    if (error) { setErr(error.message); return }
    setMemberships(m => ({ ...m, [userId]: (data ?? []) as Membership[] }))
  }

  function toggleExpand(userId: string) {
    if (expanded === userId) {
      setExpanded(null)
    } else {
      setExpanded(userId)
      if (!memberships[userId]) loadMemberships(userId)
    }
  }

  async function toggleAppAdmin(userId: string, current: boolean) {
    setErr(null)
    const { error } = await supabase.rpc('admin_set_app_admin', { p_user_id: userId, p_is_admin: !current })
    if (error) { setErr(error.message); return }
    load()
  }

  async function addMember() {
    setErr(null)
    if (!selectedCompany) { setErr('Pick a company first'); return }
    if (!addEmail.trim()) { setErr('Email required'); return }
    const { error } = await supabase.rpc('add_company_member', {
      p_company_id: selectedCompany.id, p_email: addEmail.trim(), p_role: addRole,
    })
    if (error) { setErr(error.message); return }
    setAddEmail('')
    load()
  }

  async function removeMember(userId: string, email: string) {
    if (!selectedCompany) return
    if (!confirm(`Remove ${email} from ${selectedCompany.name}?`)) return
    setErr(null)
    const { error } = await supabase.rpc('remove_company_member', {
      p_company_id: selectedCompany.id, p_user_id: userId,
    })
    if (error) { setErr(error.message); return }
    load()
  }

  async function changeRole(userId: string, role: string) {
    if (!selectedCompany) return
    setErr(null)
    const { error } = await supabase.rpc('set_company_member_role', {
      p_company_id: selectedCompany.id, p_user_id: userId, p_role: role,
    })
    if (error) { setErr(error.message); return }
    load()
  }

  // Per-user company assignment
  async function assignUserToCompany(userId: string) {
    setErr(null)
    const cid = addCompanyId[userId]
    const role = addCompanyRole[userId] ?? 'member'
    if (!cid) { setErr('Pick a company'); return }
    const { error } = await supabase.rpc('add_company_member_by_user_id', {
      p_user_id: userId, p_company_id: cid, p_role: role,
    })
    if (error) { setErr(error.message); return }
    setAddCompanyId(m => ({ ...m, [userId]: '' }))
    loadMemberships(userId)
    // also refresh the bottom "company members" table in case the picked company matches
    if (selectedCompany && cid === selectedCompany.id) load()
  }

  async function removeUserFromCompany(userId: string, companyId: string, companyName: string, email: string) {
    if (!confirm(`Remove ${email} from ${companyName}?`)) return
    setErr(null)
    const { error } = await supabase.rpc('remove_company_member', {
      p_company_id: companyId, p_user_id: userId,
    })
    if (error) { setErr(error.message); return }
    loadMemberships(userId)
    if (selectedCompany && companyId === selectedCompany.id) load()
  }

  async function changeUserRoleAt(userId: string, companyId: string, role: string) {
    setErr(null)
    const { error } = await supabase.rpc('set_company_member_role', {
      p_company_id: companyId, p_user_id: userId, p_role: role,
    })
    if (error) { setErr(error.message); return }
    loadMemberships(userId)
    if (selectedCompany && companyId === selectedCompany.id) load()
  }

  const sortedUsers = useMemo(() => [...users].sort((a, b) => naturalCompare(a.email, b.email)), [users])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}

      {/* All Users — global. Click a row to expand and manage their company memberships. */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>All Users</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          Click a user to expand and assign companies (with role). The "Make admin" button grants global app-admin (every company).
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr>
              <th style={{ width: 28 }}></th>
              <th>Email</th>
              <th>Companies</th>
              <th>Joined</th>
              <th style={{ width: 140 }}>App Admin</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Loading…</td></tr> :
               sortedUsers.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No registered users.</td></tr> :
               sortedUsers.map(u => {
                const isOpen = expanded === u.user_id
                const userMembs = memberships[u.user_id] ?? []
                const memberOf = new Set(userMembs.map(m => m.company_id))
                const availableCompanies = ctxCompanies.filter(c => !memberOf.has(c.id))
                return (
                  <React.Fragment key={u.user_id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpand(u.user_id)}>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td>{u.email}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {!memberships[u.user_id]
                          ? <span style={{ color: 'var(--text-muted)' }}>{u.is_app_admin ? 'app admin (all)' : 'click to load'}</span>
                          : userMembs.length === 0
                            ? <span>—</span>
                            : userMembs.map(m => m.company_name).join(', ')}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <button
                          className={u.is_app_admin ? 'btn-primary' : 'btn-ghost'}
                          style={{ padding: '4px 10px', fontSize: 11 }}
                          onClick={() => toggleAppAdmin(u.user_id, u.is_app_admin)}
                        >
                          {u.is_app_admin ? '✓ Admin' : 'Make admin'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--bg-surface)', padding: '14px 18px' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                            Companies {u.email} belongs to
                          </div>
                          {membLoading[u.user_id] ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading memberships…</div>
                          ) : userMembs.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                              Not yet assigned to any company.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                              {userMembs.map(m => (
                                <div key={m.company_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                                  <Building2 size={12} style={{ color: 'var(--text-muted)' }} />
                                  <span style={{ flex: 1 }}>{m.company_name}</span>
                                  <select
                                    value={m.role}
                                    onChange={e => changeUserRoleAt(u.user_id, m.company_id, e.target.value)}
                                    style={{ fontSize: 11, padding: '3px 6px', width: 'auto' }}
                                  >
                                    <option value="admin">Admin</option>
                                    <option value="member">Member</option>
                                    <option value="viewer">Viewer</option>
                                  </select>
                                  <button
                                    className="btn-danger"
                                    style={{ padding: '3px 8px', fontSize: 11 }}
                                    onClick={() => removeUserFromCompany(u.user_id, m.company_id, m.company_name, u.email)}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {availableCompanies.length > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: 10 }}>Assign to company</label>
                                <select
                                  value={addCompanyId[u.user_id] ?? ''}
                                  onChange={e => setAddCompanyId(m => ({ ...m, [u.user_id]: e.target.value }))}
                                  style={{ fontSize: 12 }}
                                >
                                  <option value="">— pick —</option>
                                  {availableCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: 10 }}>Role</label>
                                <select
                                  value={addCompanyRole[u.user_id] ?? 'member'}
                                  onChange={e => setAddCompanyRole(m => ({ ...m, [u.user_id]: e.target.value as 'admin' | 'member' | 'viewer' }))}
                                  style={{ fontSize: 12 }}
                                >
                                  <option value="admin">Admin</option>
                                  <option value="member">Member</option>
                                  <option value="viewer">Viewer</option>
                                </select>
                              </div>
                              <button
                                className="btn-primary"
                                style={{ padding: '6px 14px', fontSize: 12 }}
                                onClick={() => assignUserToCompany(u.user_id)}
                                disabled={!addCompanyId[u.user_id]}
                              >
                                Assign
                              </button>
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                              Already a member of every company.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Company Members */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Company Members {selectedCompany ? `· ${selectedCompany.name}` : ''}
        </div>
        {!selectedCompany ? (
          <div className="empty-state" style={{ padding: 30 }}>Pick a company in the sidebar to manage its members.</div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Invite existing user by email</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Email</label>
                  <input value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="user@example.com" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Role</label>
                  <select value={addRole} onChange={e => setAddRole(e.target.value as 'admin' | 'member' | 'viewer')}>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <button className="btn-primary" onClick={addMember}>Add</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                The user must already have signed in once so an account exists. Use Supabase Auth → Users to invite a brand-new user first.
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead><tr><th>Email</th><th style={{ width: 140 }}>Role</th><th style={{ width: 100 }}></th></tr></thead>
                <tbody>
                  {members.length === 0 ? <tr><td colSpan={3} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No members yet.</td></tr> :
                   members.map(m => (
                    <tr key={m.user_id}>
                      <td>{m.email}</td>
                      <td>
                        <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)}>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                      <td>
                        <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => removeMember(m.user_id, m.email)}><Trash2 size={11} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {ctxCompanies.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>No companies in your list — create one in the Companies tab.</div>
        )}
      </div>
    </div>
  )
}

// =============================================================
// Architecture / Deployment docs
// =============================================================
function ArchitectureTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 920 }}>
      <Doc title="Stack at a glance">
        <p>
          <strong>Frontend</strong> · React + TypeScript + Vite, deployed on <strong>Vercel</strong> (project <code>magnet-monitor</code>).
          Auto-deploys on every push to <code>main</code> in the <code>Sawdizzle/magmon</code> GitHub repo.
        </p>
        <p>
          <strong>Backend</strong> · Supabase (Postgres 17). All data lives in the <code>public</code> schema. Row-level security is enabled
          on every table. Multi-tenant isolation goes through <code>company_members</code> + the helpers <code>is_app_admin</code> /
          <code>is_company_admin</code> / <code>is_company_member</code>.
        </p>
        <p>
          <strong>Gateways</strong> · Each gateway runs an agent that authenticates with a token (created via
          <code>+ New Gateway</code>) and POSTs to <code>/rest/v1/rpc/gateway_ingest_telemetry</code> and
          <code>/rest/v1/rpc/gateway_heartbeat</code>.
        </p>
      </Doc>

      <Doc title="Deploying code">
        <p>From your local clone (<code>~/Documents/code/magmon</code>):</p>
        <Code>{`git add .
git commit -m "Short description of what changed"
git push origin main`}</Code>
        <p>
          Vercel detects the push within a few seconds, runs <code>tsc && vite build</code>, and serves the new build at
          <code>magnet-monitor.vercel.app</code> and your custom domain <code>magmon.sawtechsolutions.com</code> (~60 seconds end-to-end).
          If the build fails, the previous build keeps serving — no downtime.
        </p>
        <p>To verify a build before pushing: run <code>npm run build</code> locally. <code>tsc --noEmit</code> alone gives a fast type-check.</p>
      </Doc>

      <Doc title="Rolling back">
        <p>
          Two ways. <strong>Vercel UI:</strong> open any older deployment in <code>Vercel → magnet-monitor → Deployments</code>, click the
          ⋯ menu, "Promote to Production." Live site flips to that build instantly. <strong>Git:</strong>
        </p>
        <Code>{`git revert <commit-sha>
git push origin main`}</Code>
        <p>Force-pushing (<code>git push --force-with-lease</code>) is also fine since you're solo on the repo, but the Vercel promote is reversible without rewriting history.</p>
      </Doc>

      <Doc title="Database changes">
        <p>
          Schema changes go through <strong>Supabase migrations</strong>. The dashboard automatically tracks them; we apply migrations through
          the MCP tool when working together, or manually via the Supabase SQL Editor.
        </p>
        <p>
          For ad-hoc queries: <code>Supabase → SQL Editor</code>. For data inspection:
          <code>Supabase → Table Editor</code>. For policy/index review: <code>Supabase → Database → Advisors</code>.
        </p>
      </Doc>

      <Doc title="Environment variables (Vercel)">
        <p>Configured in <code>Vercel → magnet-monitor → Settings → Environment Variables</code>:</p>
        <ul>
          <li><code>VITE_SUPABASE_URL</code> — Supabase project URL</li>
          <li><code>VITE_SUPABASE_PUBLISHABLE_KEY</code> — Supabase anon/publishable key (safe to ship to the browser)</li>
        </ul>
        <p>The browser never sees the service-role key. Anything privileged goes through <code>SECURITY DEFINER</code> RPCs that check <code>auth.uid()</code>.</p>
      </Doc>

      <Doc title="Key files in the repo">
        <ul>
          <li><code>src/pages/Dashboard.tsx</code> — Fleet overview (KPI tiles, asset cards, sparklines)</li>
          <li><code>src/pages/AssetDetail.tsx</code> — Per-asset combined chart + per-metric trends</li>
          <li><code>src/pages/Gateways.tsx</code> — Gateway list with create/filter/sort</li>
          <li><code>src/pages/SitesPage.tsx</code> — Site list and editing</li>
          <li><code>src/pages/AlertsPage.tsx</code> · <code>ThresholdRules.tsx</code> — Alerts + rules</li>
          <li><code>src/pages/AdminManage.tsx</code> — This admin panel</li>
          <li><code>src/lib/supabase.ts</code> — Supabase client</li>
          <li><code>src/lib/context.tsx</code> — Auth + selected-company context</li>
          <li><code>src/lib/listControls.ts</code> — Sort/filter helpers + persisted prefs</li>
        </ul>
      </Doc>

      <Doc title="Server-side RPCs (the privileged API)">
        <p>Every write the dashboard does goes through one of these. Each has <code>SECURITY DEFINER</code> with an
        <code>is_app_admin()</code> or <code>is_company_admin()</code> check at the top.</p>
        <ul>
          <li><strong>Performance:</strong> <code>get_company_dashboard</code>, <code>get_company_sparklines</code>, <code>get_asset_telemetry_buckets</code></li>
          <li><strong>Companies:</strong> <code>admin_create_company</code>, <code>admin_update_company</code>, <code>admin_delete_company</code></li>
          <li><strong>Sites:</strong> <code>admin_create_site</code>, <code>admin_update_site</code>, <code>admin_delete_site</code></li>
          <li><strong>Gateways:</strong> <code>admin_create_gateway</code>, <code>admin_update_gateway</code>, <code>admin_delete_gateway</code></li>
          <li><strong>Users:</strong> <code>add_company_member</code>, <code>remove_company_member</code>, <code>set_company_member_role</code>, <code>list_company_members</code>, <code>list_registered_users</code>, <code>admin_set_app_admin</code></li>
          <li><strong>Gateway agents:</strong> <code>gateway_heartbeat</code>, <code>gateway_ingest_telemetry</code> — token-authenticated</li>
        </ul>
      </Doc>

      <Doc title="Local development">
        <Code>{`cd ~/Documents/code/magmon
npm install
npm run dev    # vite dev server, hot reload at http://localhost:5173`}</Code>
        <p>Build: <code>npm run build</code>. Type-check only: <code>npx tsc --noEmit</code>.</p>
      </Doc>
    </div>
  )
}

function Doc({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

function Code({ children }: { children: string }) {
  return (
    <pre style={{
      background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, overflow: 'auto', whiteSpace: 'pre',
      margin: '8px 0',
    }}>{children}</pre>
  )
}
