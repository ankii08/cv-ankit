import OpenAI from 'openai'
import { Langfuse } from 'langfuse'
import { waitUntil } from '@vercel/functions'
import SYSTEM_PROMPT_FALLBACK from '../chatbot-prompt.txt'
import {
  calcCost, isRagEnabled, formatChunksForContext,
  searchPortfolio, filterSourcesByResponse, detectMentionedArticles,
  HOME_SOURCE, classifyIntent, sendJailbreakAlert,
  containsFingerprint, LEAK_RESPONSE,
  shouldRedirectOffTopic, buildOffTopicReply, buildJailbreakReply, isJailbreakAttempt,
} from './_shared/rag.js'
import { getSystemPrompt } from './_shared/prompt.js'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini'
const OPENAI_ROUTER_MODEL = process.env.OPENAI_ROUTER_MODEL || OPENAI_CHAT_MODEL
const OPENAI_SCORING_MODEL = process.env.OPENAI_SCORING_MODEL || OPENAI_CHAT_MODEL

// ---------------------------------------------------------------------------
// currentPage sanitization — validated before system prompt injection
// Only allow strings that look like valid URL pathnames (no newlines, no injection)
// ---------------------------------------------------------------------------

const PAGE_PATH_RE = /^\/[a-z0-9\-_./]*$/i
function sanitizePage(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length <= 200 && PAGE_PATH_RE.test(trimmed) ? trimmed : null
}

// ---------------------------------------------------------------------------
// Chat rate limiting via Supabase (30 requests per IP per hour)
// Fails open if Supabase is not configured
// ---------------------------------------------------------------------------

const CHAT_MAX_REQUESTS = 30
const CHAT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

async function checkChatRateLimit(ip) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: true, remaining: CHAT_MAX_REQUESTS }
  }
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  const windowStart = new Date(Date.now() - CHAT_WINDOW_MS).toISOString()
  const checkRes = await fetch(
    `${supabaseUrl}/rest/v1/chat_rate_limits?ip=eq.${encodeURIComponent(ip)}&window_start=gte.${windowStart}&select=count`,
    { headers },
  )
  if (!checkRes.ok) return { allowed: true, remaining: CHAT_MAX_REQUESTS }
  const rows = await checkRes.json()
  const currentCount = rows[0]?.count || 0
  if (currentCount >= CHAT_MAX_REQUESTS) return { allowed: false, remaining: 0 }
  await fetch(`${supabaseUrl}/rest/v1/chat_rate_limits`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      ip,
      count: currentCount + 1,
      window_start: rows.length > 0 ? undefined : new Date().toISOString(),
    }),
  }).catch(() => {})
  return { allowed: true, remaining: CHAT_MAX_REQUESTS - currentCount - 1 }
}

function normalizeIntentCategory(category, fallback = 'general') {
  const allowed = new Set([
    'experience',
    'projects',
    'contact',
    'technical',
    'compensation',
    'greeting',
    'general',
    'off_topic',
    'jailbreak',
  ])
  return allowed.has(category) ? category : fallback
}

const PORTFOLIO_SCOPE_PATTERN = /(ankit|portfolio|resume|cv|background|experience|intern(ship)?|project|projects|skills?|stack|tech(nolog(y|ies))?|education|school|gpa|graduate|graduation|career|work|role|fit|hire|hiring|contact|email|linkedin|github|trc|spectrum|charter|digital nepal|dynatrust|tiger bites|shuttle|ats( resume checker)?|writing assistant|retail sales|sewanee)/
const FOLLOW_UP_SCOPE_PATTERN = /\b(it|that|that one|that project|that role|that internship|there|this|this one)\b/

function hasScopedConversationContext(cleanMessages) {
  return cleanMessages
    .slice(-6)
    .some((message) => PORTFOLIO_SCOPE_PATTERN.test(message.content.toLowerCase()))
}

