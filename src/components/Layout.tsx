import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Radio, Bell, AlertTriangle, MapPin,
  LogOut, Shield, Building2, Menu, X,
} from 'lucide-react'
import { useApp } from '../lib/context'
import MagmonLogo from './MagmonLogo'

const NAV = [
  { section: 'Monitor', items: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { label: 'Gateways', icon: Radio, path: '/gateways' },
    { label: 'Alerts', icon: Bell, path: '/alerts' },
  ]},
  { section: 'Manage', items: [
    { label: 'Sites', icon: MapPin, path: '/sites' },
    { label: 'Threshold Rules', icon: AlertTriangle, path: '/thresholds' },
  ]},
  { section: 'Admin', items: [
    { label: 'Admin', icon: Shield, path: '/admin' },
  ]},
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { companies, selectedCompany, setSelectedCompany, user, isAppAdmin, signOut } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close the off-canvas sidebar whenever the user navigates to a new route on mobile.
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Close on Escape for accessibility
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  return (
    <div className="app-shell">
      {/* Mobile-only top bar with hamburger + branding + compact company selector */}
      <header className="mobile-topbar">
        <button
          className="mobile-menu-btn"
          aria-label="Open navigation"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MagmonLogo size={22} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>Mag<span style={{ color: 'var(--cyan)' }}>Mon</span></div>
        </div>
        {companies.length > 1 && (
          <select
            aria-label="Company"
            className="mobile-company-select"
            value={selectedCompany?.id ?? ''}
            onChange={e => {
              const c = companies.find(c => c.id === e.target.value)
              if (c) setSelectedCompany(c)
            }}
          >
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </header>

      {/* Mobile-only overlay (taps close the sidebar) */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar (always rendered; CSS controls slide-in on mobile) */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Logo (with mobile-only close button) */}
        <div className="sidebar-logo">
          <MagmonLogo size={30} />
          <div className="sidebar-logo-text">Mag<span>Mon</span></div>
          <button
            className="sidebar-close-btn"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer', display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Company selector */}
        {companies.length > 0 && (
          <div className="company-selector">
            <label>
              <Building2 size={9} style={{ display: 'inline', marginRight: 4 }} />
              Company
            </label>
            <select
              value={selectedCompany?.id ?? ''}
              onChange={e => {
                const c = companies.find(c => c.id === e.target.value)
                if (c) setSelectedCompany(c)
              }}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV.map(section => {
            const items = section.section === 'Admin' && !isAppAdmin ? [] : section.items
            if (items.length === 0) return null
            return (
              <div key={section.section} className="nav-section">
                <div className="nav-section-label">{section.section}</div>
                {items.map(item => {
                  const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                  return (
                    <button
                      key={item.path}
                      className={`nav-item ${active ? 'active' : ''}`}
                      onClick={() => navigate(item.path)}
                    >
                      <item.icon size={15} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-info">
              <div className="sidebar-user-email">{user?.email}</div>
            </div>
            <button
              className="btn-ghost"
              onClick={signOut}
              title="Sign out"
              style={{ padding: '5px', border: 'none', display: 'flex', alignItems: 'center' }}
            >
              <LogOut size={14} />
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
            Saw Tech Solutions
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
