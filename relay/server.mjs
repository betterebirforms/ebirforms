// ebirforms relay: a blind pipe. See README.md.
// It never reads credentials or the return: /tcp moves opaque bytes, /dispatch
// forwards three validated fields, /package serves BIR's public zip.
import http from 'node:http'
import net from 'node:net'
import dns from 'node:dns/promises'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const PACKAGE_URL = 'https://bir-cdn.bir.gov.ph/BIR/pdf/Offline_eBIRForms_Package_v7.9.6.2.1.zip'
const PACKAGE_MAX_BYTE = 200 * 1024 * 1024
const DISPATCH_BASE = ['http://birgovph.com', 'http://ws1.birgovph.com']
const DISPATCH_MAX_BYTE = 8192
const DISPATCH_TIMEOUT_MS = 8000
const HOST_SUFFIX = ['.gov.ph', '.birgovph.com']
const DEFAULT_ALLOW_ORIGIN = 'https://betterebirforms.github.io,http://127.0.0.1:10900,http://localhost:10900'

function list(text) {
  return String(text).split(',').map((x) => x.trim()).filter(Boolean)
}

// True for loopback, private, link-local, multicast, reserved and unspecified addresses.
export function isPrivateAddress(address) {
  const family = net.isIP(address)
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  if (family === 6) {
    const text = address.toLowerCase()
    const mapped = text.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    if (text === '::' || text === '::1') return true
    const first = parseInt(text.split(':')[0] || '0', 16)
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00
  }
  return true
}

function hostAllowed(host) {
  if (host.length > 253 || net.isIP(host) !== 0) return false
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return false
  return HOST_SUFFIX.some((suffix) => host.endsWith(suffix))
}

