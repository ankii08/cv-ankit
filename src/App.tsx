import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  ArrowUpRight,
  Briefcase,
  Copy,
  Download,
  Github,
  GraduationCap,
  Linkedin,
  Mail,
  MapPin,
  Send,
  Sparkles,
  TerminalSquare,
  UserRound,
} from 'lucide-react'
import { useHomeSeo } from './articles/use-article-seo'
import { getTechIcon } from './tech-icons'

function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}

function AnimatedSection({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const [ref, setRef] = useState<HTMLElement | null>(null)
  const [isInView, setIsInView] = useState(false)
  const hydrated = useHydrated()

  useEffect(() => {
    if (!ref) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12 }
    )
    observer.observe(ref)
    return () => observer.disconnect()
  }, [ref])

  return (
    <motion.section
      ref={setRef}
      initial={false}
      animate={
        hydrated && isInView
          ? { opacity: 1, y: 0 }
          : hydrated
            ? { opacity: 0, y: 28 }
            : false
      }
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  )
}

function useTypewriterRotation(
  roles: readonly string[],
  {
    typeSpeed = 75,
    deleteSpeed = 45,
    pauseAfterType = 1800,
    pauseAfterDelete = 250,
  } = {}
) {
  const [roleIndex, setRoleIndex] = useState(0)
  const [displayText, setDisplayText] = useState(roles[0] || '')
  const [isDeleting, setIsDeleting] = useState(false)
  const currentRole = roles[roleIndex] || ''

  useEffect(() => {
    if (!roles.length) return
    let timeout: ReturnType<typeof setTimeout>

    if (!isDeleting && displayText === currentRole) {
      timeout = setTimeout(() => setIsDeleting(true), pauseAfterType)
    } else if (isDeleting && displayText === '') {
      timeout = setTimeout(() => {
        setRoleIndex((i) => (i + 1) % roles.length)
        setIsDeleting(false)
      }, pauseAfterDelete)
    } else if (isDeleting) {
      timeout = setTimeout(() => {
        setDisplayText(currentRole.slice(0, displayText.length - 1))
      }, deleteSpeed)
    } else {
      timeout = setTimeout(() => {
        setDisplayText(currentRole.slice(0, displayText.length + 1))
      }, typeSpeed)
    }

    return () => clearTimeout(timeout)
  }, [currentRole, deleteSpeed, displayText, isDeleting, pauseAfterDelete, pauseAfterType, roles.length, typeSpeed])

  return { displayText, roleIndex }
}