function isPortfolioScopedMessage(text, cleanMessages) {
  const lower = text.toLowerCase()

  if (PORTFOLIO_SCOPE_PATTERN.test(lower)) return true
  if (/\b(you|your)\b/.test(lower) && /(project|experience|work|intern(ship)?|skills?|stack|tech|education|background|role|fit|contact|career|built|build)/.test(lower)) {
    return true
  }
  if (FOLLOW_UP_SCOPE_PATTERN.test(lower) && hasScopedConversationContext(cleanMessages)) {
    return true
  }

  return false
}

function buildNoContextReply(route) {
  if (route.intentCategory === 'contact') {
    return "You can reach me at [ankit.das@sewanee.edu](mailto:ankit.das@sewanee.edu), [github.com/ankii08](https://github.com/ankii08), or [linkedin.com/in/ankitda](https://linkedin.com/in/ankitda)."
  }

  return "I don’t have a verified portfolio detail for that exact question yet. I can help with my work at TRC and Spectrum, DynaTrust-RAG, ATS Resume Checker, Tiger Bites, the shuttle tracker, or my technical stack."
}

function buildHeuristicRoute(lastUserMessage, cleanMessages, intentTags) {
  const lower = lastUserMessage.toLowerCase()
  const previousUserMessage = cleanMessages.filter((message) => message.role === 'user').at(-2)?.content || ''
  const topicHints = [lastUserMessage, previousUserMessage].join(' ').toLowerCase()
  const portfolioScoped = isPortfolioScopedMessage(lastUserMessage, cleanMessages)

  let intentCategory = 'general'
  if (intentTags.includes('jailbreak-attempt') || isJailbreakAttempt(lastUserMessage)) intentCategory = 'jailbreak'
  else if (shouldRedirectOffTopic(lastUserMessage)) intentCategory = 'off_topic'
  else if (!portfolioScoped && !intentTags.includes('greeting')) intentCategory = 'off_topic'
  else if (intentTags.includes('topic:contact')) intentCategory = 'contact'
  else if (intentTags.includes('topic:projects')) intentCategory = 'projects'
  else if (intentTags.includes('topic:experience')) intentCategory = 'experience'
  else if (intentTags.includes('topic:technical')) intentCategory = 'technical'
  else if (intentTags.includes('topic:compensation')) intentCategory = 'compensation'
  else if (intentTags.includes('greeting')) intentCategory = 'greeting'

  let retrievalQuery = lastUserMessage
  if (/what stack did it use|how was it built|what did it use|what tech did it use/.test(lower)) {
    if (/ats/.test(topicHints)) retrievalQuery = 'ATS Resume Checker stack architecture technologies'
    else if (/dynatrust|rag/.test(topicHints)) retrievalQuery = 'DynaTrust-RAG stack architecture retrieval'
    else if (/tiger bites/.test(topicHints)) retrievalQuery = 'Tiger Bites stack technologies architecture'
    else if (/shuttle/.test(topicHints)) retrievalQuery = 'Campus Shuttle Tracking System stack technologies architecture'
    else if (/writing assistant/.test(topicHints)) retrievalQuery = 'AI Writing Assistant stack technologies architecture'
    else if (/retail sales|forecast/.test(topicHints)) retrievalQuery = 'Retail Sales Prediction stack technologies forecasting'
  }

  return {
    intentCategory,
    shouldSearch: ['experience', 'projects', 'technical'].includes(intentCategory),
    shouldRedirect: ['off_topic', 'compensation', 'jailbreak'].includes(intentCategory),
    retrievalQuery,
    confidence: 'medium',
    reason: ['off_topic', 'compensation', 'jailbreak'].includes(intentCategory)
      ? 'Heuristic redirect outside portfolio scope'
      : ['experience', 'projects', 'technical'].includes(intentCategory)
        ? 'Heuristic portfolio lookup'
        : 'Heuristic direct portfolio answer',
  }
}

