import { SUBMIT_GRACE_SECONDS } from './config.ts'

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | 'ABANDONED'

export function secondsRemaining(expiresAt: string | null, now: number) {
  if (!expiresAt) return null
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000))
}

export function isExpired(expiresAt: string | null, now: number, graceSeconds = 0) {
  return !!expiresAt && now > new Date(expiresAt).getTime() + graceSeconds * 1000
}

/** Whether answers may still be saved/submitted for an attempt. */
export function canAcceptAnswers(status: AttemptStatus, expiresAt: string | null, now: number) {
  return status === 'IN_PROGRESS' && !isExpired(expiresAt, now, SUBMIT_GRACE_SECONDS)
}

/** Final status for a submit/finalize request made at `now`. */
export function finalStatus(expiresAt: string | null, now: number): 'SUBMITTED' | 'EXPIRED' {
  return isExpired(expiresAt, now) ? 'EXPIRED' : 'SUBMITTED'
}

export function formatClock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}
