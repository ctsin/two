# Plan: "Two" — Personal Instant Messenger

A private 1-on-1 messaging web app for 2-5 users with text, image, video, and file support, E2E encryption, and real-time delivery. Hono on Cloudflare Workers backend, React frontend, Turborepo monorepo.

## Key Decisions

| Topic | Decision |
|---|---|
| Backend | Hono on Cloudflare Workers |
| Frontend | React (Vite) + shadcn/ui + Tailwind, hosted on Cloudflare Pages |
| Auth | Phone-number-only login via `#phonenumber` in message input → DB lookup → JWT |
| Chat model | 1-on-1 only |
| Real-time | Durable Objects with WebSocket Hibernation API |
| Storage | D1 (messages/metadata), R2 (media/files) |
| E2E encryption | X25519 key exchange + AES-256-GCM; server stores only ciphertext |
| Media limit | Up to 100MB per file |
| Retention | Permanent |
| Monorepo | Turborepo + pnpm workspaces |
| React Native | Deferred (TODO) |

> **Security note:** Phone-number-only auth is weak — anyone who discovers a user's phone can impersonate them. Acceptable for a tiny private service behind a private domain, but consider adding a PIN/passphrase as a second factor later.

## Cloudflare Services

| Concern | Service |
|---|---|
| Backend API | **Workers** — Hono app, REST + WebSocket upgrade |
| Real-time | **Durable Objects** — per-conversation WebSocket hub with hibernation |
| User & message DB | **D1** (SQLite) — users, conversations, encrypted messages |
| Media storage | **R2** — encrypted images, videos, files |
| Frontend hosting | **Pages** — Vite React SPA at `two.ctsin.dev` |
| Session cache | **KV** (optional) — JWT blocklist for logout/revocation |

## Monorepo Structure

```
two/
├── apps/
│   ├── web/              # React SPA
│   └── api/              # Hono on Workers + Durable Objects
├── packages/
│   ├── shared/           # Drizzle schemas, Zod validators, TS types
│   └── crypto/           # E2E encryption (X25519 + AES-256-GCM)
├── turbo.json
├── pnpm-workspace.yaml
```

## Steps

### Phase 1 — Scaffolding

1. Init Turborepo + pnpm workspaces
2. Scaffold `apps/web` — Vite + React + TS + Tailwind + shadcn/ui
3. Scaffold `apps/api` — Hono with CF Workers template; configure `wrangler.toml` with D1, R2, KV, and Durable Object bindings
4. Create `packages/shared` — Drizzle ORM schema, Zod validators, shared TS types
5. Create `packages/crypto` — E2E encryption module using Web Crypto API (runs in both browser and Workers)
6. Configure Turborepo pipeline (`build`, `dev`, `typecheck`, `lint`)

### Phase 2 — Database & Auth *(depends on Phase 1)*

7. Define D1 schema in `packages/shared` via Drizzle:
   - `users`: `id`, `phone`, `display_name`, `public_key`, `created_at`
   - `conversations`: `id`, `participant_a_id`, `participant_b_id`, `created_at`
   - `messages`: `id`, `conversation_id`, `sender_id`, `type` (text|image|video|file), `encrypted_content`, `media_key` (R2 key, nullable), `iv`, `created_at`
8. Auth endpoints in `apps/api`:
   - `POST /auth/login` — receives `{ phone }`, DB lookup, returns JWT (signed via `hono/jwt`, 7-day expiry)
   - JWT middleware on all other routes
   - `POST /auth/logout` — KV blocklist (optional)
9. Seed initial users via migration or wrangler CLI script

### Phase 3 — E2E Encryption *(depends on Phase 2)*

10. Implement in `packages/crypto`: `generateKeyPair()`, `deriveSharedSecret()`, `encrypt()`, `decrypt()`, and streaming file encrypt/decrypt for media
11. `PUT /users/:id/public-key` — register public key after first login
12. `GET /users/:id/public-key` — fetch other user's public key for ECDH
13. Client stores private key in IndexedDB (never leaves device)

### Phase 4 — Real-Time Messaging *(depends on Phase 2, parallel with Phase 5)*

14. `ChatRoom` Durable Object class: WebSocket Hibernation API, one instance per conversation, broadcasts encrypted messages, stores in D1, handles offline delivery
15. `GET /conversations/:id/ws` — WebSocket upgrade, proxies to Durable Object
16. `GET /conversations` — list user's conversations
17. `GET /conversations/:id/messages?cursor=` — paginated encrypted message history

### Phase 5 — Media Upload & Download *(depends on Phase 3, parallel with Phase 4)*

18. Upload: client encrypts file → `POST /media/upload` stores in R2 → returns `media_key`. For files near 100MB, use presigned R2 URL via `POST /media/presign`
19. Download: `GET /media/:key` returns encrypted binary → client decrypts
20. Client-side encrypted thumbnail generation for images/videos

### Phase 6 — Web Frontend *(depends on Phases 3, 4, 5)*

21. App shell: login screen (message-input where `#phone` triggers auth), conversation list sidebar, chat view (text bubbles, image/video previews, file downloads), message input + attachment button
22. WebSocket client hook with reconnect + exponential backoff; encrypt on send, decrypt on receive
23. State management: Redux Toolkit for auth, conversations, messages
24. IndexedDB (`idb`): store private key, cache decrypted messages

### Phase 7 — Deployment & CI

25. Production `wrangler.toml` with all bindings
26. Cloudflare Pages project for `apps/web`, build via `turbo run build --filter=web`
27. Custom domain `two.ctsin.dev` on Pages + Workers routes
28. GitHub Actions: typecheck → lint → build → deploy

## Verification

1. `curl POST /auth/login` with valid/invalid phone → JWT / 401
2. Unit tests in `packages/crypto` — generate two keypairs, derive shared secrets, encrypt + decrypt text and binary round-trip
3. Two browser tabs as different users → send message → verify real-time delivery + correct decryption
4. Upload 50MB file → download in other user's tab → verify byte-for-byte integrity after decryption
5. Disconnect one user, send message, reconnect → verify offline delivery
6. `wrangler d1 migrations apply` on fresh DB succeeds
7. `turbo run build` from root — zero type errors
8. End-to-end on `two.ctsin.dev`: login → send message → receive → media upload/download

## Excluded from v1

- React Native app (TODO)
- Group chats, message editing/deletion
- Read receipts, typing indicators, push notifications
- Second-factor auth (PIN/passphrase)
- Server-side message search (impossible with E2E; client-side search over cached messages deferred)