const GRID = 24
const SNAKE_COUNT = 3
const SNAKE_LENGTH = 8
const TICK_MS = 180
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function GridSnakes() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const resize = () => {
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
    }

    resize()
    window.addEventListener('resize', resize)

    const cols = () => Math.floor(canvas.width / GRID)
    const rows = () => Math.floor(canvas.height / GRID)

    type Snake = { trail: [number, number][]; dir: [number, number] }
    const snakes: Snake[] = Array.from({ length: SNAKE_COUNT }, () => {
      const x = Math.floor(Math.random() * Math.max(cols(), 1))
      const y = Math.floor(Math.random() * Math.max(rows(), 1))
      return { trail: [[x, y]], dir: DIRS[Math.floor(Math.random() * 4)] }
    })

    const tick = () => {
      const c = Math.max(cols(), 1)
      const r = Math.max(rows(), 1)
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      for (const snake of snakes) {
        if (Math.random() < 0.3) {
          snake.dir = DIRS[Math.floor(Math.random() * 4)]
        }

        const [hx, hy] = snake.trail[snake.trail.length - 1]
        let nx = hx + snake.dir[0]
        let ny = hy + snake.dir[1]

        if (nx < 0) nx = c - 1
        if (nx >= c) nx = 0
        if (ny < 0) ny = r - 1
        if (ny >= r) ny = 0

        snake.trail.push([nx, ny])
        if (snake.trail.length > SNAKE_LENGTH) snake.trail.shift()
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const snake of snakes) {
        for (let i = 0; i < snake.trail.length; i++) {
          const [gx, gy] = snake.trail[i]
          const alpha = ((i + 1) / snake.trail.length) * 0.45
          ctx.beginPath()
          ctx.arc(gx * GRID + GRID / 2, gy * GRID + GRID / 2, 1.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(32, 214, 238, ${alpha})`
          ctx.fill()
        }
      }
    }

    const interval = setInterval(tick, TICK_MS)
    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-[1]" />
}

const profile = {
  name: 'Ankit Das',
  title: 'AI/Software and Full Stack Engineer',
  shortTitle: 'AI/Software Engineer',
  location: 'Sewanee, TN',
  email: 'ankit.das@sewanee.edu',
  phone: '817-301-9703',
  github: 'https://github.com/ankii08',
  linkedin: 'https://linkedin.com/in/ankitda',
  resume: '/ankit-das-resume.pdf',
  photo: '/ankit-headshot.jpeg',
}

const rotatingRoles = [
  'AI Engineer',
  'Full-Stack Engineer',
  'Geospatial Systems Builder',
  'RAG Application Developer',
] as const

const aboutParagraphs = [
  'Passionate about AI, geospatial technologies, and full-stack development. I create innovative solutions that bridge the gap between complex data and user-friendly experiences.',
  "I'm a developer with a dual focus on Mathematics and Computer Science. My work blends academic depth with practical engineering, from production RAG systems and real-time applications to cloud services and data-heavy products.",
  'With experience across AI, geospatial systems, backend infrastructure, and modern frontend development, I enjoy turning difficult technical problems into products people can actually use.',
]

const stats = [
  { value: '500+', label: 'Students impacted' },
  { value: '2026', label: 'Graduation year' },
  { value: '3.93', label: 'GPA / 4.0' },
]

const achievements = [
  'Honors Scholar (full-ride)',
  'Beecken Business Scholar (1 of 2)',
  "Dean's List (all semesters)",
  'Math Club President',
  'Sewanee Computing Society Vice President',
  'Resident Assistant',
]

const coursework = [
  'Data Structures & Algorithms',
  'Databases',
  'Computer Systems',
  'Software Development',
  'Probability and Statistics',
  'Computer Graphics',
  'Multivariable Calculus',
  'Network Theory',
  'Theory of Computation',
]

const additionalEducation = [
  {
    school: 'Universidad Carlos III de Madrid',
    program: 'Semester Abroad, Computer Science and Business',
    period: 'Jan 2025 - May 2025',
    description:
      'Studied computer science and business while gaining a broader international perspective on technology, management, and cross-cultural collaboration.',
  },
  {
    school: 'The University of Chicago Booth School of Business',
    program: 'Summer Business Scholars Program: Building the New Venture',
    period: '2024',
    description:
      'Completed this program through the Beecken Scholar opportunity, building hands-on experience in market analysis, product prototyping, marketing strategy, and startup storytelling.',
  },
]

const skillGroups = [
  {
    name: 'Languages',
    items: ['Python', 'Java', 'R', 'JavaScript', 'TypeScript', 'C++', 'PHP'],
  },
  {
    name: 'Technologies',
    items: [
      'SQL',
      'PostgreSQL',
      'PostGIS',
      'pgvector',
      'SAP HANA Cloud',
      'Pandas',
      'scikit-learn',
      'TensorFlow',
      'Spring Boot',
      'React',
      'GraphQL',
    ],
  },
  {
    name: 'AI & Cloud',
    items: [
      'LLMs (GPT-4)',
      'Embeddings',
      'Retrieval-Augmented Generation (RAG)',
      'AWS Lambda',
      'API Gateway',
      'S3',
      'Docker',
      'Kubernetes',
      'Linux',
      'Git',
      'GitHub',
    ],
  },
]

const focusCards = [
  {
    title: 'AI + RAG Systems',
    desc: 'Production-minded retrieval systems, guardrails, prompt-aware routing, and measurable latency wins.',
  },
  {
    title: 'Data-Heavy Products',
    desc: 'Geospatial apps, real-time systems, and user flows that make complex information easier to act on.',
  },
  {
    title: 'Full-Stack Delivery',
    desc: 'I like shipping across backend, frontend, infra, auth, caching, and performance rather than staying in one lane.',
  },
] as const

const experiences = [
  {
    role: 'AI & Software Engineer (Intern / Part-time)',
    company: 'TRC Companies',
    period: 'May 2025 - Present',
    location: 'Dallas, TX',
    bullets: [
      'Architected and deployed a production-ready RAG pipeline using pgvector and AWS Lambda, cutting geospatial information retrieval time by 75%.',
      'Developed dual-domain intent routing with responsible AI guardrails to filter malicious prompts and protect SAP data while keeping Utility Network operations uninterrupted.',
      'Implemented React and Python full-stack features with JWT authentication and advanced caching, reducing API costs by 60% and improving performance by 85%.',
      'Enabled AI-assisted network tracing by integrating ESRI APIs and PostGIS, reducing diagnostic time to under a minute.',
    ],
  },
  {
    role: 'Software Engineering Intern',
    company: 'Spectrum / Charter Communications',
    period: 'May 2024 - Aug 2024',
    location: 'Denver, CO',
    bullets: [
      'Migrated 6 enterprise services to Java 17 and Spring Boot 3, eliminating 10+ critical Log4j vulnerabilities and improving response times by 15%.',
      'Optimized API testing and Git workflows for the $2B+ SpectrumEnterprise.net platform, accelerating releases and cutting release defects by 20%.',
      'Patched Veracode findings and tuned PostgreSQL, Cassandra, and Redis, reducing query latency by 50%.',
    ],
  },
  {
    role: 'Software Engineering Intern',
    company: 'Digital Nepal',
    period: 'May 2023 - Aug 2023',
    location: 'Remote',
    bullets: [
      'Developed a Java and Spring Boot notification microservice that automated reminders and reduced manual effort by 30%.',
      'Implemented a comprehensive unit testing suite with 85% code coverage, reducing post-deployment bugs by 40% for the core notification service.',
    ],
  },
]

const projects = [
  {
    title: 'Tiger Bites',
    description:
      'Campus food-redistribution app adopted by 500+ students with real-time posts and secure authentication.',
    impact: ['Cut food waste by ~40%', 'Secured $8,000 fellowship funding'],
    stack: ['React', 'TypeScript', 'Supabase', 'Google Maps API'],
    repo: 'https://github.com/ankii08/Hungry-Tiger-Food-App',
  },
  {
    title: 'Campus Shuttle Tracking System',
    description: 'Real-time shuttle tracker with GPS updates every 10 seconds.',
    impact: ['Reduced average wait times by 60%', 'Scaled to 200+ users', '80% lower cost than vendor solutions'],
    stack: ['React Native', 'PostgreSQL', 'WebSockets'],
    repo: 'https://github.com/ankii08/College-Shuttle',
  },
  {
    title: 'ATS Resume Checker',
    description:
      'AI resume analyzer built with Next.js 15 and Gemini 3 Pro that extracts ATS keywords and computes match scores.',
    impact: ['Cut API costs by 90% through caching', '99.5% uptime', 'Sub-100ms responses'],
    stack: ['Next.js 15', 'TypeScript', 'Gemini AI'],
    repo: 'https://github.com/ankii08/ats-checker',
  },
  {
    title: 'AI Writing Assistant',
    description: 'Server-rendered AI drafting assistant with JWT security.',
    impact: ['Reduced initial client-side load times by 70%'],
    stack: ['Java', 'Spring Boot', 'Thymeleaf', 'GPT-4'],
    repo: 'https://github.com/ankii08/writing-assistant',
  },
  {
    title: 'Retail Sales Prediction',
    description: 'Neural network versus ARIMA/ETS baseline with time-series feature engineering.',
    impact: ['Improved forecast accuracy by 22% via tuning and walk-forward validation'],
    stack: ['R', 'Keras', 'TensorFlow'],
    repo: 'https://github.com/ankii08/Projects',
  },
  {
    title: 'DynaTrust-RAG',
    description:
      'Spatiotemporal RAG system merging vector retrieval and SQL with provenance tracking and staleness-aware routing.',
    impact: ['Sub-500ms retrieval latency', 'Source attribution built into the answer pipeline'],
    stack: ['PostgreSQL', 'PostGIS', 'pgvector', 'Python'],
    repo: 'https://github.com/ankii08/dynatrust-rag',
  },
]

const featuredProjectTitle = 'DynaTrust-RAG'
const CONTACT_NOTICE_KEY = 'ankit-contact-notice'

function SectionHeading({
  id,
  icon,
  eyebrow,
  title,
  subtitle,
}: {
  id: string
  icon: ReactNode
  eyebrow: string
  title: string
  subtitle: string
}) {
  return (
    <div id={id} className="mb-8 scroll-mt-28">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary/80 mb-3">{eyebrow}</p>
      <h2 className="font-display text-2xl md:text-3xl font-semibold flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          {icon}
        </span>
        {title}
      </h2>
      <p className="text-muted-foreground mt-3 max-w-2xl">{subtitle}</p>
    </div>
  )
}

export default function App() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [contactNotice, setContactNotice] = useState<'idle' | 'draft-opened'>('idle')
  const hydrated = useHydrated()
  const { displayText: roleText, roleIndex } = useTypewriterRotation(rotatingRoles)
  const featuredProject = projects.find((project) => project.title === featuredProjectTitle) ?? projects[0]
  const secondaryProjects = projects.filter((project) => project.title !== featuredProject.title)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedNotice = window.sessionStorage.getItem(CONTACT_NOTICE_KEY)
    if (savedNotice === 'draft-opened') {
      setContactNotice('draft-opened')
    }
  }, [])

  useHomeSeo({
    lang: 'en',
    title: 'Ankit Das | AI/Software and Full Stack Engineer',
    description:
      'Portfolio of Ankit Das: AI/software and full stack engineer building geospatial AI, RAG systems, and user-focused products.',
    canonical: 'https://ankitd.com/',
    locale: 'en_US',
  })

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(profile.email)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  const sendMail = (e: React.FormEvent) => {
    e.preventDefault()
    const subject = encodeURIComponent(`Portfolio message from ${form.name || 'a visitor'}`)
    const body = encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`)
    setContactNotice('draft-opened')
    window.sessionStorage.setItem(CONTACT_NOTICE_KEY, 'draft-opened')
    setForm({ name: '', email: '', message: '' })
    window.location.href = `mailto:${profile.email}?subject=${subject}&body=${body}`
  }

  return (
    <main className="min-h-screen bg-background bg-[length:24px_24px] [background-image:radial-gradient(circle,hsl(var(--dot-grid))_1px,transparent_1px)]">
      <a
        href="#home"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:font-medium"
      >
        Skip to content
      </a>

      <header id="home" className="relative overflow-hidden scroll-mt-24">
        <GridSnakes />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent" />
        <div
          className="absolute top-0 right-[max(0px,calc(50%-44rem))] w-[560px] h-[560px] rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 hidden sm:block"
          style={{ backgroundColor: 'hsl(var(--hero-orb-primary))' }}
        />
        <div
          className="absolute bottom-0 left-[max(0px,calc(50%-44rem))] w-[520px] h-[520px] rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 hidden sm:block"
          style={{ backgroundColor: 'hsl(var(--hero-orb-accent))' }}
        />

        <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-18 md:pt-34 md:pb-24">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center">
            <AnimatedSection>
              <p className="text-lg text-muted-foreground mt-1">Hi, I&apos;m Ankit</p>
              <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mt-2 leading-tight min-h-[8rem] md:min-h-[10rem]">
                <span className="text-gradient-theme">{hydrated ? roleText : rotatingRoles[0]}</span>
                <span className="inline-block w-[3px] h-[0.85em] bg-primary ml-1 rounded-sm translate-y-[2px]" style={{ animation: 'blink 1s step-end infinite' }} />
                <br />
                <span className="text-foreground">who builds useful AI products.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mt-6">
                {aboutParagraphs[0]}
              </p>

              <div className="flex flex-wrap gap-3 mt-6">
                {rotatingRoles.map((role, index) => (
                  <span
                    key={role}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 backdrop-blur-sm ${
                      index === roleIndex
                        ? 'border border-[#20d6ee] bg-[#20d6ee]/15 text-foreground scale-105'
                        : 'border border-[#20d6ee]/30 bg-background/80 text-muted-foreground'
                    }`}
                  >
                    {role}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 mt-8">
                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:brightness-110 transition-all"
                >
                  <Mail className="w-4 h-4" />
                  Get In Touch
                </a>
                <a
                  href={profile.resume}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-border bg-card/80 hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <Download className="w-4 h-4" />
                  View Resume
                </a>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-border bg-card/80 hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <Copy className="w-4 h-4" />
                  {copyState === 'copied' ? 'Email Copied' : copyState === 'error' ? 'Copy Failed' : 'Copy Email'}
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('openChat'))}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  Ask AI Ankit
                </button>
              </div>

              <div className="mt-8">
                <p className="text-sm text-muted-foreground mb-3">Follow me:</p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={profile.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    <Github className="w-4 h-4" />
                    GitHub
                  </a>
                  <a
                    href={profile.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    <Linkedin className="w-4 h-4 text-[hsl(var(--linkedin))]" />
                    LinkedIn
                  </a>
                </div>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.1}>
              <div className="w-full max-w-[26rem] lg:ml-auto rounded-[2rem] border border-border bg-card/75 backdrop-blur-md p-4 shadow-2xl">
                <div className="aspect-[4/4.6] max-h-[34rem] overflow-hidden rounded-[1.5rem] border border-border/60">
                  <img
                    src={profile.photo}
                    alt="Ankit Das"
                    className="w-full h-full object-cover object-top"
                    width={900}
                    height={1125}
                  />
                </div>
                <div className="mt-5 px-2 pb-2">
                  <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <UserRound className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="font-display text-xl font-semibold">{profile.name}</p>
                      <p className="text-sm text-muted-foreground">{profile.shortTitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4 text-primary" />
                    {profile.location}
                  </div>
                  <a href="#about" className="inline-flex items-center gap-2 mt-5 text-sm text-primary hover:underline">
                    Scroll down
                    <ArrowUpRight className="w-4 h-4 rotate-90" />
                  </a>
                </div>
              </div>
            </AnimatedSection>
          </div>

          <AnimatedSection delay={0.15} className="mt-12">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border bg-card/75 backdrop-blur-sm px-5 py-5">
                  <p className="font-display text-3xl font-bold text-gradient-theme">{stat.value}</p>
                  <p className="text-sm text-muted-foreground mt-2">{stat.label}</p>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </header>

      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-6">
          <AnimatedSection>
            <SectionHeading
              id="about"
              icon={<UserRound className="w-5 h-5" />}
              eyebrow="About"
              title="Building the Future with AI & Technology"
              subtitle="Passionate about creating innovative solutions that make a difference."
            />
            <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-6">
              <div className="rounded-3xl border border-border bg-card/80 p-7 space-y-5">
                {aboutParagraphs.slice(1).map((paragraph) => (
                  <p key={paragraph} className="text-lg leading-8 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
              <div
                id="education"
                className="scroll-mt-28 rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-transparent to-accent/10 p-7"
              >
                <div className="flex items-center gap-3 mb-5">
                  <GraduationCap className="w-5 h-5 text-primary" />
                  <h3 className="font-display text-xl font-semibold">Education Snapshot</h3>
                </div>
                <p className="text-sm font-medium text-primary">The University of the South</p>
                <p className="font-display text-xl font-semibold mt-1">Dual B.S. in Mathematics and Computer Science</p>
                <div className="grid grid-cols-3 gap-3 mt-5">
                  <div className="rounded-2xl border border-border bg-background/70 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">GPA</p>
                    <p className="font-display text-2xl font-bold mt-2">3.93</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Grad</p>
                    <p className="font-display text-2xl font-bold mt-2">2026</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Base</p>
                    <p className="font-display text-base font-bold mt-2">Sewanee</p>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-border/70">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground mb-4">
                    Additional Programs
                  </p>
                  <div className="space-y-3">
                    {additionalEducation.map((item) => (
                      <div key={item.school} className="rounded-2xl border border-border bg-background/70 p-4">
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-medium text-primary">{item.school}</p>
                          <p className="font-medium">{item.program}</p>
                          <p className="text-sm text-muted-foreground">{item.period}</p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-3 leading-6">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-4 mt-6">
            {focusCards.map((card, index) => (
              <AnimatedSection key={card.title} delay={0.05 + index * 0.05}>
                <div className="rounded-2xl border border-border bg-card/75 p-5 h-full">
                  <p className="text-sm font-medium text-primary">{card.title}</p>
                  <p className="text-sm text-muted-foreground mt-3 leading-6">{card.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-6">
          <AnimatedSection>
            <SectionHeading
              id="skills"
              icon={<TerminalSquare className="w-5 h-5" />}
              eyebrow="Skills"
              title="Skills & Technologies"
              subtitle="The tools and technologies I use to bring ideas to life."
            />
          </AnimatedSection>
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
            <AnimatedSection delay={0.05}>
              <div className="rounded-3xl border border-border bg-card/85 p-7">
                <h3 className="font-display text-xl font-semibold mb-4">Key Achievements</h3>
                <ul className="space-y-3">
                  {achievements.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-muted-foreground">
                      <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <h3 className="font-display text-xl font-semibold mt-8 mb-4">Relevant Coursework</h3>
                <div className="flex flex-wrap gap-2">
                  {coursework.map((course) => (
                    <span key={course} className="px-3 py-2 rounded-full text-sm border border-border bg-background/70">
                      {course}
                    </span>
                  ))}
                </div>
              </div>
            </AnimatedSection>

            <div className="grid gap-5">
              {skillGroups.map((group, index) => (
                <AnimatedSection key={group.name} delay={0.08 + index * 0.05}>
                  <div className="rounded-3xl border border-border bg-card/85 p-6">
                    <h3 className="font-display text-xl font-semibold mb-4">{group.name}</h3>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((item) => {
                        const icon = getTechIcon(item)
                        return (
                          <span key={item} className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2 text-sm">
                            {icon ? (
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill={icon.color} aria-hidden="true">
                                <path d={icon.path} />
                              </svg>
                            ) : null}
                            {item}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-6">
          <AnimatedSection>
            <SectionHeading
              id="experience"
              icon={<Briefcase className="w-5 h-5" />}
              eyebrow="Experience"
              title="Professional Experience"
              subtitle="My journey building impactful solutions and growing as an engineer."
            />
          </AnimatedSection>
          <div className="space-y-6">
            {experiences.map((item, index) => (
              <AnimatedSection key={item.company} delay={0.06 * index}>
                <article className="rounded-3xl border border-border bg-card/85 p-7">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
                    <div>
                      <p className="text-sm font-medium text-primary">{item.company}</p>
                      <h3 className="font-display text-2xl font-semibold mt-1">{item.role}</h3>
                      <p className="text-muted-foreground mt-2">{item.location}</p>
                    </div>
                    <span className="text-sm text-muted-foreground rounded-full border border-border px-4 py-2 h-fit">
                      {item.period}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {item.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 text-muted-foreground">
                        <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-6">
          <AnimatedSection>
            <SectionHeading
              id="projects"
              icon={<Sparkles className="w-5 h-5" />}
              eyebrow="Projects"
              title="Featured Projects"
              subtitle="Some things I've built and learned from along the way."
            />
          </AnimatedSection>
          <div className="grid md:grid-cols-2 gap-6">
            <AnimatedSection className="md:col-span-2" delay={0.02}>
              <article className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-accent/12 p-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div className="max-w-3xl">
                    <p className="text-sm font-medium text-primary">Featured Build</p>
                    <h3 className="font-display text-3xl font-semibold mt-2">{featuredProject.title}</h3>
                    <p className="text-muted-foreground mt-4 leading-7">
                      {featuredProject.description} This is the project that best captures how I like to work: data-aware backend design, AI-assisted retrieval, and practical safeguards against low-trust answers.
                    </p>
                    {featuredProject.repo ? (
                      <a
                        href={featuredProject.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-full border border-primary/30 bg-background/70 text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Github className="w-4 h-4" />
                        View Code
                      </a>
                    ) : null}
                    <div className="flex flex-wrap gap-2 mt-5">
                      {featuredProject.stack.map((item) => {
                        const icon = getTechIcon(item)
                        return (
                          <span key={item} className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2 text-sm">
                            {icon ? (
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill={icon.color} aria-hidden="true">
                                <path d={icon.path} />
                              </svg>
                            ) : null}
                            {item}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 min-w-0 lg:w-[18rem]">
                    {featuredProject.impact.map((item) => (
                      <div key={item} className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </AnimatedSection>

            {secondaryProjects.map((project, index) => (
              <AnimatedSection key={project.title} delay={0.08 + 0.05 * index}>
                <article className="h-full rounded-3xl border border-border bg-card/85 p-7 flex flex-col hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-2xl font-semibold">{project.title}</h3>
                    {project.repo ? (
                      <a
                        href={project.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/15 transition-colors"
                        aria-label={`Open ${project.title} repository`}
                      >
                        <ArrowUpRight className="w-5 h-5" />
                      </a>
                    ) : (
                      <span className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <ArrowUpRight className="w-5 h-5" />
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-4">{project.description}</p>
                  <div className="mt-5">
                    <p className="text-sm font-medium text-primary mb-2">Key Impact</p>
                    <ul className="space-y-2">
                      {project.impact.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-muted-foreground">
                          <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-6">
                    {project.stack.map((item) => {
                      const icon = getTechIcon(item)
                      return (
                        <span key={item} className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2 text-sm">
                          {icon ? (
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill={icon.color} aria-hidden="true">
                              <path d={icon.path} />
                            </svg>
                          ) : null}
                          {item}
                        </span>
                      )
                    })}
                  </div>
                  {project.repo ? (
                    <a
                      href={project.repo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-primary hover:underline"
                    >
                      <Github className="w-4 h-4" />
                      View Code
                    </a>
                  ) : null}
                </article>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <footer id="contact" className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-6">
          <AnimatedSection>
            <SectionHeading
              id="contact-heading"
              icon={<Send className="w-5 h-5" />}
              eyebrow="Contact"
              title="Let's Connect"
              subtitle="Ready to start a conversation? I'd love to hear from you."
            />
          </AnimatedSection>
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
            <AnimatedSection delay={0.05}>
              <div className="rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-accent/12 p-8">
                <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary/80 mb-4">Get In Touch</p>
                <h3 className="font-display text-3xl font-bold">Let's discuss opportunities and ideas</h3>
                <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-2 mt-6 text-lg text-primary hover:underline">
                  <Mail className="w-5 h-5" />
                  {profile.email}
                </a>
                <p className="text-sm text-muted-foreground mt-6 mb-3">Follow me:</p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={profile.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    <Github className="w-4 h-4" />
                    GitHub
                  </a>
                  <a
                    href={profile.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/80 hover:border-primary/40 transition-colors"
                  >
                    <Linkedin className="w-4 h-4 text-[hsl(var(--linkedin))]" />
                    LinkedIn
                  </a>
                </div>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.1}>
              <form onSubmit={sendMail} className="rounded-[2rem] border border-border bg-card/85 p-8">
                <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary/80 mb-4">Send a Message</p>
                <h3 className="font-display text-2xl font-bold">I'll get back to you soon</h3>
                {contactNotice === 'draft-opened' ? (
                  <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-muted-foreground">
                    Your email app opened with the draft message. Send it there to complete your message.
                  </div>
                ) : null}
                <div className="grid sm:grid-cols-2 gap-4 mt-6">
                  <label className="block">
                    <span className="text-sm font-medium">Name *</span>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Your name"
                      required
                      className="w-full mt-2 px-4 py-3 rounded-2xl bg-background border border-border focus:outline-none focus:border-primary/50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Email *</span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="your.email@example.com"
                      required
                      className="w-full mt-2 px-4 py-3 rounded-2xl bg-background border border-border focus:outline-none focus:border-primary/50"
                    />
                  </label>
                </div>
                <label className="block mt-4">
                  <span className="text-sm font-medium">Message *</span>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                    placeholder="Your message..."
                    required
                    rows={6}
                    className="w-full mt-2 px-4 py-3 rounded-2xl bg-background border border-border focus:outline-none focus:border-primary/50 resize-none"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 mt-6 px-5 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:brightness-110 transition-all"
                >
                  <Send className="w-4 h-4" />
                  Send Message
                </button>
              </form>
            </AnimatedSection>
          </div>
          <p className="mt-10 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} {profile.name}
          </p>
        </div>
      </footer>
    </main>
  )
}
