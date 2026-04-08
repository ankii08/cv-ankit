import { PORTFOLIO_CONTENT } from './portfolio-content.js'

// ---------------------------------------------------------------------------
// Shared RAG pipeline — used by api/chat.js (text) and api/rag-search.js (voice)
// ---------------------------------------------------------------------------

export const MODEL_COSTS = {
  'claude-sonnet-4-6': { input: 3.0 / 1e6, output: 15.0 / 1e6 },
  'claude-haiku-4-5-20251001': { input: 0.25 / 1e6, output: 1.25 / 1e6 },
  'text-embedding-3-small': { input: 0.02 / 1e6 },
}

export function calcCost(model, inputTokens, outputTokens = 0) {
  const rates = MODEL_COSTS[model]
  return rates ? inputTokens * (rates.input || 0) + outputTokens * (rates.output || 0) : 0
}

export function isRagEnabled() {
  return true
}

export const PORTFOLIO_TOOL = {
  name: 'search_portfolio',
  description: "Search Ankit's portfolio knowledge base for verified project, experience, skills, and education details. Use this whenever the user asks for specifics. The retrieved content is Ankit's own portfolio context, so answer in first person and do not cite it like an external source.",
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant portfolio content',
      },
    },
    required: ['query'],
  },
}

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(text) {
  const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'for', 'from',
    'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'tell', 'that',
    'the', 'to', 'was', 'what', 'with', 'you', 'your',
  ])
  return normalize(text)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function scoreEntry(entry, query, queryTokens) {
  const haystack = normalize([entry.title, entry.content, ...(entry.keywords || [])].join(' '))
  let score = 0

  for (const keyword of entry.keywords || []) {
    const kw = normalize(keyword)
    if (kw && query.includes(kw)) score += kw.includes(' ') ? 12 : 7
  }

  if (query && haystack.includes(query)) score += 10

  const uniqueTokens = new Set(queryTokens)
  for (const token of uniqueTokens) {
    if (haystack.includes(token)) score += 2
    if (entry.title.toLowerCase().includes(token)) score += 3
  }

  if (/rag|llm|ai|agent|voice|chatbot|chat/.test(query) && /rag|ai|llm|assistant|voice/.test(haystack)) {
    score += 3
  }

  return score
}

function localSearch(queryText) {
  const startedAt = Date.now()
  const normalizedQuery = normalize(queryText)
  const queryTokens = tokenize(queryText)

  const ranked = PORTFOLIO_CONTENT
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, normalizedQuery, queryTokens),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return {
    chunks: ranked.map(({ entry, score }) => ({
      content: entry.content,
      similarity: Math.min(0.99, score / 20),
      metadata: {
        article_id: entry.article_id,
        section_id: entry.section_id,
        section_anchor: entry.section_anchor,
        page_path_en: entry.page_path_en,
        page_path_es: entry.page_path_es,
        article_slug_en: entry.article_slug_en,
        article_slug_es: entry.article_slug_es,
        title: entry.title,
      },
    })),
    latencyMs: Date.now() - startedAt,
  }
}

export async function embedQuery(query) {
  const tokens = tokenize(query)
  return {
    embedding: tokens,
    latencyMs: 0,
    totalTokens: tokens.length,
  }
}

export async function searchDocuments(queryText, _queryEmbedding) {
  return localSearch(queryText)
}

export async function rerankChunks(_query, chunks, _anthropicClient) {
  return {
    chunks: diversifyByArticle(chunks.slice(0, 5)),
    latencyMs: 0,
    rerankedOrder: null,
    usage: null,
  }
}

export function diversifyByArticle(ranked) {
  const result = []
  const seen = new Set()

  for (const chunk of ranked) {
    const articleId = chunk.metadata?.article_id
    if (!seen.has(articleId)) {
      seen.add(articleId)
      result.push(chunk)
    }
  }

  for (const chunk of ranked) {
    if (result.length >= 5) break
    if (!result.includes(chunk)) result.push(chunk)
  }

  return result
}

export function formatChunksForContext(chunks) {
  return chunks.map((chunk, index) => {
    const meta = chunk.metadata || {}
    const source = meta.title ? `[Portfolio section: ${meta.title}]` : ''
    return `--- Portfolio context ${index + 1} ${source} ---\n${chunk.content}`
  }).join('\n\n')
}

