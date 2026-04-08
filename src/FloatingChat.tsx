import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  X,
  Send,
  Loader2,
  Briefcase,
  Rocket,
  HelpCircle,
  Mail,
  ChevronDown,
  FileText,
  Mic,
  MessageSquare,
  PhoneOff,
  Sparkles,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useNavigate, useLocation } from 'react-router-dom'
import { useVoiceMode } from './useVoiceMode'
import VoiceOrb from './VoiceOrb'

type RagSource = {
  article_id: string
  section_id: string
  section_anchor: string
  page_path_en: string
  page_path_es: string
  article_slug_en: string
  article_slug_es: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  ragSources?: RagSource[]
  ragDegraded?: boolean
}

const TEXT = {
  title: 'Ask AI Ankit',
  subtitle: 'Voice + chat assistant for Ankit’s portfolio',
  greeting:
    "I'm Ankit's AI portfolio assistant. Ask about his experience, projects, skills, or what kinds of engineering roles he's a strong fit for.",
  placeholder: "Ask about Ankit's work...",
  typingIndicator: 'Thinking...',
  offline: 'You appear to be offline right now. Please reconnect and try again.',
  error: 'The AI assistant is unavailable right now. Please try again shortly.',
  ragDegraded: 'Answering without full retrieval context right now.',
  contactCtaTitle: 'Want to reach Ankit directly?',
  voice: {
    start: 'Start voice mode',
    stop: 'End voice mode',
    switchToText: 'Back to text',
    connecting: 'Connecting voice session...',
    listening: 'Listening...',
    thinking: 'Thinking...',
    searching: 'Searching portfolio context...',
    speaking: 'Speaking...',
    unsupported: 'Voice mode is not supported in this browser.',
    micDenied: 'Microphone access is blocked.',
    rateLimited: 'Voice limit reached for today.',
    connection: 'Voice mode is temporarily unavailable.',
  },
  prompts: [
    { icon: Briefcase, label: '30-second summary', query: 'What should I know about Ankit in 30 seconds?' },
    { icon: Rocket, label: 'AI + RAG work', query: 'Tell me about his AI and RAG experience.' },
    { icon: HelpCircle, label: 'Best projects', query: 'Which projects show the strongest product thinking?' },
    { icon: Mail, label: 'Role fit', query: 'What kind of roles is he a fit for?' },
  ],
} as const

const STORAGE_KEY = 'ankit-chat'

const SOURCE_LABELS: Record<string, string> = {
  about: 'About',
  education: 'Education',
  'education-programs': 'Education Programs',
  'experience-trc': 'TRC Companies',
  'experience-spectrum': 'Spectrum / Charter',
  'experience-digital-nepal': 'Digital Nepal',
  'project-dynatrust-rag': 'DynaTrust-RAG',
  'project-tiger-bites': 'Tiger Bites',
  'project-shuttle': 'Campus Shuttle Tracking',
  'project-ats-resume-checker': 'ATS Resume Checker',
  'project-ai-writing-assistant': 'AI Writing Assistant',
  'project-retail-sales-prediction': 'Retail Sales Prediction',
  skills: 'Skills',
  contact: 'Contact',
}

function loadSession() {
  if (typeof window === 'undefined') {
    return {
      messages: [{ role: 'assistant', content: TEXT.greeting }] as Message[],
      sessionId: 'server-session',
      showPrompts: true,
    }
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (Array.isArray(data.messages) && data.messages.length > 0 && typeof data.sessionId === 'string') {
        const hasUserMessages = data.messages.some((message: Message) => message.role === 'user')
        return { messages: data.messages as Message[], sessionId: data.sessionId as string, showPrompts: !hasUserMessages }
      }
    }
  } catch {
    // ignore storage errors
  }

  return {
    messages: [{ role: 'assistant', content: TEXT.greeting }] as Message[],
    sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    showPrompts: true,
  }
}

function saveSession(messages: Message[], sessionId: string) {
  try {
    const clean = messages.filter((message) => message.content !== '')
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: clean, sessionId }))
  } catch {
    // ignore storage errors
  }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

function autoCloseMarkdown(text: string) {
  const boldCount = (text.match(/\*\*/g) || []).length
  if (boldCount % 2 === 1) return `${text}**`
  return text
}

