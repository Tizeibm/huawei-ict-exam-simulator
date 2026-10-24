import type { Metadata } from 'next'
import { AppHeader } from '@/components/app-header'
import { ProfileSettingsForm } from '@/components/profile-form'
import { getCurrentUserContext } from '@/lib/auth/server'

export const metadata: Metadata = { title: 'Profile & Settings · ICT Prep' }

export default async function ProfilePage() {
  const { user, profile, isAdmin } = await getCurrentUserContext()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader email={user?.email} fullName={profile?.full_name} isAdmin={isAdmin} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <section className="border-b pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Account Preferences
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Profile &amp; Security Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your personal profile information and authentication credentials.
          </p>
        </section>

        <ProfileSettingsForm
          initialName={profile?.full_name ?? ''}
          email={user?.email ?? ''}
          role={profile?.role ?? 'candidate'}
          status={profile?.status ?? 'APPROVED'}
          createdAt={profile?.created_at ?? new Date().toISOString()}
        />
      </main>
    </div>
  )
}
