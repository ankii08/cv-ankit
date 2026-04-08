import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter, Routes, Route } from 'react-router-dom'
import App from '../src/App.tsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const distDir = resolve(root, 'dist')
const indexPath = resolve(distDir, 'index.html')

function stripReactLinks(html: string): string {
  return html.replace(/<link[^>]*>/g, '')
}

const shell = readFileSync(indexPath, 'utf-8')
const rendered = stripReactLinks(
  renderToString(
    <StaticRouter location="/">
      <Routes>
        <Route path="/" element={<App />} />
      </Routes>
    </StaticRouter>
  )
)

const output = shell.replace('<div id="root"></div>', `<div id="root">${rendered}</div>`)
writeFileSync(indexPath, output, 'utf-8')
console.log('[prerender] Injected SSR homepage shell into dist/index.html')
