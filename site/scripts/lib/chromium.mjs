// A tiny headless Chromium driver over the DevTools protocol, with no dependencies.
// Node 22+ has a global WebSocket, which is all the protocol needs.
//
//   const browser = await launch()
//   const page = await browser.newPage({ width: 1200, height: 800, scale: 2, dark: true })
//   await page.goto('http://localhost:5173/typelite/')
//   await page.screenshot('out.png', { selector: '#demo' })
//   await browser.close()

import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium'

export async function launch({ executable = process.env.CHROMIUM || DEFAULT_CHROMIUM } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'typelite-capture-'))
  const child = spawn(
    executable,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )

  // Chromium prints "DevTools listening on ws://..." on stderr once it is ready.
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('Chromium did not start')), 20000)
    child.stderr.on('data', (chunk) => {
      buffer += chunk
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    child.on('exit', (code) => reject(new Error(`Chromium exited early (${code})`)))
  })

  const browserConn = await connect(wsUrl)
  const httpBase = wsUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '')

  return {
    async newPage({
      width = 1280,
      height = 800,
      scale = 1,
      dark = false,
      reducedMotion = false,
    } = {}) {
      const { targetId } = await browserConn.send('Target.createTarget', { url: 'about:blank' })
      const list = await (await fetch(`${httpBase}/json/list`)).json()
      const target = list.find((t) => t.id === targetId)
      const conn = await connect(target.webSocketDebuggerUrl)
      await conn.send('Page.enable')
      await conn.send('Runtime.enable')
      await conn.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: scale,
        mobile: false,
      })
      await conn.send('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
          { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
        ],
      })
      return makePage(conn, { width, height })
    },
    async close() {
      try {
        await browserConn.send('Browser.close')
      } catch {
        child.kill()
      }
      browserConn.close()
      await rm(profile, { recursive: true, force: true }).catch(() => {})
    },
  }
}

function makePage(conn, viewport) {
  const page = {
    conn,
    async goto(url, { waitFor } = {}) {
      const loaded = conn.once('Page.loadEventFired')
      await conn.send('Page.navigate', { url })
      await loaded
      if (waitFor) await page.waitFor(waitFor)
    },
    /** Evaluates an expression (awaiting promises) and returns its JSON value. */
    async evaluate(expression) {
      const { result, exceptionDetails } = await conn.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
      }
      return result.value
    },
    /** Waits until the expression is truthy. */
    async waitFor(expression, timeoutMs = 15000) {
      const end = Date.now() + timeoutMs
      while (Date.now() < end) {
        if (await page.evaluate(`Boolean(${expression})`)) return
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error(`Timed out waiting for ${expression}`)
    },
    /** Bounding box of an element in CSS pixels. */
    async box(selector) {
      return page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }
      })()`)
    },
    /** Takes a PNG. With `selector`, only that element (plus `pad` CSS pixels). */
    async screenshot(path, { selector, clip, pad = 0 } = {}) {
      let region = clip
      if (selector) {
        const b = await page.box(selector)
        if (!b) throw new Error(`No element for ${selector}`)
        region = {
          x: b.x - pad,
          y: b.y - pad,
          width: b.width + pad * 2,
          height: b.height + pad * 2,
        }
      }
      const params = { format: 'png', captureBeyondViewport: Boolean(region) }
      if (region) params.clip = { ...region, scale: 1 }
      const { data } = await conn.send('Page.captureScreenshot', params)
      const buffer = Buffer.from(data, 'base64')
      if (path) await writeFile(path, buffer)
      return buffer
    },
    viewport,
    close: () => conn.close(),
  }
  return page
}

async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let nextId = 1
  const pending = new Map()
  const waiters = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`))
      else resolve(msg.result)
    } else if (msg.method && waiters.has(msg.method)) {
      const list = waiters.get(msg.method)
      waiters.delete(msg.method)
      list.forEach((fn) => fn(msg.params))
    }
  })
  return {
    send(method, params = {}) {
      const id = nextId++
      ws.send(JSON.stringify({ id, method, params }))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    },
    once(method) {
      return new Promise((resolve) => {
        const list = waiters.get(method) ?? []
        list.push(resolve)
        waiters.set(method, list)
      })
    },
    close() {
      ws.close()
    },
  }
}
