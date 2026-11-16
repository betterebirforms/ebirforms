import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { WebSocket } from 'ws'
import { createRelay, isPrivateAddress } from './server.mjs'

const GOOD = 'http://127.0.0.1:10900'
const noLog = () => {}

function listenHttp(handler) {
  const server = http.createServer(handler)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })))
}

function get(port, path, header = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers: header, agent: false }, (res) => {
      const chunk = []
      res.on('data', (x) => chunk.push(x))
      res.on('end', () => resolve({ status: res.statusCode, header: res.headers, body: Buffer.concat(chunk) }))
    }).on('error', reject)
  })
}

function openSocket(port, query, origin = GOOD) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/tcp?${query}`, origin ? { origin } : {})
    ws.on('open', () => resolve({ ws, status: 101 }))
    ws.on('unexpected-response', (req, res) => { res.resume(); resolve({ status: res.statusCode }) })
    ws.on('error', () => {})
  })
}

let echo, mockDispatch, mockOther, mockPackage, relay, port
const seen = []
let packageHit = 0

before(async () => {
  echo = net.createServer((socket) => socket.on('data', (x) => socket.write(x)))
  await new Promise((resolve) => echo.listen(0, '127.0.0.1', resolve))
  mockDispatch = await listenHttp((req, res) => { seen.push(['h0', req.url]); res.end('ok-h0 ' + 'x'.repeat(20000)) })
  mockOther = await listenHttp((req, res) => { seen.push(['h1', req.url]); res.end('ok-h1') })
  mockPackage = await listenHttp((req, res) => { packageHit++; res.writeHead(200, { 'content-length': 5 }); res.end('PKZIP') })
  relay = createRelay({
    allowOrigin: [GOOD],
    testTcp: `127.0.0.1:${echo.address().port}`,
    dispatchBase: [`http://127.0.0.1:${mockDispatch.port}`, `http://127.0.0.1:${mockOther.port}`],
    packageUrl: `http://127.0.0.1:${mockPackage.port}/pkg.zip`,
    lookup: async (host) => [{ address: host.startsWith('private') ? '10.0.0.5' : '203.0.113.9', family: 4 }],
    rateLimit: { dispatch: 1000, tcp: 1000, package: 1000 },
    log: noLog,
  })
  port = await relay.listen(0)
})

after(async () => {
  await relay.close()
  for (const s of [echo, mockDispatch.server, mockOther.server, mockPackage.server]) s.close()
})

test('unknown path is 404', async () => {
  assert.equal((await get(port, '/', { origin: GOOD })).status, 404)
  assert.equal((await get(port, '/other', { origin: GOOD })).status, 404)
})

test('origin: other origin 403, none refused on /dispatch, CORS header on allowed', async () => {
  const q = '/dispatch?h=0&t=123456789&f=1701&v=7.9.6.2'
  assert.equal((await get(port, q, { origin: 'https://evil.example' })).status, 403)
  assert.equal((await get(port, q)).status, 403)
  const ok = await get(port, q, { origin: GOOD })
  assert.equal(ok.status, 200)
  assert.equal(ok.header['access-control-allow-origin'], GOOD)
  assert.equal((await get(port, '/package', { origin: 'https://evil.example' })).status, 403)
})

test('/dispatch bad params are 400', async () => {
  const header = { origin: GOOD }
  for (const q of [
    'h=2&t=123456789&f=1701&v=7.9', 'h=0&t=12345678&f=1701&v=7.9', 'h=0&t=1234567890&f=1701&v=7.9',
    'h=0&t=123456789&f=x&v=7.9', 'h=0&t=123456789&f=17%2001&v=7.9', 'h=0&t=123456789&f=1701&v=7.9a',
    'h=0&t=123456789&f=1701&v=', 't=123456789&f=1701&v=7.9',
  ]) assert.equal((await get(port, `/dispatch?${q}`, header)).status, 400, q)
})

test('/dispatch forwards to the right base and truncates to 8192 bytes', async () => {
  const header = { origin: GOOD }
  const zero = await get(port, '/dispatch?h=0&t=123456789&f=1701&v=7.9.6.2', header)
  assert.equal(zero.status, 200)
  assert.match(zero.header['content-type'], /^text\/plain/)
  assert.equal(zero.body.length, 8192)
  const one = await get(port, '/dispatch?h=1&t=123456789&f=1701Q&v=7.9.6.2', header)
  assert.equal(one.body.toString(), 'ok-h1')
  assert.deepEqual(seen.at(-2), ['h0', '/tinDispatcherSFTP.php?t=123456789&f=1701&v=7.9.6.2'])
  assert.deepEqual(seen.at(-1), ['h1', '/tinDispatcherSFTP.php?t=123456789&f=1701Q&v=7.9.6.2'])
})

