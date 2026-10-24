import type { Metadata } from 'next'
import { AdminConsole } from '@/components/admin-console'
import { AppHeader } from '@/components/app-header'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Administration · ICT Prep' }

export default async function AdminPage() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  return (
    <>
      <AppHeader email={user?.email} isAdmin />
      <AdminConsole />
    </>
  )
}
