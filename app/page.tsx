import { redirect } from 'next/navigation'

// The proxy already routes by session and approval status; this is the fail-safe entry point.
export default function Page() {
  redirect('/login')
}
