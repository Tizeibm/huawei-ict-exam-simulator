import type { Metadata } from 'next'
import { StatusScreen } from '@/components/auth/status-screen'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Pending approval · ICT Prep' }

export default async function PendingPage() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  return <StatusScreen status="pending" email={user?.email} />
}