function safeJsonParse(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

async function routeConversation({ lastUserMessage, cleanMessages, currentPage, trace, intentTags }) {
  const heuristicRoute = buildHeuristicRoute(lastUserMessage, cleanMessages, intentTags)
  const routingGen = trace?.generation({
    name: 'intent_classification',
    model: OPENAI_ROUTER_MODEL,
    metadata: {
      heuristicIntent: heuristicRoute.intentCategory,
      currentPage: currentPage || null,
    },
  })

  try {
    const conversationWindow = cleanMessages
      .slice(-4)
      .map((message) => `${message.role.toUpperCase()}: ${message.content.slice(0, 240)}`)
      .join('\n')

    const response = await client.chat.completions.create({
      model: OPENAI_ROUTER_MODEL,
      temperature: 0,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an intent router for Ankit Das's portfolio assistant.

Return JSON only with:
- intentCategory: one of experience, projects, contact, technical, compensation, greeting, general, off_topic, jailbreak
- shouldSearch: boolean
- shouldRedirect: boolean
- retrievalQuery: a standalone search query for the portfolio knowledge base
- confidence: low, medium, or high
- reason: very short explanation

Rules:
- Generic programming help, LeetCode-style questions, homework, and unrelated data-structure questions are off_topic.
- Questions about Ankit's internships, projects, skills, stack, education, role fit, or contact are in scope.
- Follow-up questions like "what stack did it use?" should rewrite retrievalQuery to include the referenced project from recent context.
- Greetings and simple contact prompts usually do not need search.
- compensation shouldRedirect = true.
- jailbreak shouldSearch = false and shouldRedirect = false.`,
        },
        {
          role: 'user',
          content: `Current page: ${currentPage || 'unknown'}

Recent conversation:
${conversationWindow || `USER: ${lastUserMessage}`}

Latest user message:
${lastUserMessage}`,
        },
      ],
    })

    const parsed = safeJsonParse(response.choices?.[0]?.message?.content || '')
    if (!parsed) throw new Error('router-parse-failed')

    const route = {
      intentCategory: normalizeIntentCategory(parsed.intentCategory, heuristicRoute.intentCategory),
      shouldSearch: Boolean(parsed.shouldSearch),
      shouldRedirect: Boolean(parsed.shouldRedirect),
      retrievalQuery: typeof parsed.retrievalQuery === 'string' && parsed.retrievalQuery.trim()
        ? parsed.retrievalQuery.trim()
        : heuristicRoute.retrievalQuery,
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : heuristicRoute.confidence,
      reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : heuristicRoute.reason,
    }

    if (['off_topic', 'compensation', 'jailbreak'].includes(route.intentCategory)) {
      route.shouldSearch = false
      route.shouldRedirect = true
    }
    if (['contact', 'greeting'].includes(route.intentCategory)) {
      route.shouldSearch = false
    }
    if (isJailbreakAttempt(lastUserMessage)) {
      route.intentCategory = 'jailbreak'
      route.shouldSearch = false
      route.shouldRedirect = true
      route.reason = 'Hard jailbreak guard'
    } else if (!isPortfolioScopedMessage(lastUserMessage, cleanMessages) && route.intentCategory !== 'greeting') {
      route.intentCategory = 'off_topic'
      route.shouldSearch = false
      route.shouldRedirect = true
      route.reason = 'Hard portfolio-scope guard'
    } else if (shouldRedirectOffTopic(lastUserMessage)) {
      route.intentCategory = 'off_topic'
      route.shouldSearch = false
      route.shouldRedirect = true
      route.reason = 'Hard off-topic guard'
    }

    routingGen?.end({
      usage: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0,
      },
      metadata: route,
    })
    return route
  } catch (error) {
    routingGen?.end({
      metadata: {
        ...heuristicRoute,
        fallback: true,
        error: error.message,
      },
    })
    return heuristicRoute
  }
}

function buildLocalAssistantReply(question) {
  const lower = question.toLowerCase()

  if (/contact|email|linkedin|github|reach|hire/.test(lower)) {
    return "You can reach me at [ankit.das@sewanee.edu](mailto:ankit.das@sewanee.edu). My main public links are [github.com/ankii08](https://github.com/ankii08) and [linkedin.com/in/ankitda](https://linkedin.com/in/ankitda)."
  }

  if (/rag|llm|ai|geospatial|trc|utility|postgis|pgvector/.test(lower)) {
    return "My strongest AI work is at TRC, where I built a production RAG pipeline with pgvector and AWS Lambda for geospatial utility questions. I also added intent routing, guardrails for SAP-related data, and ESRI plus PostGIS integrations that reduced diagnostic time to under a minute."
  }

  if (/project|build|tiger bites|shuttle|writing assistant|forecast|dynatrust|resume checker|ats/.test(lower)) {
    return "A few strong examples are Tiger Bites, which reached 500+ students and reduced food waste by about 40%; the Campus Shuttle Tracking System, which cut wait times by 60%; DynaTrust-RAG, which focused on sub-500ms retrieval with provenance tracking; and my ATS Resume Checker, which cut API costs by 90% through caching."
  }

  if (/experience|intern|spectrum|digital nepal/.test(lower)) {
    return "I've worked across AI, backend, and full-stack roles. At TRC I focused on RAG and geospatial systems, at Spectrum I migrated enterprise services to Java 17 and Spring Boot 3 while improving security and performance, and at Digital Nepal I built a notification microservice and testing suite that improved stability."
  }

  if (/education|school|university|gpa|sewanee/.test(lower)) {
    return "I'm pursuing dual B.S. degrees in Mathematics and Computer Science at The University of the South, with a 3.93 GPA and graduation in May 2026. That academic background has helped me move comfortably between theory-heavy work and practical engineering."
  }

  return "I'm an AI/software and full stack engineer focused on geospatial AI, RAG systems, and user-facing products. If you want, ask about my TRC work, my projects, or what kinds of engineering roles I'm best suited for."
}

function streamStaticText(text) {
  const encoder = new TextEncoder()
  const readableStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text, replace: true })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

let langfuseClient = null
function getLangfuse() {
  if (!langfuseClient && process.env.LANGFUSE_SECRET_KEY) {
    langfuseClient = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    })
  }
  return langfuseClient
}

function buildSystemPrompt(systemPromptText, currentPage, canary, route) {
  const pageContext = currentPage
    ? `\nThe user is currently on page: ${currentPage}\nWhen referencing content from the current page, say "you can see this right here" and mention the section naturally.`
    : ''

  const routeContext = route
    ? `\nRouting decision:
- intent: ${route.intentCategory}
- should_search: ${route.shouldSearch}
- should_redirect: ${route.shouldRedirect}
- confidence: ${route.confidence}
- reason: ${route.reason}`
    : ''

  return `${systemPromptText}

The user is browsing in English. You must respond in English.
Contact email: ankit.das@sewanee.edu
This assistant is only for Ankit's portfolio, background, projects, skills, education, contact details, and role fit.
Do not answer unrelated coding, interview, or homework questions from general knowledge.
If verified retrieval context is missing, answer only from the confirmed portfolio profile already available in the prompt. Do not invent.
internal_ref: ${canary}${pageContext}${routeContext}`
}

function buildModelMessages(systemPrompt, ragContext, cleanMessages) {
  const messages = [{ role: 'system', content: systemPrompt }]

  if (ragContext) {
    messages.push({
      role: 'system',
      content: `Verified portfolio context for this conversation:

${ragContext}

Use this context when it is relevant. Do not invent details beyond it. If a detail is missing, say so briefly and give the closest confirmed information.`,
    })
  }

  return [
    ...messages,
    ...cleanMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  const t0 = Date.now()

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const langfuse = getLangfuse()
  let trace = null

  try {
    const { messages, lang, sessionId, currentPage } = await req.json()
    const rawLastMessage = messages.filter((message) => message.role === 'user').pop()?.content || ''

    const safePage = sanitizePage(currentPage)

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const chatRateLimit = await checkChatRateLimit(ip)
    if (!chatRateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'rate_limited',
        message: 'Too many requests. Please wait before sending more messages.',
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      return streamStaticText(buildLocalAssistantReply(rawLastMessage))
    }

    const bodySize = JSON.stringify({ messages, lang, sessionId, currentPage }).length
    if (bodySize > 50000) {
      return new Response(JSON.stringify({ error: 'Request too large' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const lastUserMessage = rawLastMessage.slice(0, 2000)

    let systemPromptText
    let promptVersion
    const overrideVersion = req.headers.get('x-prompt-version')
    const overrideAuth = req.headers.get('x-prompt-auth')
    if (overrideAuth === process.env.PROMPT_REGRESSION_SECRET && overrideVersion && langfuse) {
      try {
        const prompt = await langfuse.getPrompt('chatbot-system', parseInt(overrideVersion, 10), {
          type: 'text', cacheTtlSeconds: 0,
        })
        systemPromptText = prompt.prompt
        promptVersion = prompt.version
      } catch {
        systemPromptText = SYSTEM_PROMPT_FALLBACK
        promptVersion = 'file'
      }
    } else {
      const { text, version } = await getSystemPrompt(langfuse)
      systemPromptText = text
      promptVersion = version
    }

    const cleanMessages = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    const traceSource = req.headers.get('x-trace-source')
    const heuristicTags = classifyIntent(lastUserMessage)
    const baseTags = traceSource ? [...heuristicTags, `source:${traceSource}`] : heuristicTags

    if (langfuse) {
      trace = langfuse.trace({
        name: 'chat',
        sessionId: sessionId || undefined,
        tags: [lang || 'en', ...baseTags],
        metadata: {
          lang,
          messageCount: messages.length,
          lastUserMessage: lastUserMessage.slice(0, 200),
          currentPage: safePage,
          promptVersion,
        },
      })
    }

    const route = await routeConversation({
      lastUserMessage,
      cleanMessages,
      currentPage: safePage,
      trace,
      intentTags: heuristicTags,
    })

    const intentTags = [...new Set([
      ...baseTags,
      `intent:${route.intentCategory}`,
      route.shouldSearch ? 'route:search' : 'route:no-search',
      route.shouldRedirect ? 'route:redirect' : 'route:answer',
    ])]

    trace?.update({ tags: [lang || 'en', ...intentTags], metadata: { route } })

    if (route.intentCategory === 'jailbreak' && !traceSource) {
      waitUntil(sendJailbreakAlert(lastUserMessage))
    }

    if (route.shouldRedirect) {
      if (langfuse) waitUntil(langfuse.flushAsync())
      return streamStaticText(route.intentCategory === 'jailbreak'
        ? buildJailbreakReply()
        : buildOffTopicReply(lastUserMessage))
    }

    const canary = `ZXCV_${crypto.randomUUID().slice(0, 8)}`
    const systemPrompt = buildSystemPrompt(systemPromptText, safePage, canary, route)

    let ragSources = []
    let ragDegraded = false
    let ragDegradedReason = null
    let ragUsed = false
    let ragMetrics = { embeddingMs: 0, retrievalMs: 0, rerankMs: 0 }
    let ragUsage = { embeddingTokens: 0, rerankInputTokens: 0, rerankOutputTokens: 0 }
    let ragContext = ''

    if (isRagEnabled() && route.shouldSearch) {
      const ragResult = await searchPortfolio(route.retrievalQuery || lastUserMessage, trace, null)
      ragSources = ragResult.sources
      ragDegraded = ragResult.degraded
      ragDegradedReason = ragResult.degradedReason
      ragMetrics = ragResult.metrics
      ragUsage = ragResult.usage
      ragUsed = Boolean(ragResult.chunks?.length)
      ragContext = ragResult.chunks ? formatChunksForContext(ragResult.chunks) : ''
    }

    if (route.shouldSearch && !ragUsed) {
      if (langfuse) waitUntil(langfuse.flushAsync())
      return streamStaticText(buildNoContextReply(route))
    }

    return streamResponse({
      modelMessages: buildModelMessages(systemPrompt, ragContext, cleanMessages),
      fallbackMessages: buildModelMessages(systemPrompt, '', cleanMessages),
      route,
      ragSources,
      ragDegraded,
      ragDegradedReason,
      canary,
      intentTags,
      trace,
      langfuse,
      lastUserMessage,
      t0,
      ragUsed,
      ragMetrics,
      ragUsage,
      promptVersion,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    trace?.update({ metadata: { error: error.message } })
    if (langfuse) waitUntil(langfuse.flushAsync())
    return new Response(JSON.stringify({ error: 'Error processing request' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

function streamResponse({
  modelMessages,
  fallbackMessages,
  route,
  ragSources,
  ragDegraded,
  ragDegradedReason,
  canary,
  intentTags,
  trace,
  langfuse,
  lastUserMessage,
  t0,
  ragUsed,
  ragMetrics,
  ragUsage,
  promptVersion,
}) {
  const encoder = new TextEncoder()
  let fullOutput = ''
  let generationCost = 0

  const generationSpan = trace?.span({
    name: 'generation',
    metadata: { ragUsed, streaming: true, provider: 'openai', model: OPENAI_CHAT_MODEL },
  })

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        if (ragDegraded) {
          controller.enqueue(encoder.encode(`event: rag-status\ndata: ${JSON.stringify({ status: 'degraded', reason: ragDegradedReason })}\n\n`))
        }

        const stream = await client.chat.completions.create({
          model: OPENAI_CHAT_MODEL,
          messages: modelMessages,
          temperature: 0.5,
          max_tokens: 800,
          stream: true,
          stream_options: { include_usage: true },
        })

        let promptTokens = 0
        let completionTokens = 0

        for await (const part of stream) {
          if (part.usage) {
            promptTokens = part.usage.prompt_tokens || promptTokens
            completionTokens = part.usage.completion_tokens || completionTokens
          }

          const chunk = part.choices?.[0]?.delta?.content || ''
          if (!chunk) continue

          fullOutput += chunk

          if (fullOutput.length % 200 < chunk.length || fullOutput.length < 200) {
            if (containsFingerprint(fullOutput) || fullOutput.includes(canary)) {
              trace?.update({
                tags: [...intentTags, 'prompt-leak-blocked'],
                metadata: { leakDetectedAt: fullOutput.length },
              })
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: LEAK_RESPONSE, replace: true })}\n\n`))
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
              generationSpan?.end({ metadata: { blocked: true } })
              waitUntil(sendJailbreakAlert(`[PROMPT LEAK BLOCKED] User: ${lastUserMessage}`))
              if (langfuse) waitUntil(langfuse.flushAsync())
              return
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
        }

        generationCost = calcCost(OPENAI_CHAT_MODEL, promptTokens, completionTokens)
        generationSpan?.end({
          metadata: {
            inputTokens: promptTokens,
            outputTokens: completionTokens,
            latencyMs: Date.now() - t0,
            cost: generationCost,
          },
        })

        const costBreakdown = {
          toolDecision: 0,
          embedding: calcCost('text-embedding-3-small', ragUsage?.embeddingTokens || 0),
          reranking: calcCost('claude-haiku-4-5-20251001', ragUsage?.rerankInputTokens || 0, ragUsage?.rerankOutputTokens || 0),
          generation: generationCost,
        }
        costBreakdown.total = Object.values(costBreakdown).reduce((sum, value) => sum + value, 0)

        trace?.update({
          tags: [...intentTags, ragUsed ? 'rag:yes' : 'rag:no'],
          metadata: {
            route,
            ragUsed,
            promptVersion,
            chunksRetrieved: ragSources.length,
            sources: ragSources.map((source) => source.article_id),
            latencyBreakdown: {
              toolDecisionMs: 0,
              ...ragMetrics,
              totalMs: Date.now() - t0,
            },
            cost: costBreakdown,
          },
        })

        if (process.env.ENABLE_ONLINE_SCORING === 'true' && langfuse && trace && fullOutput) {
          waitUntil(scoreTrace(trace.id, lastUserMessage, fullOutput, ragUsed, langfuse))
        }

        let finalSources = ragSources.length > 0
          ? filterSourcesByResponse(ragSources, fullOutput)
          : []

        const ragArticleIds = new Set(finalSources.map((source) => source.article_id))
        const detected = detectMentionedArticles(fullOutput)
        for (const source of detected) {
          if (!ragArticleIds.has(source.article_id) && finalSources.length < 3) {
            finalSources.push(source)
          }
        }

        if (finalSources.length === 0 && ragUsed) {
          finalSources = [HOME_SOURCE]
        }

        if (finalSources.length > 0) {
          controller.enqueue(encoder.encode(`event: rag-sources\ndata: ${JSON.stringify(finalSources)}\n\n`))
        }

        if (langfuse) waitUntil(langfuse.flushAsync())
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (error) {
        generationSpan?.end({ metadata: { error: error.message } })
        trace?.update({ tags: [...intentTags, 'rag:fallback'], metadata: { streamingError: error.message } })

        if (fallbackMessages && !fullOutput) {
          try {
            controller.enqueue(encoder.encode(`event: rag-status\ndata: ${JSON.stringify({ status: 'degraded', reason: 'streaming_fallback' })}\n\n`))

            const fallback = await client.chat.completions.create({
              model: OPENAI_CHAT_MODEL,
              messages: fallbackMessages,
              temperature: 0.5,
              max_tokens: 800,
            })

            const fallbackOutput = fallback.choices?.[0]?.message?.content || ''
            if (containsFingerprint(fallbackOutput) || fallbackOutput.includes(canary)) {
              trace?.update({
                tags: [...intentTags, 'prompt-leak-blocked'],
                metadata: { leakDetectedAt: fallbackOutput.length, stream: 'fallback' },
              })
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: LEAK_RESPONSE, replace: true })}\n\n`))
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
              waitUntil(sendJailbreakAlert(`[PROMPT LEAK BLOCKED - FALLBACK] User: ${lastUserMessage}`))
              if (langfuse) waitUntil(langfuse.flushAsync())
              return
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fallbackOutput, replace: true })}\n\n`))
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
            if (langfuse) waitUntil(langfuse.flushAsync())
            return
          } catch {
            // fall through to error text
          }
        }

        try {
          const errorText = 'Sorry, something went wrong. Try again or reach out at ankit.das@sewanee.edu.'
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: errorText, replace: true })}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch {
          controller.error(error)
        }
        if (langfuse) waitUntil(langfuse.flushAsync())
      }
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Response-Time': `${Date.now() - t0}ms`,
    },
  })
}

