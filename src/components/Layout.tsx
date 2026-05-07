import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Radio, Bell, AlertTriangle, MapPin,
  Settings, LogOut, ChevronDown, Shield, Building2
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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <MagmonLogo size={30} />
          <div className="sidebar-logo-text">Mag<span>Mon</span></div>
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
