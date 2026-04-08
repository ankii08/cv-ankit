import type { ComponentType } from 'react'

export interface ArticleSeo {
  title: string
  description: string
}

export interface ArticleSeoMeta {
  datePublished: string
  dateModified: string
  keywords: string[]
  articleType: 'Article' | 'TechArticle'
  articleTags: string
  images: string[]
  about: Array<Record<string, string>>
  extra?: Record<string, string>
  citation?: Array<{ '@type': string; name: string; url: string }>
  isBasedOn?: Record<string, unknown>
  mentions?: Array<Record<string, string>>
  discussionUrl?: string
  relatedLink?: string
}

export interface ArticleConfig {
  id: string
  slugs: { es: string; en: string }
  titles: { es: string; en: string }
  seo: { es: ArticleSeo; en: ArticleSeo }
  sectionLabels: { es: Record<string, string>; en: Record<string, string> }
  type: 'collab' | 'case-study' | 'bridge'
  ogImage?: string
  heroImage?: string
  component: () => Promise<{ default: ComponentType<{ lang: 'es' | 'en' }> }>
  xDefaultSlug?: string
  ragReady?: boolean
  i18nFile?: string
  seoMeta?: ArticleSeoMeta
}

// Case-study pages were intentionally removed from this portfolio build.
// The registry stays in place as reusable infrastructure for future long-form
// project pages without carrying legacy author content through the repo.
export const articleRegistry: ArticleConfig[] = []

export function getAltPaths(): Record<string, string> {
  return {
    '/': '/',
    '/ops': '/ops',
  }
}

export function getPageTitles(): Record<string, string> {
  return {
    '/': 'Ankit Das Portfolio',
    '/ops': 'Ops Dashboard',
  }
}

export function getSectionLabels(): Record<string, Record<string, string>> {
  return {}
}

export function getEsSlugs(): Set<string> {
  return new Set<string>(['/'])
}