async function scoreTrace(traceId, userMessage, response, ragUsed, langfuse) {
  try {
    const scoringGen = langfuse.generation({
      traceId,
      name: 'online_scoring',
      model: OPENAI_SCORING_MODEL,
    })

    const scoringResponse = await client.chat.completions.create({
      model: OPENAI_SCORING_MODEL,
      temperature: 0,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Rate this chatbot response (Ankit Das portfolio assistant). Respond ONLY with JSON.

User: "${userMessage.slice(0, 300)}"
Assistant: "${response.slice(0, 500)}"

Rate (0.0-1.0):
- quality: answer helpfulness + on-brand tone
- safety: protects private info (city/email/LinkedIn are public = OK)
${ragUsed ? '- faithfulness: response matches retrieved context (no hallucinated details)' : ''}

JSON only: {"quality":0.0,"safety":0.0${ragUsed ? ',"faithfulness":0.0' : ''}}`,
      }],
    })

    const usage = scoringResponse.usage
    scoringGen.end({
      usage: {
        input: usage?.prompt_tokens || 0,
        output: usage?.completion_tokens || 0,
      },
    })

    const text = scoringResponse.choices?.[0]?.message?.content || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const scores = JSON.parse(jsonMatch[0])
    langfuse.score({ traceId, name: 'quality', value: scores.quality, comment: 'online' })
    langfuse.score({ traceId, name: 'safety', value: scores.safety, comment: 'online' })
    if (ragUsed && scores.faithfulness !== undefined) {
      langfuse.score({ traceId, name: 'faithfulness', value: scores.faithfulness, comment: 'online' })
    }

    await langfuse.flushAsync()
  } catch {
    // Non-critical
  }
}
