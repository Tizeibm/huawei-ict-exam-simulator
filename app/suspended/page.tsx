import type { Metadata } from 'next'
import { StatusScreen } from '@/components/auth/status-screen'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Account suspended · ICT Prep' }

export default async function SuspendedPage() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  return <StatusScreen status="suspended" email={user?.email} />
}
