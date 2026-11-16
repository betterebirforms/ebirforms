# ebirforms relay

A small server that lets the web version of ebirforms send returns to BIR. A browser cannot speak plain HTTP to BIR's dispatcher (no CORS, no HTTPS) or open a TCP connection. This relay is a blind pipe for those two gaps. The browser runs SSH and SFTP itself.

## What it can reach

Only three things, everything else answers 404:

- `GET /package`: BIR's public zip, from one fixed URL. Kept in memory after the first fetch. Refuses more than 200 MB.
- `GET /dispatch?h=<0|1>&t=<9 digits>&f=<form code>&v=<version>`: BIR's tinDispatcherSFTP page on `birgovph.com` (h=0) or `ws1.birgovph.com` (h=1). Params are checked strictly. 8 second timeout. The answer is cut at 8192 bytes.
- WebSocket `/tcp?host=<name>&port=<n>`: a TCP pipe. The host must be a DNS name ending in `.gov.ph` or `.birgovph.com` (no IP addresses). The port must be in `TCP_PORT`. After DNS lookup, private, loopback and link-local addresses are refused. Idle limit 60 s, session limit 10 min, 50 MB per direction.

Only the origins in `ALLOW_ORIGIN` may call it. `/tcp` and `/dispatch` refuse requests with no Origin.

## What it never sees

- Credentials. The SSH handshake and login happen inside the browser. The relay moves encrypted bytes.
- The return. The relay never sees the plaintext, only the encrypted stream.
- The TIN in logs. It logs method, path, status and duration. Never the query string, a body or a frame.

The one thing it does see is the `/dispatch` query, because it forwards it. It does not keep it.

## Environment variables

| Name | Default | Meaning |
|---|---|---|
| `PORT` | `10950` | Port to listen on. Cloud Run sets it. |
| `ALLOW_ORIGIN` | `https://betterebirforms.github.io,http://127.0.0.1:10900,http://localhost:10900` | Comma list of allowed Origins. |
| `TCP_PORT` | `8022` | Comma list of ports `/tcp` may connect to. |
| `RELAY_TEST_TCP` | unset | Tests only. Allows exactly one target, `127.0.0.1:PORT`, for a local SFTP server. It skips every host and address check. Never set it in production. |

Limits per client IP per minute: `/dispatch` 30, `/tcp` 10, `/package` 5. They are kept in memory, so each instance counts on its own.

## Run and test

```sh
cd relay
npm install
npm start       # http://127.0.0.1:10950
npm test        # node --test, never touches the internet
```

## Deploy to Google Cloud Run

```sh
gcloud run deploy ebirforms-relay \
  --source relay \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --max-instances 3 \
  --min-instances 0 \
  --timeout 900 \
  --concurrency 50 \
  --set-env-vars ALLOW_ORIGIN=https://betterebirforms.github.io
```
