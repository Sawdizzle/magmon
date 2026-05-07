import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './lib/context'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AssetDetail from './pages/AssetDetail'
import Gateways from './pages/Gateways'
import AlertsPage from './pages/AlertsPage'
import SitesPage from './pages/SitesPage'
import AdminManage from './pages/AdminManage'
import ThresholdRules from './pages/ThresholdRules'

export default function App() {
  const { session, loading } = useApp()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <svg width="40" height="40" viewBox="0 0 40 40" style={{ animation: 'spin 1s linear infinite' }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <circle cx="20" cy="20" r="16" fill="none" stroke="#00c8dc" strokeWidth="2.5" strokeDasharray="60 40" />
        </svg>
      </div>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/assets/:id" element={<AssetDetail />} />
        <Route path="/gateways" element={<Gateways />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/sites" element={<SitesPage />} />
        <Route path="/thresholds" element={<ThresholdRules />} />
        <Route path="/admin" element={<AdminManage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
