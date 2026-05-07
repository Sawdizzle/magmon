import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/context'
import { MapPin, Edit2, Save, X, Plus, Search, SortAsc, SortDesc } from 'lucide-react'
import { naturalCompare, usePersistedState } from '../lib/listControls'

interface Site {
  id: string
  name: string
  city: string | null
  state: string | null
  address_line1: string | null
  postal_code: string | null
  company_id: string
  asset_count?: number
}

type SortKey = 'name' | 'city' | 'state' | 'assets'

export default function SitesPage() {
  const { selectedCompany } = useApp()
  const [sites, setSites] = useState<Site[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Site>>({})
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)

  // Persisted UI prefs
  const [search, setSearch] = usePersistedState<string>('sites.search', '')
  const [stateFilter, setStateFilter] = usePersistedState<string>('sites.stateFilter', 'all')
  const [sortKey, setSortKey] = usePersistedState<SortKey>('sites.sortKey', 'name')
  const [sortAsc, setSortAsc] = usePersistedState<boolean>('sites.sortAsc', true)

  useEffect(() => {
    if (!selectedCompany) return
    load()
  }, [selectedCompany])

  async function load() {
    if (!selectedCompany) return
    setLoading(true)
    const { data: siteData } = await supabase
      .from('sites')
      .select('*')
      .eq('company_id', selectedCompany.id)
      .order('name')
    const { data: assetData } = await supabase
      .from('assets')
      .select('site_id')
      .eq('company_id', selectedCompany.id)
    const countMap: Record<string, number> = {}
    assetData?.forEach((a: { site_id: string | null }) => {
      if (a.site_id) countMap[a.site_id] = (countMap[a.site_id] || 0) + 1
    })
    setSites((siteData ?? []).map((s: Site) => ({ ...s, asset_count: countMap[s.id] ?? 0 })))
    setLoading(false)
  }

  async function save(id: string) {
    await supabase.from('sites').update({
      name: form.name,
      city: form.city,
      state: form.state,
      address_line1: form.address_line1,
      postal_code: form.postal_code
    }).eq('id', id)
    setEditing(null)
    load()
  }

  async function addSite() {
    if (!selectedCompany || !form.name) return
    await supabase.from('sites').insert({
      name: form.name,
      city: form.city,
      state: form.state,
      company_id: selectedCompany.id
    })
    setAdding(false)
    setForm({})
    load()
  }

  const stateOptions = useMemo(() => {
    const s = new Set<string>()
    sites.forEach(site => { if (site.state) s.add(site.state) })
    return Array.from(s).sort()
  }, [sites])

  const filtered = useMemo(() => {
    let list = [...sites]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.city ?? '').toLowerCase().includes(q) ||
        (s.state ?? '').toLowerCase().includes(q) ||
        (s.address_line1 ?? '').toLowerCase().includes(q) ||
        (s.postal_code ?? '').toLowerCase().includes(q)
      )
    }
    if (stateFilter !== 'all') list = list.filter(s => s.state === stateFilter)

    list.sort((a, b) => {
      let result = 0
      if (sortKey === 'name') {
        result = naturalCompare(a.name, b.name)
      } else if (sortKey === 'city') {
        result = naturalCompare(a.city ?? '', b.city ?? '')
        if (result === 0) result = naturalCompare(a.name, b.name)
      } else if (sortKey === 'state') {
        result = naturalCompare(a.state ?? '', b.state ?? '')
        if (result === 0) result = naturalCompare(a.city ?? '', b.city ?? '')
      } else if (sortKey === 'assets') {
        result = (a.asset_count ?? 0) - (b.asset_count ?? 0)
        if (result === 0) result = naturalCompare(a.name, b.name)
      }
      return sortAsc ? result : -result
    })

    return list
  }, [sites, search, stateFilter, sortKey, sortAsc])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(v => !v)
    else { setSortKey(k); setSortAsc(true) }
  }

  const SortIcon = sortAsc ? SortAsc : SortDesc
  const filtersActive = search.trim() !== '' || stateFilter !== 'all'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Sites</div>
          <div className="page-subtitle">
            {sites.length} sites
            {filtersActive && ` · showing ${filtered.length}`}
          </div>
        </div>
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setAdding(true); setForm({}) }}>
          <Plus size={14} /> Add Site
        </button>
      </div>

      {/* Filter bar */}
      {sites.length > 0 && (
        <div className="filter-bar">
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              placeholder="Search sites, cities…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 30, maxWidth: 240 }}
            />
          </div>
          {stateOptions.length > 1 && (
            <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
              <option value="all">All States</option>
              {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {(['name', 'city', 'state', 'assets'] as SortKey[]).map(k => (
              <button
                key={k}
                className="btn-ghost"
                style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', color: sortKey === k ? 'var(--cyan)' : undefined, borderColor: sortKey === k ? 'var(--cyan)' : undefined }}
                onClick={() => toggleSort(k)}
              >
                {k === 'assets' ? 'Assets' : k.charAt(0).toUpperCase() + k.slice(1)}
                {sortKey === k && <SortIcon size={11} />}
              </button>
            ))}
          </div>
          {filtersActive && (
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={() => { setSearch(''); setStateFilter('all') }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {adding && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 14 }}>New Site</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Name *</label><input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Hospital Name" /></div>
            <div className="form-group"><label>City</label><input value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
            <div className="form-group"><label>State</label><input value={form.state ?? ''} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="TX" /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn-primary" onClick={addSite} disabled={!form.name}>Save</button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setForm({}) }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : sites.length === 0 ? (
        <div className="empty-state"><MapPin size={40} /><div>No sites found</div></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><MapPin size={40} /><div>No sites match your filters</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(site => (
            <div key={site.id} className="card">
              {editing === site.id ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group"><label>Name</label><input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="form-group"><label>City</label><input value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                    <div className="form-group"><label>State</label><input value={form.state ?? ''} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} /></div>
                    <div className="form-group"><label>Address</label><input value={form.address_line1 ?? ''} onChange={e => setForm(f => ({ ...f, address_line1: e.target.value }))} /></div>
                    <div className="form-group"><label>Postal Code</label><input value={form.postal_code ?? ''} onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => save(site.id)}><Save size={13} /> Save</button>
                    <button className="btn-ghost" onClick={() => setEditing(null)}><X size={13} /></button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MapPin size={14} style={{ color: 'var(--cyan)' }} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{site.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '2px 7px', borderRadius: 10 }}>
                        {site.asset_count} asset{site.asset_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {[site.address_line1, site.city, site.state, site.postal_code].filter(Boolean).join(', ') || 'No address on file'}
                    </div>
                  </div>
                  <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => { setEditing(site.id); setForm({ name: site.name, city: site.city, state: site.state, address_line1: site.address_line1, postal_code: site.postal_code }) }}>
                    <Edit2 size={13} /> Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
