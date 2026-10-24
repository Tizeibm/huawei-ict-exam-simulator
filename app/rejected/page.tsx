import type { Metadata } from 'next'
import { StatusScreen } from '@/components/auth/status-screen'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Request not approved · ICT Prep' }

export default async function RejectedPage() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  return <StatusScreen status="rejected" email={user?.email} />
}
