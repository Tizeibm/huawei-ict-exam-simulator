export type Topic = 'OPENEULER' | 'OPENGAUSS' | 'KUNPENG'
export type QuestionType = 'SINGLE' | 'MULTIPLE' | 'BOOLEAN'

export interface Question {
  id: string
  topic: Topic
  type: QuestionType
  question_text: string
  options: Record<string, string>
  correct_answers: string[]
  explanation: string
}

export interface ExamAttempt {
  id: string
  user_id: string
  total_score: number
  openeuler_score: number
  opengauss_score: number
  kunpeng_score: number
  completed_at: string
}

export const sampleQuestions: Question[] = [
  { id: 'q1', topic: 'OPENEULER', type: 'SINGLE', question_text: 'Which command displays and modifies network connections on openEuler?', options: { A: 'nmcli', B: 'ipconfig', C: 'netstat', D: 'route' }, correct_answers: ['A'], explanation: 'nmcli is the command-line client for NetworkManager and is the recommended tool for managing connections.' },
  { id: 'q2', topic: 'OPENEULER', type: 'MULTIPLE', question_text: 'Which are common benefits of iSulad?', options: { A: 'Lightweight footprint', B: 'Container security isolation', C: 'Only Windows support', D: 'Fast startup' }, correct_answers: ['A', 'B', 'D'], explanation: 'iSulad is a lightweight container runtime designed for fast startup, low overhead, and strong isolation on openEuler.' },
  { id: 'q3', topic: 'OPENEULER', type: 'BOOLEAN', question_text: 'dnf can install, update, and remove software packages on openEuler.', options: { A: 'True', B: 'False' }, correct_answers: ['A'], explanation: 'dnf is the modern package management utility used by openEuler for RPM-based package operations.' },
  { id: 'q4', topic: 'OPENEULER', type: 'SINGLE', question_text: 'Which file commonly configures persistent hostname settings?', options: { A: '/etc/hostname', B: '/etc/hosts.allow', C: '/var/hostname', D: '/boot/hostname' }, correct_answers: ['A'], explanation: 'The system hostname is persisted in /etc/hostname.' },
  { id: 'q5', topic: 'OPENEULER', type: 'SINGLE', question_text: 'What is the primary purpose of systemd?', options: { A: 'Init and service manager', B: 'Compiler', C: 'Database', D: 'Firewall' }, correct_answers: ['A'], explanation: 'systemd initializes the system and manages services, targets, and logging.' },
  { id: 'q6', topic: 'OPENEULER', type: 'MULTIPLE', question_text: 'Which commands can inspect running processes?', options: { A: 'ps', B: 'top', C: 'dnf', D: 'htop' }, correct_answers: ['A', 'B', 'D'], explanation: 'ps, top, and htop are process inspection tools; dnf manages packages.' },
  { id: 'q7', topic: 'OPENGAUSS', type: 'SINGLE', question_text: 'Which command-line tool is used to connect to an openGauss database?', options: { A: 'gsql', B: 'gs_om', C: 'gaussdb', D: 'gstack' }, correct_answers: ['A'], explanation: 'gsql is the openGauss interactive terminal for connecting to and querying databases.' },
  { id: 'q8', topic: 'OPENGAUSS', type: 'MULTIPLE', question_text: 'Which tasks can gs_om perform?', options: { A: 'Cluster status checks', B: 'Instance start and stop', C: 'Image editing', D: 'Cluster configuration' }, correct_answers: ['A', 'B', 'D'], explanation: 'gs_om manages openGauss cluster operations including status, lifecycle, and configuration.' },
  { id: 'q9', topic: 'OPENGAUSS', type: 'BOOLEAN', question_text: 'MOT is used to monitor and tune openGauss database performance.', options: { A: 'True', B: 'False' }, correct_answers: ['A'], explanation: 'MOT (Memory-Optimized Tables) is an in-memory engine feature used for high-performance workloads.' },
  { id: 'q10', topic: 'OPENGAUSS', type: 'SINGLE', question_text: 'Which SQL command creates a new database?', options: { A: 'CREATE DATABASE', B: 'NEW DATABASE', C: 'INIT DB', D: 'MAKE DATABASE' }, correct_answers: ['A'], explanation: 'CREATE DATABASE is the standard SQL statement supported by openGauss.' },
  { id: 'q11', topic: 'KUNPENG', type: 'SINGLE', question_text: 'Which architecture is native to Kunpeng processors?', options: { A: 'ARM64', B: 'x86-16', C: 'MIPS32', D: 'SPARC' }, correct_answers: ['A'], explanation: 'Kunpeng processors use the 64-bit ARM architecture, commonly referred to as ARM64 or AArch64.' },
  { id: 'q12', topic: 'KUNPENG', type: 'MULTIPLE', question_text: 'Which tools support software porting to Kunpeng?', options: { A: 'BiSheng Compiler', B: 'Porting Advisor', C: 'gsql', D: 'Dependency analysis' }, correct_answers: ['A', 'B', 'D'], explanation: 'BiSheng Compiler, Porting Advisor, and dependency analysis help optimize and port applications to ARM64.' },
]

export async function fetchNewExamQuestions(_userId: string): Promise<Question[]> {
  return [...sampleQuestions, ...sampleQuestions, ...sampleQuestions, ...sampleQuestions, ...sampleQuestions].slice(0, 60)
}

export async function submitExamAttempt(attemptData: Omit<ExamAttempt, 'id'>): Promise<ExamAttempt> {
  return { ...attemptData, id: `attempt-${Date.now()}` }
}