export function extractSources(chunks) {
  const seen = new Set()
  const sources = []

  for (const chunk of chunks) {
    const meta = chunk.metadata || {}
    if (!meta.article_id || seen.has(meta.article_id)) continue
    seen.add(meta.article_id)
    sources.push({
      article_id: meta.article_id,
      section_id: meta.section_id,
      section_anchor: meta.section_anchor || '',
      page_path_en: meta.page_path_en || '/',
      page_path_es: meta.page_path_es || '/',
      article_slug_en: meta.article_slug_en || '',
      article_slug_es: meta.article_slug_es || '',
    })
  }

  return sources
}

export const SOURCE_KEYWORDS = Object.fromEntries(
  PORTFOLIO_CONTENT.map((entry) => [entry.article_id, [...entry.keywords, entry.title.toLowerCase()]])
)

export function filterSourcesByResponse(sources, responseText) {
  if (!responseText || sources.length === 0) return sources
  const lower = responseText.toLowerCase()
  const filtered = sources.filter((source) => {
    const keywords = SOURCE_KEYWORDS[source.article_id]
    if (!keywords) return true
    return keywords.some((keyword) => {
      const normalizedKeyword = normalize(keyword)
      return normalizedKeyword.length > 1 && lower.includes(normalizedKeyword)
    })
  })
  return filtered.length > 0 ? filtered.slice(0, 3) : sources.slice(0, 1)
}

export const HOME_SOURCE = {
  article_id: 'about',
  section_id: 'about',
  section_anchor: '#about',
  page_path_en: '/',
  page_path_es: '/',
  article_slug_en: 'about',
  article_slug_es: 'about',
}

export function detectMentionedArticles(responseText) {
  if (!responseText) return []
  const lower = normalize(responseText)
  const sources = []

  for (const entry of PORTFOLIO_CONTENT) {
    if ((entry.keywords || []).some((keyword) => {
      const normalizedKeyword = normalize(keyword)
      return normalizedKeyword.length > 1 && lower.includes(normalizedKeyword)
    })) {
      sources.push({
        article_id: entry.article_id,
        section_id: entry.section_id,
        section_anchor: entry.section_anchor,
        page_path_en: entry.page_path_en,
        page_path_es: entry.page_path_es,
        article_slug_en: entry.article_slug_en,
        article_slug_es: entry.article_slug_es,
      })
    }
  }

  return sources.slice(0, 3)
}

export async function searchPortfolio(query, trace, anthropicClient) {
  const result = {
    chunks: null,
    sources: [],
    degraded: false,
    degradedReason: null,
    metrics: { embeddingMs: 0, retrievalMs: 0, rerankMs: 0 },
    usage: { embeddingTokens: 0, rerankInputTokens: 0, rerankOutputTokens: 0 },
  }

  const embeddingGen = trace?.generation({
    name: 'embedding',
    model: 'local-keyword-search',
    metadata: { query },
  })

  const embResult = await embedQuery(query)
  result.metrics.embeddingMs = embResult.latencyMs
  result.usage.embeddingTokens = embResult.totalTokens
  embeddingGen?.end({
    usage: { input: embResult.totalTokens, output: 0 },
    metadata: { latencyMs: embResult.latencyMs },
  })

  const retrievalSpan = trace?.span({ name: 'retrieval', metadata: { query } })

  try {
    const searchResult = await searchDocuments(query, embResult.embedding)
    result.metrics.retrievalMs = searchResult.latencyMs
    retrievalSpan?.end({
      metadata: {
        chunksCount: searchResult.chunks.length,
        topSimilarity: searchResult.chunks[0]?.similarity || 0,
        latencyMs: searchResult.latencyMs,
      },
    })

    if (!searchResult.chunks.length) {
      result.degradedReason = 'no_match'
      return result
    }

    const rerankGen = trace?.generation({
      name: 'reranking',
      model: 'local-rerank',
      metadata: { query },
    })

    const rerankResult = await rerankChunks(query, searchResult.chunks, anthropicClient)
    result.metrics.rerankMs = rerankResult.latencyMs
    rerankGen?.end({
      usage: { input: 0, output: 0 },
      metadata: {
        rerankedOrder: rerankResult.rerankedOrder,
        latencyMs: rerankResult.latencyMs,
      },
    })

    result.chunks = rerankResult.chunks
    result.sources = extractSources(rerankResult.chunks)
  } catch (error) {
    retrievalSpan?.end({ metadata: { error: error.message } })
    result.degraded = true
    result.degradedReason = 'retrieval_fail'
  }

  return result
}