export function createRelay(option = {}) {
  const allowOrigin = option.allowOrigin ?? list(process.env.ALLOW_ORIGIN ?? DEFAULT_ALLOW_ORIGIN)
  const tcpPort = (option.tcpPort ?? list(process.env.TCP_PORT ?? '8022')).map(String)
  const testTcp = option.testTcp ?? process.env.RELAY_TEST_TCP ?? ''
  const packageUrl = option.packageUrl ?? PACKAGE_URL
  const dispatchBase = option.dispatchBase ?? DISPATCH_BASE
  const lookup = option.lookup ?? ((host) => dns.lookup(host, { all: true }))
  const log = option.log ?? ((line) => console.log(line))
  const limit = { dispatch: 30, tcp: 10, package: 5, ...option.rateLimit }
  const idleMs = option.idleMs ?? 60_000
  const maxSessionMs = option.maxSessionMs ?? 10 * 60_000
  const maxByte = option.maxByte ?? 50 * 1024 * 1024
  const fetchImpl = option.fetch ?? fetch

  // Per-IP, per-route sliding window, in memory.
  const hit = new Map()
  function limited(route, ip) {
    const now = Date.now()
    const key = `${route}|${ip}`
    const recent = (hit.get(key) ?? []).filter((time) => now - time < 60_000)
    if (recent.length >= limit[route]) {
      hit.set(key, recent)
      return true
    }
    recent.push(now)
    hit.set(key, recent)
    return false
  }
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, time] of hit) {
      const recent = time.filter((x) => now - x < 60_000)
      if (recent.length) hit.set(key, recent)
      else hit.delete(key)
    }
  }, 60_000)
  sweep.unref()

  // Cloud Run appends the real client address as the last X-Forwarded-For entry.
  function clientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    return forwarded.at(-1) ?? req.socket.remoteAddress ?? 'unknown'
  }

  function originState(req, required) {
    const origin = req.headers.origin
    if (origin === undefined) return required ? 'missing' : 'none'
    return allowOrigin.includes(origin) ? 'ok' : 'denied'
  }

  let packageCache = null
  let packageInflight = null
  async function loadPackage() {
    if (packageCache) return packageCache
    packageInflight ??= (async () => {
      const response = await fetchImpl(packageUrl, { signal: AbortSignal.timeout(120_000) })
      if (!response.ok || !response.body) throw new Error('upstream status')
      const declared = Number(response.headers.get('content-length') ?? 0)
      if (declared > PACKAGE_MAX_BYTE) throw new Error('too large')
      const chunk = []
      let total = 0
      for await (const part of response.body) {
        total += part.length
        if (total > PACKAGE_MAX_BYTE) throw new Error('too large')
        chunk.push(part)
      }
      packageCache = Buffer.concat(chunk)
      return packageCache
    })().finally(() => { packageInflight = null })
    return packageInflight
  }

  function send(res, status, body, type = 'text/plain; charset=utf-8') {
    res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) })
    res.end(body)
  }

  async function handlePackage(req, res) {
    if (req.method !== 'GET') return send(res, 405, 'method not allowed')
    if (limited('package', clientIp(req))) return send(res, 429, 'too many requests')
    try {
      const body = await loadPackage()
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': body.length, 'cache-control': 'public, max-age=3600' })
      res.end(body)
    } catch {
      send(res, 502, 'upstream failure')
    }
  }

  async function handleDispatch(req, res, url) {
    if (req.method !== 'GET') return send(res, 405, 'method not allowed')
    if (limited('dispatch', clientIp(req))) return send(res, 429, 'too many requests')
    const q = url.searchParams
    const h = q.get('h')
    const t = q.get('t') ?? ''
    const f = q.get('f') ?? ''
    const v = q.get('v') ?? ''
    if ((h !== '0' && h !== '1') || !/^\d{9}$/.test(t) || !/^[A-Za-z0-9]{2,20}$/.test(f) || !/^[0-9.]{1,15}$/.test(v)) {
      return send(res, 400, 'bad parameter')
    }
    try {
      const target = `${dispatchBase[Number(h)]}/tinDispatcherSFTP.php?t=${t}&f=${f}&v=${v}`
      const response = await fetchImpl(target, { signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS), redirect: 'manual' })
      if (!response.ok || !response.body) throw new Error('upstream status')
      const chunk = []
      let total = 0
      for await (const part of response.body) {
        chunk.push(part)
        total += part.length
        if (total >= DISPATCH_MAX_BYTE) break
      }
      const body = Buffer.concat(chunk).subarray(0, DISPATCH_MAX_BYTE)
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store' })
      res.end(body)
    } catch {
      send(res, 502, 'upstream failure')
    }
  }

  const server = http.createServer(async (req, res) => {
    const started = Date.now()
    let path = '?'
    try {
      const url = new URL(req.url, 'http://relay.local')
      path = url.pathname
      res.on('finish', () => log(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`))
      const known = path === '/package' || path === '/dispatch'
      if (!known) return send(res, 404, 'not found')
      const state = originState(req, path === '/dispatch')
      if (state === 'denied' || state === 'missing') return send(res, 403, 'origin not allowed')
      if (state === 'ok') {
        res.setHeader('access-control-allow-origin', req.headers.origin)
        res.setHeader('access-control-expose-headers', 'content-length')
        res.setHeader('vary', 'origin')
      }
      if (req.method === 'OPTIONS') {
        res.setHeader('access-control-allow-methods', 'GET')
        res.setHeader('access-control-max-age', '600')
        res.writeHead(204)
        return res.end()
      }
      if (path === '/package') return await handlePackage(req, res)
      return await handleDispatch(req, res, url)
    } catch {
      if (!res.headersSent) send(res, 500, 'error')
      else res.end()
    }
  })

  // ---- /tcp ----
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })

  function refuse(socket, status, text, req, started) {
    log(`${req.method} /tcp ${status} ${Date.now() - started}ms`)
    socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  }

  async function connectTarget(host, port) {
    if (testTcp && `${host}:${port}` === testTcp) {
      return connect(host, port)
    }
    const address = await lookup(host)
    if (!address.length || address.some((x) => isPrivateAddress(x.address))) {
      const error = new Error('private address')
      error.code = 'PRIVATE'
      throw error
    }
    // Connect to the address we checked, so DNS cannot change between check and use.
    return connect(address[0].address, port)
  }

  function connect(host, port) {
    return new Promise((resolve, reject) => {
      const tcp = net.connect({ host, port: Number(port) })
      tcp.setNoDelay(true)
      tcp.once('connect', () => { tcp.removeListener('error', reject); resolve(tcp) })
      tcp.once('error', reject)
      tcp.setTimeout(10_000, () => tcp.destroy(new Error('connect timeout')))
    })
  }

  server.on('upgrade', async (req, socket, head) => {
    const started = Date.now()
    socket.on('error', () => {})
    let url
    try { url = new URL(req.url, 'http://relay.local') } catch { return refuse(socket, 400, 'Bad Request', req, started) }
    if (url.pathname !== '/tcp') {
      log(`${req.method} ${url.pathname} 404 ${Date.now() - started}ms`)
      return socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    }
    if (originState(req, true) !== 'ok') return refuse(socket, 403, 'Forbidden', req, started)
    if (limited('tcp', clientIp(req))) return refuse(socket, 429, 'Too Many Requests', req, started)
    const host = (url.searchParams.get('host') ?? '').toLowerCase()
    const port = url.searchParams.get('port') ?? ''
    const isTest = testTcp !== '' && `${host}:${port}` === testTcp
    if (!isTest && (!hostAllowed(host) || !/^\d{1,5}$/.test(port) || !tcpPort.includes(port))) {
      return refuse(socket, 400, 'Bad Request', req, started)
    }
    let tcp
    try {
      tcp = await connectTarget(host, port)
    } catch (error) {
      return refuse(socket, error.code === 'PRIVATE' ? 403 : 502, error.code === 'PRIVATE' ? 'Forbidden' : 'Bad Gateway', req, started)
    }
    // The target may speak first (SSH banner), so hold its bytes until the socket is upgraded.
    tcp.pause()
    tcp.setTimeout(0)
    if (socket.destroyed) return tcp.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => {
      log(`${req.method} /tcp 101 ${Date.now() - started}ms`)
      pipe(ws, tcp)
    })
  })

  function pipe(ws, tcp) {
    let fromClient = 0
    let fromTarget = 0
    let done = false
    let idle
    const finish = (code = 1000) => {
      if (done) return
      done = true
      clearTimeout(idle)
      clearTimeout(cap)
      tcp.destroy()
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close(code)
      setTimeout(() => ws.terminate(), 2000).unref()
    }
    const touch = () => {
      clearTimeout(idle)
      idle = setTimeout(() => finish(1001), idleMs)
    }
    const cap = setTimeout(() => finish(1001), maxSessionMs)
    touch()

    ws.on('message', (data, isBinary) => {
      if (!isBinary) return finish(1003)
      touch()
      const buffer = Buffer.isBuffer(data) ? data : Buffer.concat(data)
      fromClient += buffer.length
      if (fromClient > maxByte) return finish(1009)
      if (!tcp.write(buffer)) {
        ws._socket?.pause()
        tcp.once('drain', () => ws._socket?.resume())
      }
    })
    tcp.on('data', (buffer) => {
      touch()
      fromTarget += buffer.length
      if (fromTarget > maxByte) return finish(1009)
      ws.send(buffer, { binary: true }, () => {
        if (!done && ws.bufferedAmount < 256 * 1024) tcp.resume()
      })
      if (ws.bufferedAmount > 1024 * 1024) tcp.pause()
    })
    tcp.on('end', () => finish(1000))
    tcp.on('error', () => finish(1011))
    tcp.on('close', () => finish(1000))
    ws.on('close', () => finish())
    ws.on('error', () => finish(1011))
    tcp.resume()
  }

  return {
    server,
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)))
    },
    close() {
      clearInterval(sweep)
      for (const client of wss.clients) client.terminate()
      server.closeAllConnections?.()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const relay = createRelay()
  const port = Number(process.env.PORT ?? 10950)
  relay.listen(port, '0.0.0.0').then((bound) => console.log(`relay listening on ${bound}`))
  const stop = () => relay.close().then(() => process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
