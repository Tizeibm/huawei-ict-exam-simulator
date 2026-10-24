import type { Metadata } from 'next'
import { AdminConsole } from '@/components/admin-console'
import { AppHeader } from '@/components/app-header'
import { getCurrentUserContext } from '@/lib/auth/server'

export const metadata: Metadata = { title: 'Administration · ICT Prep' }

export default async function AdminPage() {
  const { user, profile, isAdmin } = await getCurrentUserContext()
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader email={user?.email} fullName={profile?.full_name} isAdmin={isAdmin} />
      <AdminConsole />
    </div>
  )
}