export function classifyIntent(text) {
  const lower = text.toLowerCase()
  const tags = []

  if (isJailbreakAttempt(text)) {
    tags.push('jailbreak-attempt')
  }

  if (/experience|intern|work|career|trc|spectrum|digital nepal/.test(lower)) tags.push('topic:experience')
  if (/project|portfolio|github|build|built|code|tiger bites|shuttle|resume checker|dynatrust|writing assistant/.test(lower)) tags.push('topic:projects')
  if (/contact|email|linkedin|talk|reach|hire/.test(lower)) tags.push('topic:contact')
  if (/stack|tech|python|react|spring|java|ai|llm|rag|voice|agent|geospatial|postgis|pgvector/.test(lower)) tags.push('topic:technical')
  if (/salary|compensation|money|pay|rate/.test(lower)) tags.push('topic:compensation')
  if (/hello|hi|hey|good morning|good afternoon/.test(lower) && text.length < 30) tags.push('greeting')
  if (shouldRedirectOffTopic(text)) tags.push('topic:off-topic')

  return tags.length > 0 ? tags : ['topic:general']
}

const JAILBREAK_PATTERNS = [
  'ignore previous', 'pretend', 'roleplay', 'act as', 'you are now',
  'forget', 'disregard', 'bypass', 'override', 'jailbreak',
  'dan', 'developer mode', 'evil', 'malicious', 'hack',
  'system prompt', 'your prompt', 'instructions', 'reset your',
  'reveal your', 'show me your rules', 'your objective', 'your orders',
  'print all', 'print everything', 'yaml', 'json record', 'dump',
  'export', 'serialize', 'reproduce', 'output all', 'all of the above',
  'everything above', 'repeat everything', 'write all above', 'copy all',
  'show me everything',
]

export function isJailbreakAttempt(text) {
  const lower = text.toLowerCase()
  return JAILBREAK_PATTERNS.some((pattern) => lower.includes(pattern))
}

function mentionsPortfolioEntity(text) {
  const lower = text.toLowerCase()
  return /ankit|portfolio|resume|cv|background|experience|intern|internship|project|projects|skills|stack|education|trc|spectrum|charter|digital nepal|dynatrust|tiger bites|shuttle|ats resume checker|writing assistant|retail sales|sewanee|hire|contact|linkedin|github/.test(lower)
}

function isGenericCodingQuestion(text) {
  const lower = text.toLowerCase()
  return /(implement|write|code|build|create|solve|debug|fix|reverse|explain)\b/.test(lower)
    && /(linked ?list|binary tree|graph|hash ?map|heap|queue|stack|dfs|bfs|dynamic programming|leetcode|algorithm|data structure|c\+\+|python|java)\b/.test(lower)
}

export function shouldRedirectOffTopic(text) {
  if (!text) return false
  const lower = text.toLowerCase()

  if (isJailbreakAttempt(text)) return true
  if (mentionsPortfolioEntity(text)) return false

  if (isGenericCodingQuestion(text)) return true
  if (/(recipe|movie|sports|weather|horoscope|celebrity|travel plan|stock tip|politics|bitcoin|crypto|ethereum|stock price|share price|market cap)/.test(lower)) return true

  return false
}

export function buildJailbreakReply() {
  return "I can’t ignore my operating rules or reveal internal behavior. I’m here to discuss Ankit’s projects, experience, technical background, and role fit."
}

export function buildOffTopicReply(text) {
  if (isGenericCodingQuestion(text)) {
    return "Systems architecture, AI applications, and product engineering are more my lane than generic data-structure walkthroughs. I’m here to talk about my projects, experience, stack, or what I’d be a strong fit for."
  }

  return "I’m here to help with Ankit’s portfolio: his projects, experience, technical background, and role fit. Ask me about his work at TRC, his RAG systems, his projects, or how to get in touch."
}

export async function sendJailbreakAlert(userMessage) {
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_EMAIL) return

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Ankit AI <onboarding@resend.dev>',
      to: process.env.ALERT_EMAIL,
      subject: 'JAILBREAK ATTEMPT - ankitd.com',
      html: `
        <h2>Jailbreak Attempt Detected</h2>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>User message:</strong></p>
        <blockquote style="background: #f5f5f5; padding: 15px; border-left: 4px solid #e74c3c;">
          ${userMessage.slice(0, 500)}${userMessage.length > 500 ? '...' : ''}
        </blockquote>
      `,
    }),
  })
}

export const PROMPT_FINGERPRINTS = [
  'maximum 150 words', 'never reveal', 'anti-extraction', 'cache_control',
  'token_budget', 'internal rules', 'internal_ref:',
]

export const LEAK_RESPONSE = 'That information is part of my internal system design. I can still talk through the architecture or my portfolio if that helps.'

export function containsFingerprint(text) {
  const lower = text.toLowerCase()
  return PROMPT_FINGERPRINTS.some((fingerprint) => lower.includes(fingerprint.toLowerCase()))
}
