# AlphaMarket - SaaS Advisory Marketplace

## Overview
AlphaMarket is a SaaS marketplace platform connecting SEBI-registered Indian advisors (RA/RIA) with investors and brokers. Advisors can create and manage investment strategies across multiple segments and types, publish actionable calls, track revenue, manage subscribers, and download compliance reports.

## Current State
- Fully functional MVP with database, backend API, and frontend
- Seed data with 3 sample advisors, 7 strategies, sample calls/plans/content
- Authentication (session-based with scrypt password hashing)
- Public marketplace and advisor dashboard

## Tech Stack
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui, wouter (routing), TanStack Query
- **Backend**: Express.js + TypeScript, express-session
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Auth**: Session-based with scrypt password hashing

## Project Structure
```
shared/schema.ts          - Database schema (8 tables), Zod schemas, types
server/index.ts           - Express server entry
server/routes.ts          - All API routes
server/storage.ts         - Database storage layer (IStorage interface + DatabaseStorage)
server/db.ts              - Drizzle database connection
server/seed.ts            - Seed data (3 advisors, 7 strategies, calls, plans, content, scores)
client/src/App.tsx        - Root app with routes
client/src/lib/auth.tsx   - Auth context provider
client/src/lib/queryClient.ts - TanStack Query config
client/src/components/navbar.tsx - Shared navbar
client/src/pages/home.tsx - Landing page
client/src/pages/auth.tsx - Login & Register pages
client/src/pages/strategies-marketplace.tsx - Public strategies browse
client/src/pages/strategy-detail.tsx - Strategy detail with calls
client/src/pages/advisors-listing.tsx - Public advisors browse
client/src/pages/advisor-detail.tsx - Advisor profile detail
client/src/pages/dashboard/index.tsx - Dashboard layout with sidebar
client/src/pages/dashboard/dashboard-home.tsx - Advisor dashboard home
client/src/pages/dashboard/strategy-management.tsx - CRUD strategies + calls + positions
client/src/pages/dashboard/plans.tsx - Plans & subscribers management
client/src/pages/dashboard/content-page.tsx - Content management
client/src/pages/dashboard/reports.tsx - Report downloads (CSV)
client/src/pages/dashboard/advisor-profile.tsx - Profile & SCORES settings
```

## Database Tables
users, strategies, calls, positions, plans, subscriptions, content, scores

## Design
- Primary: warm red (hsl 10 72% 48%)
- Accent: green (hsl 145 45% 42%)
- Brand: AlphaMarket with TrendingUp icon

## Test Credentials
- Advisor: username `stokwiz`, password `advisor123`
- Investor: username `investor1`, password `investor123`

## Key API Routes
- POST /api/auth/register, /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- GET /api/strategies/public, /api/strategies/:id, /api/strategies/:id/calls
- GET /api/advisors, /api/advisors/:id
- POST /api/strategies/:id/subscribe (requires auth)
- Advisor dashboard: GET/POST /api/advisor/strategies, plans, content, scores, subscribers
- PATCH /api/advisor/profile
- GET /api/advisor/reports/download?type=...