test('/dispatch upstream failure is 502', async () => {
  const dead = createRelay({ allowOrigin: [GOOD], dispatchBase: ['http://127.0.0.1:1', 'http://127.0.0.1:1'], log: noLog })
  const p = await dead.listen(0)
  assert.equal((await get(p, '/dispatch?h=0&t=123456789&f=1701&v=7.9', { origin: GOOD })).status, 502)
  await dead.close()
})

test('/package is cached after the first fetch and passes Content-Length', async () => {
  const first = await get(port, '/package')
  const second = await get(port, '/package', { origin: GOOD })
  assert.equal(first.status, 200)
  assert.equal(first.header['content-length'], '5')
  assert.equal(second.body.toString(), 'PKZIP')
  assert.equal(packageHit, 1)
})

test('/package refuses an oversized upstream', async () => {
  const big = await listenHttp((req, res) => { res.writeHead(200, { 'content-length': 300 * 1024 * 1024 }); res.end() })
  const r = createRelay({ allowOrigin: [GOOD], packageUrl: `http://127.0.0.1:${big.port}/x`, log: noLog })
  const p = await r.listen(0)
  assert.equal((await get(p, '/package')).status, 502)
  await r.close()
  big.server.close()
})

test('/tcp refuses bad targets', async () => {
  const echoPort = echo.address().port
  const cases = [
    [`host=127.0.0.1&port=${echoPort + 1}`, 400],
    ['host=127.0.0.1&port=8022', 400],
    ['host=93.184.216.34&port=8022', 400],
    ['host=%5B%3A%3A1%5D&port=8022', 400],
    ['host=evil.com&port=8022', 400],
    ['host=evilgov.ph&port=8022', 400],
    ['host=gov.ph.evil.com&port=8022', 400],
    ['host=sftp.bir.gov.ph&port=22', 400],
    ['host=sftp.bir.gov.ph&port=', 400],
    ['host=private.bir.gov.ph&port=8022', 403],
  ]
  for (const [query, status] of cases) assert.equal((await openSocket(port, query)).status, status, query)
  assert.equal((await openSocket(port, 'host=x.gov.ph&port=8022', 'https://evil.example')).status, 403)
  assert.equal((await openSocket(port, 'host=x.gov.ph&port=8022', null)).status, 403)
})

test('/tcp round-trip to the one allowed test target', async () => {
  const { ws, status } = await openSocket(port, `host=127.0.0.1&port=${echo.address().port}`)
  assert.equal(status, 101)
  const reply = await new Promise((resolve) => {
    ws.on('message', (data) => resolve(Buffer.from(data)))
    ws.send(Buffer.from([1, 2, 3, 250]))
  })
  assert.deepEqual([...reply], [1, 2, 3, 250])
  ws.close()
})

test('/tcp closes after the per-direction byte cap', async () => {
  const r = createRelay({ allowOrigin: [GOOD], testTcp: `127.0.0.1:${echo.address().port}`, maxByte: 10, log: noLog })
  const p = await r.listen(0)
  const { ws } = await openSocket(p, `host=127.0.0.1&port=${echo.address().port}`)
  const code = await new Promise((resolve) => { ws.on('close', resolve); ws.send(Buffer.alloc(11)) })
  assert.equal(code, 1009)
  await r.close()
})

test('rate limit answers 429', async () => {
  const base = `http://127.0.0.1:${mockOther.port}`
  const r = createRelay({ allowOrigin: [GOOD], rateLimit: { dispatch: 2 }, dispatchBase: [base, base], log: noLog })
  const p = await r.listen(0)
  const status = []
  for (let i = 0; i < 3; i++) status.push((await get(p, '/dispatch?h=0&t=123456789&f=1701&v=7.9', { origin: GOOD })).status)
  assert.deepEqual(status, [200, 200, 429])
  await r.close()
})

test('log line has no query string', async () => {
  const line = []
  const base = `http://127.0.0.1:${mockOther.port}`
  const r = createRelay({ allowOrigin: [GOOD], dispatchBase: [base, base], log: (x) => line.push(x) })
  const p = await r.listen(0)
  await get(p, '/dispatch?h=0&t=123456789&f=1701&v=7.9', { origin: GOOD })
  await r.close()
  assert.equal(line.length, 1)
  assert.match(line[0], /^GET \/dispatch 200 \d+ms$/)
  assert.ok(!line[0].includes('123456789'))
})

test('isPrivateAddress', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', 'not-an-ip']) assert.equal(isPrivateAddress(a), true, a)
  for (const a of ['8.8.8.8', '203.0.113.9', '2606:4700::1111']) assert.equal(isPrivateAddress(a), false, a)
})
