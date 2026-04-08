import { Langfuse } from 'langfuse'
import {
  searchPortfolio, formatChunksForContext,
  filterSourcesByResponse, detectMentionedArticles, HOME_SOURCE,
  shouldRedirectOffTopic, buildOffTopicReply,
} from './_shared/rag.js'

export const config = {
  runtime: 'edge',
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

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { query, traceId, currentPage } = await req.json()

    if (!traceId) {
      return new Response(JSON.stringify({ error: 'Missing traceId' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (shouldRedirectOffTopic(query)) {
      return new Response(JSON.stringify({
        context: buildOffTopicReply(query),
        sources: [],
        currentPage,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const langfuse = getLangfuse()
    let trace = null
    if (langfuse && traceId) {
      trace = langfuse.trace({ id: traceId })
    }
    const ragSpan = trace?.span({ name: 'voice-rag', metadata: { query } })

    try {
      const ragResult = await searchPortfolio(query, ragSpan, null)
      const context = ragResult.chunks
        ? formatChunksForContext(ragResult.chunks)
        : 'No verified portfolio context was found for this question. Say you do not have that exact detail, then redirect to the closest confirmed project, internship, skill area, or contact information.'

      const sources = ragResult.sources || []

      ragSpan?.end({
        metadata: {
          chunksFound: ragResult.chunks?.length || 0,
          degraded: ragResult.degraded,
          metrics: ragResult.metrics,
        },
      })

      const responseText = query || ''
      let filteredSources = sources.length > 0
        ? filterSourcesByResponse(sources, responseText)
        : []

      const ragArticleIds = new Set(filteredSources.map((source) => source.article_id))
      const detected = detectMentionedArticles(responseText)
      for (const source of detected) {
        if (!ragArticleIds.has(source.article_id) && filteredSources.length < 3) {
          filteredSources.push(source)
        }
      }

      if (filteredSources.length === 0 && sources.length > 0) {
        filteredSources = [HOME_SOURCE]
      }

      if (langfuse) await langfuse.flushAsync()

      return new Response(JSON.stringify({ context, sources: filteredSources, currentPage }), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      ragSpan?.end({ metadata: { error: error.message } })
      if (langfuse) await langfuse.flushAsync()

      return new Response(JSON.stringify({
        context: 'Search is temporarily unavailable. Stay within Ankit\'s portfolio scope and answer only from known profile details.',
        sources: [],
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    console.error('RAG search error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
