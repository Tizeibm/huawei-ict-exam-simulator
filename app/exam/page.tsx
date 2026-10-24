import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AppHeader } from '@/components/app-header'
import { ExamWorkspace } from '@/components/exam-workspace'
import { getCurrentUserContext } from '@/lib/auth/server'

export const metadata: Metadata = { title: 'Exam Simulator · ICT Prep' }

export default async function ExamPage() {
  const { user, profile, isAdmin } = await getCurrentUserContext()
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader email={user?.email} fullName={profile?.full_name} isAdmin={isAdmin} />
      <Suspense fallback={<div className="mx-auto max-w-6xl px-5 py-12 text-sm text-muted-foreground">Loading examination workspace…</div>}>
        <ExamWorkspace />
      </Suspense>
    </div>
  )
}
