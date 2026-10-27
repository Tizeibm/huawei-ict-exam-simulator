import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Layers,
  Server,
  ShieldCheck,
} from 'lucide-react'
import { getCurrentUserContext } from '@/lib/auth/server'
import {
  blueprintTopicTotal,
  blueprintTotal,
  FULL_BLUEPRINT,
  FULL_EXAM_DURATION_MINUTES,
  QUESTION_TYPES,
  SIMULATOR_PASS_PERCENT,
  TOPIC_LABELS,
  TOPICS,
  TYPE_LABELS,
} from '@/lib/exam/config'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const TRACK_DETAILS = {
  OPENEULER: {
    Icon: Server,
    subtitle: 'Enterprise Linux OS',
    description: 'System administration, package management, storage, networking, shell scripting, and security on openEuler.',
  },
  OPENGAUSS: {
    Icon: Database,
    subtitle: 'Relational Database Management',
    description: 'SQL architecture, transaction management, security controls, performance tuning, and high availability in openGauss.',
  },
  KUNPENG: {
    Icon: Cpu,
    subtitle: 'ARM Server Computing Platform',
    description: 'Kunpeng processor architecture, software porting, compiler optimization, and performance Acceleration libraries.',
  },
} as const

export default async function HomePage() {
  const { user, isApproved, isAdmin } = await getCurrentUserContext()
  const totalQuestions = blueprintTotal()

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden="true">
              <span>ICT</span>
            </span>
            <div className="min-w-0">
              <span className="block text-base font-bold tracking-tight">ICT Prep</span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">Huawei ICT Competition · Computing and Network Tracks</span>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {user && isApproved ? (
              <>
                <Link href="/dashboard" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'hidden sm:inline-flex' })}>
                  Candidate Dashboard
                </Link>
                {isAdmin && (
                  <Link href="/admin" className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'hidden md:inline-flex' })}>
                    Admin Console
                  </Link>
                )}
                <Link href="/exam" className={buttonVariants({ size: 'sm', className: 'px-2.5 sm:px-3' })}>
                  <span className="hidden sm:inline">Exam Workspace </span><ArrowRight className="size-3.5" />
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'px-2.5 sm:px-3' })}>
                  Sign in
                </Link>
                <Link href="/signup" className={buttonVariants({ size: 'sm', className: 'px-2.5 sm:px-3' })}>
                  <span className="hidden sm:inline">Request access </span><ArrowRight className="size-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_65%)] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_.85fr]">
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="uppercase tracking-wider text-[11px]">
Competition Track Simulator
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    openEuler · openGauss · Kunpeng
                  </Badge>
                </div>

                <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
                  Structured Exam Preparation for the Huawei ICT Competition
                </h1>

                <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
                  Train under realistic examination conditions with a 60-question multi-technology blueprint, strict server-validated scoring, topic-level diagnostics, and longitudinal progress tracking across openEuler, openGauss, and Kunpeng.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {user && isApproved ? (
                    <>
                      <Link href="/exam" className={buttonVariants({ size: 'lg', className: 'h-11 px-6 rounded-lg' })}>
                        Start Exam Simulation <ArrowRight className="size-4" />
                      </Link>
                      <Link
                        href="/dashboard"
                        className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-11 px-5 rounded-lg' })}
                      >
                        View Personal Analytics
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link href="/login" className={buttonVariants({ size: 'lg', className: 'h-11 px-6 rounded-lg' })}>
                        Sign in to Simulator <ArrowRight className="size-4" />
                      </Link>
                      <Link
                        href="/signup"
                        className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-11 px-5 rounded-lg' })}
                      >
                        Request Candidate Account
                      </Link>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 border-t pt-6 sm:max-w-lg sm:grid-cols-3">
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-primary tabular-nums">{totalQuestions} Questions</p>
                    <p className="text-xs text-muted-foreground">Configured full blueprint</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-primary tabular-nums">{FULL_EXAM_DURATION_MINUTES} Minutes</p>
                    <p className="text-xs text-muted-foreground">Server-enforced timer</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-primary tabular-nums">3 Technologies</p>
                    <p className="text-xs text-muted-foreground">openEuler, openGauss, Kunpeng</p>
                  </div>
                </div>
              </div>

              {/* Blueprint Summary Card */}
              <Card className="border-primary/20 shadow-md">
                <CardHeader className="border-b bg-accent/40">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold">Configured Full-Exam Blueprint</CardTitle>
                    <Badge variant="secondary">{totalQuestions} Total</Badge>
                  </div>
                  <CardDescription>
                    Configured ICT Prep simulator allocation across technologies and question formats.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2.5">Technology</th>
                          <th className="pb-2.5 text-right">Single</th>
                          <th className="pb-2.5 text-right">Multiple</th>
                          <th className="pb-2.5 text-right">Boolean</th>
                          <th className="pb-2.5 text-right text-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {TOPICS.map((topic) => (
                          <tr key={topic}>
                            <td className="py-3 font-semibold">{TOPIC_LABELS[topic]}</td>
                            <td className="py-3 text-right tabular-nums text-muted-foreground">
                              {FULL_BLUEPRINT[topic].SINGLE}
                            </td>
                            <td className="py-3 text-right tabular-nums text-muted-foreground">
                              {FULL_BLUEPRINT[topic].MULTIPLE}
                            </td>
                            <td className="py-3 text-right tabular-nums text-muted-foreground">
                              {FULL_BLUEPRINT[topic].BOOLEAN}
                            </td>
                            <td className="py-3 text-right font-bold tabular-nums text-primary">
                              {blueprintTopicTotal(topic)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/40 font-semibold">
                          <td className="pt-2.5 pb-1">Total Allocation</td>
                          {QUESTION_TYPES.map((type) => (
                            <td key={type} className="pt-2.5 pb-1 text-right tabular-nums">
                              {TOPICS.reduce((acc, t) => acc + FULL_BLUEPRINT[t][type], 0)}
                            </td>
                          ))}
                          <td className="pt-2.5 pb-1 text-right font-bold tabular-nums text-primary">
                            {totalQuestions}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="mt-4 rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                    Note: This allocation and the {SIMULATOR_PASS_PERCENT}% pass benchmark are ICT Prep simulator configuration settings, not a claim of official Huawei exam parameters.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Three Technologies Section */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="mb-8 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Core Curriculum</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Competition Technologies</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Every simulated exam and practice session tracks your accuracy independently across the three core technologies.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {TOPICS.map((topic) => {
              const { Icon, subtitle, description } = TRACK_DETAILS[topic]
              return (
                <Card key={topic} className="metric-card">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <Badge variant="outline">{blueprintTopicTotal(topic)} questions / exam</Badge>
                    </div>
                    <CardTitle className="mt-3 text-lg font-bold">{TOPIC_LABELS[topic]}</CardTitle>
                    <CardDescription className="font-medium text-primary">{subtitle}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                    <div className="flex flex-wrap gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                      {QUESTION_TYPES.map((type) => (
                        <span key={type} className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                          {FULL_BLUEPRINT[topic][type]} {TYPE_LABELS[type]}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        {/* Simulator Modes & Capabilities */}
        <section className="border-t bg-muted/30 py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Examination Engine</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Three Dedicated Preparation Modes</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2.5 text-primary">
                    <Clock className="size-5" aria-hidden="true" />
                    <span className="text-xs font-bold uppercase tracking-wider">Mode 1</span>
                  </div>
                  <CardTitle className="mt-1 text-base font-bold">Full Exam Simulation</CardTitle>
                  <CardDescription>Strict 60-question blueprint · 90-minute server timer</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Replicates formal testing with a persistent question navigation grid, question flagging, resumable session state, and hidden answer keys until final submission.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2.5 text-primary">
                    <Layers className="size-5" aria-hidden="true" />
                    <span className="text-xs font-bold uppercase tracking-wider">Mode 2</span>
                  </div>
                  <CardTitle className="mt-1 text-base font-bold">Targeted Practice Mode</CardTitle>
                  <CardDescription>Custom technology, question type & length</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Focus on specific technologies or question formats (Single, Multiple, True/False) with optional immediate answer verification and explanations.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2.5 text-primary">
                    <BarChart3 className="size-5" aria-hidden="true" />
                    <span className="text-xs font-bold uppercase tracking-wider">Mode 3</span>
                  </div>
                  <CardTitle className="mt-1 text-base font-bold">Historical Review Mode</CardTitle>
                  <CardDescription>Revisit past incorrect & flagged items</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Automatically compiles questions you previously missed or flagged across persisted attempts so you can eliminate weak spots systematically.
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-card py-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            <span>ICT Prep · Controlled-Access Huawei ICT Competition Computing Track Simulator</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground hover:underline">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground hover:underline">Request access</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
