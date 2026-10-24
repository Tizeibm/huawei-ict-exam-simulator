'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { CheckCircle2, AlertCircle, Loader2, KeyRound, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function ProfileSettingsForm({
  initialName,
  email,
  role,
  status,
  createdAt,
}: {
  initialName: string
  email: string
  role: string
  status: string
  createdAt: string
}) {
  const router = useRouter()
  const [fullName, setFullName] = useState(initialName)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileNotice, setProfileNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function onUpdateProfile(e: FormEvent) {
    e.preventDefault()
    setProfileNotice(null)
    if (fullName.trim().length < 2) {
      setProfileNotice({ kind: 'error', text: 'Full name must be at least 2 characters.' })
      return
    }
    setSavingProfile(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim() }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setProfileNotice({ kind: 'error', text: result.error ?? 'Could not update profile.' })
        return
      }
      setProfileNotice({ kind: 'success', text: 'Profile display name updated.' })
      router.refresh()
    } finally {
      setSavingProfile(false)
    }
  }

  async function onUpdatePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordNotice(null)
    if (newPassword.length < 8) {
      setPasswordNotice({ kind: 'error', text: 'New password must be at least 8 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ kind: 'error', text: 'Passwords do not match.' })
      return
    }
    setSavingPassword(true)
    try {
      const { error } = await createClient().auth.updateUser({ password: newPassword })
      if (error) {
        setPasswordNotice({ kind: 'error', text: error.message || 'Unable to update password.' })
        return
      }
      setNewPassword('')
      setConfirmPassword('')
      setPasswordNotice({ kind: 'success', text: 'Your password has been updated.' })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Personal Information Card */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2 text-primary">
            <User className="size-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Account Profile</span>
          </div>
          <CardTitle className="mt-1 text-lg font-bold">Personal Details</CardTitle>
          <CardDescription>Update your display name and review your account permissions.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={onUpdateProfile} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" htmlFor="profile-email">Email Address</label>
              <Input id="profile-email" value={email} disabled />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" htmlFor="profile-role">Account Role</label>
                <Input id="profile-role" value={role.toUpperCase()} disabled />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" htmlFor="profile-status">Approval Status</label>
                <Input id="profile-status" value={status} disabled />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" htmlFor="profile-name">Full Name</label>
              <Input
                id="profile-name"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Member since {new Date(createdAt).toLocaleDateString()}
            </p>

            {profileNotice && (
              <div
                role={profileNotice.kind === 'error' ? 'alert' : 'status'}
                className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                  profileNotice.kind === 'error'
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {profileNotice.kind === 'error' ? (
                  <AlertCircle className="size-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="size-4 shrink-0" />
                )}
                <span>{profileNotice.text}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile && <Loader2 className="size-4 animate-spin" />}
                <span>Save Profile</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password Update Card */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2 text-primary">
            <KeyRound className="size-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Security</span>
          </div>
          <CardTitle className="mt-1 text-lg font-bold">Change Password</CardTitle>
          <CardDescription>Choose a strong password of at least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={onUpdatePassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" htmlFor="new-pw">New Password</label>
              <Input
                id="new-pw"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" htmlFor="confirm-pw">Confirm New Password</label>
              <Input
                id="confirm-pw"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {passwordNotice && (
              <div
                role={passwordNotice.kind === 'error' ? 'alert' : 'status'}
                className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                  passwordNotice.kind === 'error'
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {passwordNotice.kind === 'error' ? (
                  <AlertCircle className="size-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="size-4 shrink-0" />
                )}
                <span>{passwordNotice.text}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={savingPassword}>
                {savingPassword && <Loader2 className="size-4 animate-spin" />}
                <span>Update Password</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
