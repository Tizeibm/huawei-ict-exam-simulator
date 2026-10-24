import Link from 'next/link'
import { Cpu, Database, Server, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4" aria-label="ICT Prep home">
      <span className={light ? 'flex size-10 items-center justify-center rounded-xl bg-white text-sm font-black text-blue-700' : 'brand-mark size-10'} aria-hidden="true">
        <span>ICT</span>
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-bold tracking-tight">ICT Prep</span>
        <span className={light ? 'block text-xs text-blue-100' : 'block text-xs text-muted-foreground'}>Huawei ICT Competition · Computing Track</span>
      </span>
    </Link>
  )
}

const TRACKS = [
  { name: 'openEuler', detail: 'Linux operating system', Icon: Server },
  { name: 'openGauss', detail: 'Enterprise database', Icon: Database },
  { name: 'Kunpeng', detail: 'ARM server platform', Icon: Cpu },
]

/** Two-panel layout used by every public authentication page. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-stage">
      <div className="auth-card">
        <aside className="auth-brand-panel" aria-label="About ICT Prep">
          <Logo light />
          <div className="relative z-10 flex flex-col gap-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-blue-100">Exam simulator</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-balance">Practise the Computing Track with confidence.</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-blue-100">Timed, scored practice drawn from a curated question bank covering all three certification tracks.</p>
            </div>
            <ul className="flex flex-col gap-3">
              {TRACKS.map(({ name, detail, Icon }) => (
                <li key={name} className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-sm">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700"><Icon className="size-5" aria-hidden="true" /></span>
                  <span><span className="block font-semibold">{name}</span><span className="block text-xs text-blue-100">{detail}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative z-10 flex items-center gap-2 text-xs text-blue-100"><ShieldCheck className="size-4" aria-hidden="true" /> Access is granted manually by an administrator.</p>
        </aside>
        <section className="auth-form-panel">
          <div className="lg:hidden"><Logo /></div>
          {children}
        </section>
      </div>
    </main>
  )
}
