Social Scheduler — Build Docs
A multi-tenant social media scheduling platform for a digital marketing agency: agency
staff manage a list of clients, each client connects their own social accounts through OAuth,
and the platform publishes to those accounts on a schedule — a RecurPost-style tool,
scoped for agency use rather than a single company managing its own accounts.

Contents
01-architecture.md — tenant model (Agency → Client → Social Account) and the

full database schema

02-oauth-flows.md — the general OAuth pattern, the state /CSRF design, and per-

platform specifics for Google Business Profile, LinkedIn, and Meta (Facebook +
Instagram)
03-api-and-publishers.md — API route design, shared types, the
SocialPublisher interface, and the scheduler
04-security.md — token-handling rules, encryption, and required environment
variables
05-roadmap.md — an 11-stage build order, each stage scoped to one Antigravity
session, with a ready-to-paste prompt

Tech stack
Next.js (App Router) + TypeScript, Supabase (Postgres + Auth + Storage), deployed on
Vercel. The scheduler is cron-based for v1 — see 03-api-and-publishers.md for the later
migration path to a job queue.

How to use this with Antigravity
Save these six files into a docs/ folder in your project, then work through 05-roadmap.md
one stage at a time — paste each stage's prompt into Antigravity, pointing it at the doc(s)
that stage references. Don't ask it to build the whole platform in one prompt: that's how you
end up with OAuth code nobody on the team can debug. Verify each stage (most have an
explicit manual check) before starting the next.

Before you build
OAuth scopes, API versions, and app-review requirements for Meta, LinkedIn, and Google
Business Profile change over time. Treat the specifics in 02-oauth-flows.md as a starting
point and recheck each platform's current developer docs immediately before
implementing that platform — not weeks in advance.