function linkifyUrls(text: string) {
  return text.replace(
    /(https?:\/\/[^\s)]+|(?:[\w-]+\.)+(?:io|com|org|net|dev|app|edu)(?:\/[^\s)]*)?)/g,
    (match, _url, offset) => {
      const before = text.slice(Math.max(0, offset - 200), offset)
      if (/\]\($/.test(before) || /\[[^\]]*$/.test(before)) return match
      return `[${match}](${match.startsWith('http') ? match : `https://${match}`})`
    }
  )
}

function sourceLabel(source: RagSource) {
  return SOURCE_LABELS[source.article_id] || source.article_id.replace(/-/g, ' ')
}

export default function FloatingChat() {
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(() => (typeof window !== 'undefined' ? window.location.hash === '#chat' : false))
  const [mode, setMode] = useState<'text' | 'voice'>('text')
  const [session] = useState(loadSession)
  const [messages, setMessages] = useState<Message[]>(session.messages)
  const [sessionId] = useState(session.sessionId)
  const [showPrompts, setShowPrompts] = useState(session.showPrompts)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  const voiceMode = useVoiceMode()
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const fullTextRef = useRef('')
  const drainPosRef = useRef(0)
  const isStreamingRef = useRef(false)
  const drainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingRagSourcesRef = useRef<RagSource[]>([])
  const pendingRagDegradedRef = useRef(false)

  useEffect(() => {
    const handleOpen = () => setIsOpen(true)
    window.addEventListener('openChat', handleOpen)
    return () => window.removeEventListener('openChat', handleOpen)
  }, [])

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#chat') setIsOpen(true)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chatToggle', { detail: { open: isOpen } }))
  }, [isOpen])

  useEffect(() => {
    if (!isLoading) saveSession(messages, sessionId)
  }, [messages, isLoading, sessionId])

  useEffect(() => {
    if (!isOpen || !isAtBottomRef.current) return
    messagesEndRef.current?.scrollIntoView({
      behavior: isLoading || isStreaming ? 'instant' : 'smooth',
      block: 'end',
    })
  }, [messages, isLoading, isStreaming, isOpen])

  useEffect(() => {
    if (isOpen && mode === 'text' && !isMobile) {
      inputRef.current?.focus()
    }
  }, [isOpen, isMobile, mode])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (drainTimerRef.current) clearInterval(drainTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const container = chatContainerRef.current?.querySelector('.custom-scrollbar')
    if (!container) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 40
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [isOpen])

  useEffect(() => {
    if (isMobile && isOpen) {
      const scrollY = window.scrollY
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.top = `-${scrollY}px`

      const preventScroll = (event: TouchEvent) => {
        if (!(event.target as HTMLElement).closest('.custom-scrollbar')) event.preventDefault()
      }

      document.addEventListener('touchmove', preventScroll, { passive: false })
      return () => {
        document.removeEventListener('touchmove', preventScroll)
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.top = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isMobile, isOpen])

  const userMessageCount = messages.filter((message) => message.role === 'user').length

  const getVoiceStatusText = () => {
    const statusMap: Record<string, string> = {
      connecting: TEXT.voice.connecting,
      listening: TEXT.voice.listening,
      thinking: voiceMode.isSearching ? TEXT.voice.searching : TEXT.voice.thinking,
      speaking: TEXT.voice.speaking,
      error: voiceMode.state.error
        ? TEXT.voice[voiceMode.state.error as keyof typeof TEXT.voice] || TEXT.voice.connection
        : TEXT.voice.connection,
    }

    return statusMap[voiceMode.state.status] || ''
  }

  const startDrain = () => {
    if (drainTimerRef.current) return

    drainTimerRef.current = setInterval(() => {
      const full = fullTextRef.current
      const pos = drainPosRef.current

      if (pos < full.length) {
        drainPosRef.current = pos + 1
        const currentText = full.slice(0, drainPosRef.current)
        const sources = pendingRagSourcesRef.current
        const degraded = pendingRagDegradedRef.current

        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            role: 'assistant',
            content: currentText,
            ragSources: sources.length > 0 ? sources : undefined,
            ragDegraded: degraded || undefined,
          },
        ])
      } else if (!isStreamingRef.current) {
        if (drainTimerRef.current) {
          clearInterval(drainTimerRef.current)
          drainTimerRef.current = null
        }
        setIsStreaming(false)
      }
    }, 22)
  }

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim()
    if (!text || isLoading) return

    setInput('')
    setShowPrompts(false)
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setIsLoading(true)

    fullTextRef.current = ''
    drainPosRef.current = 0
    isStreamingRef.current = false
    pendingRagSourcesRef.current = []
    pendingRagDegradedRef.current = false
    if (drainTimerRef.current) {
      clearInterval(drainTimerRef.current)
      drainTimerRef.current = null
    }

    try {
      if (!navigator.onLine) throw new Error('offline')

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: text }].filter(
            (message) => message.role !== 'assistant' || message.content !== TEXT.greeting
          ),
          lang: 'en',
          sessionId,
          currentPage: location.pathname,
        }),
      })

      if (!response.ok) throw new Error('request_failed')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('reader_missing')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''
      let currentEventType = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIndex
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)

          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7)
            continue
          }

          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue

          try {
            const data = JSON.parse(line.slice(6))

            if (currentEventType === 'rag-sources') {
              pendingRagSourcesRef.current = data as RagSource[]
              currentEventType = ''
              continue
            }

            if (currentEventType === 'rag-status') {
              pendingRagDegradedRef.current = data.status === 'degraded'
              currentEventType = ''
              continue
            }

            currentEventType = ''

            if (typeof data.text === 'string') {
              if (data.replace) {
                fullText = data.text
                fullTextRef.current = data.text
                drainPosRef.current = data.text.length
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  {
                    role: 'assistant',
                    content: data.text,
                    ragSources: pendingRagSourcesRef.current.length > 0 ? pendingRagSourcesRef.current : undefined,
                    ragDegraded: pendingRagDegradedRef.current || undefined,
                  },
                ])
              } else {
                if (!isStreamingRef.current) {
                  isStreamingRef.current = true
                  setIsStreaming(true)
                }

                fullText += data.text
                fullTextRef.current = fullText
                startDrain()
              }
            }
          } catch {
            currentEventType = ''
          }
        }
      }

      isStreamingRef.current = false

      if (!fullText) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: TEXT.error },
        ])
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return

      fullTextRef.current = ''
      drainPosRef.current = 0
      if (drainTimerRef.current) {
        clearInterval(drainTimerRef.current)
        drainTimerRef.current = null
      }
      setIsStreaming(false)
      isStreamingRef.current = false

      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: !navigator.onLine ? TEXT.offline : TEXT.error },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartVoice = () => {
    setMode('voice')
    voiceMode.start(messages, 'en', sessionId, location.pathname)
  }

  const handleStopVoice = () => {
    const transcript = voiceMode.state.transcript
    if (transcript.length > 0) {
      setMessages((prev) => [
        ...prev,
        ...transcript.map((item) => ({
          role: item.role,
          content: item.text,
        })),
      ])
      setShowPrompts(false)
    }
    voiceMode.stop()
    setMode('text')
  }

  const navigateToSource = (source: RagSource) => {
    const targetPath = source.page_path_en || '/'
    const targetHash = source.section_anchor || ''
    const fullTarget = `${targetPath}${targetHash}`

    if (location.pathname === targetPath && targetHash) {
      const element = document.querySelector(targetHash)
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: 'instant' })
        element.classList.remove('hash-highlight')
        void element.offsetWidth
        element.classList.add('hash-highlight')
        element.addEventListener('animationend', () => element.classList.remove('hash-highlight'), { once: true })
      }
    } else {
      if (isMobile) setIsOpen(false)
      navigate(fullTarget)
    }
  }

  const canStartVoice = !isLoading && !isStreaming && voiceMode.isSupported

  return (
    <>
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        onClick={() => {
          if (isOpen) abortRef.current?.abort()
          setIsOpen((value) => !value)
        }}
        className="fixed z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow"
        style={{
          bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px) + 0.5rem)',
          right: 'max(1.5rem, env(safe-area-inset-right, 0px) + 0.5rem)',
        }}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full rounded-full bg-gradient-theme flex items-center justify-center"
            >
              <X className="w-6 h-6 text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full h-full"
            >
              <img
                src="/ankit-headshot.jpeg"
                alt="Chat with AI Ankit"
                className="w-full h-full rounded-full object-cover"
                width={56}
                height={56}
              />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-primary"
                animate={{ scale: [1, 1.15, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-background rounded-full" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            ref={chatContainerRef}
            role="dialog"
            aria-modal="true"
            aria-label="AI chat with Ankit"
            initial={isMobile ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
            animate={isMobile ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isMobile ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
            transition={isMobile ? { duration: 0.2, ease: 'easeOut' } : { type: 'spring', stiffness: 300, damping: 30 }}
            className={`fixed z-50 flex flex-col bg-card border-border shadow-2xl ${
              isMobile
                ? 'inset-0 h-dvh rounded-none border-0 overscroll-contain'
                : 'bottom-24 right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[540px] max-h-[calc(100vh-8rem)] rounded-2xl border overflow-hidden'
            }`}
          >
            <div
              className="p-4 border-b border-border bg-gradient-theme-10 flex items-center justify-between"
              style={isMobile ? { paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' } : undefined}
            >
              <div className="flex items-center gap-3">
                <img
                  src="/ankit-headshot.jpeg"
                  alt="Ankit avatar"
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20"
                  width={40}
                  height={40}
                />
                <div>
                  <h3 className="font-display font-semibold text-foreground">{TEXT.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {mode === 'voice' ? getVoiceStatusText() || TEXT.subtitle : TEXT.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {mode === 'voice' ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center"
                  >
                    <Mic className="w-3 h-3 text-red-400" />
                  </motion.div>
                ) : null}
                {isMobile ? (
                  <button
                    onClick={() => {
                      if (mode === 'voice') handleStopVoice()
                      abortRef.current?.abort()
                      setIsOpen(false)
                    }}
                    className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Close chat"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                ) : null}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {mode === 'text' ? (
                <motion.div
                  key="text-mode"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar overscroll-contain ${isMobile ? 'pb-2' : ''}`}
                >
                  {messages.map((message, index) =>
                    message.role === 'assistant' && message.content === '' ? null : (
                      <motion.div
                        key={`${message.role}-${index}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className="max-w-[86%]">
                          {message.role === 'assistant' && message.ragDegraded ? (
                            <div className={`mb-1 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 ${isMobile ? 'text-xs' : 'text-[11px]'}`}>
                              {TEXT.ragDegraded}
                            </div>
                          ) : null}

                          <div
                            className={`px-4 py-2.5 rounded-2xl leading-relaxed ${
                              message.role === 'user'
                                ? 'bg-gradient-theme text-white rounded-br-md'
                                : 'bg-muted text-foreground rounded-bl-md'
                            } ${isMobile ? 'text-base' : 'text-sm'} ${
                              isStreaming && index === messages.length - 1 && message.role === 'assistant'
                                ? 'streaming-cursor'
                                : ''
                            }`}
                          >
                            {message.role === 'assistant' ? (
                              <ReactMarkdown
                                components={{
                                  strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
                                  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                                  a: ({ href, children }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary underline hover:text-primary/80 transition-colors"
                                    >
                                      {children}
                                    </a>
                                  ),
                                }}
                              >
                                {linkifyUrls(
                                  isStreaming && index === messages.length - 1
                                    ? autoCloseMarkdown(message.content)
                                    : message.content
                                )}
                              </ReactMarkdown>
                            ) : (
                              message.content
                            )}
                          </div>

                          {message.role === 'assistant' && message.ragSources && message.ragSources.length > 0 && !isLoading && !isStreaming ? (
                            <div className="flex flex-wrap gap-1.5 mt-2 px-1">
                              {message.ragSources.map((source, sourceIndex) => (
                                <button
                                  key={`${source.article_id}-${source.section_id}-${sourceIndex}`}
                                  onClick={() => navigateToSource(source)}
                                  className={`flex items-center gap-1.5 rounded-full font-medium text-left bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40 active:bg-primary/30 transition-colors duration-200 ${
                                    isMobile ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[10px]'
                                  }`}
                                >
                                  <FileText className="w-3 h-3 shrink-0" />
                                  {sourceLabel(source)}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </motion.div>
                    )
                  )}

                  {showPrompts && !isLoading ? (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45 }}
                      className={`flex flex-wrap gap-2 pt-2 ${isMobile ? 'gap-2.5' : ''}`}
                    >
                      {TEXT.prompts.map((prompt) => {
                        const Icon = prompt.icon
                        return (
                          <button
                            key={prompt.label}
                            onClick={() => sendMessage(prompt.query)}
                            className={`flex items-center gap-1.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40 active:bg-primary/30 transition-colors duration-200 ${
                              isMobile ? 'px-4 py-2.5 text-sm min-h-[44px]' : 'px-3 py-1.5 text-xs'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {prompt.label}
                          </button>
                        )
                      })}
                    </motion.div>
                  ) : null}

                  {userMessageCount >= 2 && !isLoading ? (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="pt-3">
                      <div className="p-3 rounded-xl bg-gradient-theme-10 border border-primary/20 text-center">
                        <p className="text-sm font-medium text-foreground mb-2">{TEXT.contactCtaTitle}</p>
                        <a
                          href="mailto:ankit.das@sewanee.edu"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-theme-r text-white text-sm font-medium hover:brightness-110 transition-all"
                        >
                          <Mail className="w-4 h-4" />
                          ankit.das@sewanee.edu
                        </a>
                      </div>
                    </motion.div>
                  ) : null}

                  {isLoading && messages[messages.length - 1]?.content === '' ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                      <div className={`bg-muted px-4 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-2 ${isMobile ? 'py-3' : ''}`}>
                        <Loader2 className={`text-muted-foreground animate-spin ${isMobile ? 'w-5 h-5' : 'w-4 h-4'}`} />
                        <span className={`text-muted-foreground ${isMobile ? 'text-sm' : 'text-xs'}`}>
                          {TEXT.typingIndicator}
                        </span>
                      </div>
                    </motion.div>
                  ) : null}

                  <div ref={messagesEndRef} />
                </motion.div>
              ) : (
                <motion.div
                  key="voice-mode"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 flex items-center justify-center overflow-hidden"
                >
                  <VoiceOrb
                    status={voiceMode.state.status}
                    getInputLevel={voiceMode.getInputLevel}
                    getOutputLevel={voiceMode.getOutputLevel}
                    remainingSeconds={voiceMode.state.remainingSeconds}
                    statusText={getVoiceStatusText()}
                    transcript={undefined}
                    isMobile={isMobile}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {mode === 'voice' && voiceMode.voiceSources.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-1.5 px-4 py-2 border-t border-border/50 bg-card/80">
                {voiceMode.voiceSources.map((source, index) => (
                  <button
                    key={`voice-${source.article_id}-${index}`}
                    onClick={() => navigateToSource(source)}
                    className={`flex items-center gap-1.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40 active:bg-primary/30 transition-colors duration-200 ${
                      isMobile ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[10px]'
                    }`}
                  >
                    <FileText className="w-3 h-3 shrink-0" />
                    {sourceLabel(source)}
                  </button>
                ))}
              </div>
            ) : null}

            <div
              className="p-4 border-t border-border bg-card"
              style={isMobile ? { paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' } : undefined}
            >
              {mode === 'text' ? (
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder={TEXT.placeholder}
                    aria-label={TEXT.placeholder}
                    disabled={isLoading}
                    enterKeyHint="send"
                    autoComplete="off"
                    autoCorrect="off"
                    className={`flex-1 px-4 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50 ${
                      isMobile ? 'py-3 text-base' : 'py-2.5 text-sm'
                    }`}
                  />

                  {canStartVoice ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleStartVoice}
                      disabled={isLoading || isStreaming}
                      aria-label={TEXT.voice.start}
                      title={TEXT.voice.start}
                      className={`rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 disabled:opacity-50 transition-colors ${
                        isMobile ? 'w-12 h-12' : 'w-10 h-10'
                      }`}
                    >
                      <Mic className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
                    </motion.button>
                  ) : null}

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => sendMessage()}
                    disabled={isLoading || !input.trim()}
                    aria-label="Send message"
                    className={`rounded-xl bg-gradient-theme flex items-center justify-center text-white disabled:opacity-50 transition-opacity ${
                      isMobile ? 'w-12 h-12' : 'w-10 h-10'
                    }`}
                  >
                    <Send className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
                  </motion.button>
                </div>
              ) : (
                <div className="flex gap-2 justify-center">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStopVoice}
                    aria-label={TEXT.voice.switchToText}
                    className={`rounded-xl bg-muted border border-border flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors ${
                      isMobile ? 'px-4 py-3 text-sm' : 'px-3 py-2.5 text-xs'
                    }`}
                  >
                    <MessageSquare className={isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                    {TEXT.voice.switchToText}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStopVoice}
                    aria-label={TEXT.voice.stop}
                    className={`rounded-xl bg-red-500/15 border border-red-500/20 flex items-center gap-2 text-red-300 hover:bg-red-500/20 transition-colors ${
                      isMobile ? 'px-4 py-3 text-sm' : 'px-3 py-2.5 text-xs'
                    }`}
                  >
                    <PhoneOff className={isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                    {TEXT.voice.stop}
                  </motion.button>
                </div>
              )}

              {mode === 'text' ? (
                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-primary" />
                    Text + voice portfolio assistant
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate('/#contact')}
                    className="hover:text-primary transition-colors"
                  >
                    Contact
                  </button>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
