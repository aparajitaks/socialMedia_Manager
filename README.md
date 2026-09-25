# PulseQueue / Postline — Internal Social Media Scheduler

A high-performance, internal social media planning, scheduling, and analytics application built strictly to the specifications in [`social-scheduler-build-spec.md.pdf`](file:///Users/veritan/Work/socialMedia_manager/social-scheduler-build-spec.md.pdf) and styled to match the Figma design system.

---

## 🏗️ Architecture & Project Structure

The project is cleanly decoupled into an independent **Frontend** and **Backend**:

```
socialMedia_manager/
├── frontend/               # Next.js App Router Client (Port 3000)
│   ├── src/
│   │   ├── app/            # App Router (layout, page, clean globals.css)
│   │   ├── components/     # Figma-ported interactive components
│   │   ├── lib/            # Shared API client
│   │   └── types/          # TypeScript interfaces
│   ├── next.config.ts      # API proxy rewrite -> http://localhost:5001
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                # Node.js + Express + TypeScript Server (Port 5001)
│   ├── src/
│   │   ├── routes/         # Express API routes (accounts, posts, metrics, scheduler, cron, auth)
│   │   ├── publishers/     # Platform drivers (LinkedIn, Meta, Google Business, X)
│   │   ├── db.ts           # PostgreSQL / Supabase + JSON persistence
│   │   ├── crypto.ts       # AES-256-GCM token encryption
│   │   ├── types/          # Shared domain types
│   │   └── server.ts       # Express server entry point
│   ├── package.json
│   └── tsconfig.json
│
├── data/                   # Seed database & local JSON store
├── schema.sql              # PostgreSQL DDL
└── package.json            # Root orchestrator scripts
```

---

## 🚀 Quick Start

### Run Both Simultaneously (Recommended)
From the root directory:
```bash
npm run dev
```
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5001](http://localhost:5001)

### Run Individually
```bash
# Run backend only (port 5001)
npm run dev:backend

# Run frontend only (port 3000)
npm run dev:frontend
```

---

## 🛠️ Complete API Contract (Section 5)

| Method | Endpoint | Purpose | Key Fields |
|---|---|---|---|
| `GET` | `/api/accounts` | List connected accounts | `id, platform, display_name, connected_at` |
| `GET` | `/api/accounts/:platform/connect` | Start OAuth flow | Redirects to platform |
| `GET` | `/api/accounts/:platform/callback` | OAuth callback & saves encrypted token | Redirects to `/accounts` |
| `DELETE` | `/api/accounts/:id` | Disconnect an account | `204 No Content` |
| `GET` | `/api/posts?status=&from=&to=` | Filter & list posts | `id, platform, content, status, scheduled_at, error_reason` |
| `POST` | `/api/posts` | Create post group + tailored posts | `label, accounts: [{social_account_id, content, media_urls}], scheduled_at` |
| `GET` | `/api/posts/:id` | Get single post details | Full post row |
| `PATCH` | `/api/posts/:id` | Edit content or schedule | Reject if already published (`400`) |
| `POST` | `/api/posts/:id/retry` | Reset failed post to scheduled | `200` with updated post |
| `POST` | `/api/posts/:id/approve` | Admin approval gate | `200` with updated post (`403` if editor) |
| `GET` | `/api/posts/:id/metrics` | Historical post metrics | Array of `{fetched_at, likes, comments, shares, impressions}` |
| `GET` | `/api/metrics/summary?platform=&from=&to=` | Dashboard rollups | `{platform, total_likes, total_comments, total_shares, total_impressions}[]` |
| `POST` | `/api/scheduler/run` | Run scheduler engine | Processes all due scheduled posts |
| `POST` | `/api/cron/metrics` | Daily metrics sync | Fetches latest stats for published posts |
| `POST` | `/api/cron/refresh-tokens` | Token refresh runner | Refreshes tokens expiring within 7 days |

---

## 🚀 Running the App

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Or build and run production server
npm run build
npm run start
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.
# socialMedia_Manager
