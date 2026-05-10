import React, { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Company } from './types'

interface AppContextType {
  session: Session | null
  user: User | null
  loading: boolean
  companies: Company[]
  selectedCompany: Company | null
  setSelectedCompany: (c: Company) => void
  isAppAdmin: boolean
  signOut: () => Promise<void>
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompany, setSelectedCompanyState] = useState<Company | null>(null)
  const [isAppAdmin, setIsAppAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setCompanies([])
      setSelectedCompanyState(null)
      setIsAppAdmin(false)
      return
    }
    loadCompanies()
    checkAdmin()
  }, [session])

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .order('name')
    if (data && data.length > 0) {
      setCompanies(data)
      const stored = localStorage.getItem('magmon_company')
      const found = stored ? data.find((c: Company) => c.id === stored) : null
      // If we have no stored preference, prefer the first non-demo company so a
      // brand-new device doesn't land on the empty Demo Medical Imaging fixture.
      const fallback = data.find((c: Company) => !c.id.startsWith('demo-')) ?? data[0]
      setSelectedCompanyState(found ?? fallback)
    }
  }

  async function checkAdmin() {
    const { data } = await supabase.rpc('is_app_admin')
    setIsAppAdmin(!!data)
  }

  function setSelectedCompany(c: Company) {
    setSelectedCompanyState(c)
    localStorage.setItem('magmon_company', c.id)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
  }

  return (
    <AppContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      companies,
      selectedCompany,
      setSelectedCompany,
      isAppAdmin,
      signOut
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
