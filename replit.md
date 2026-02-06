# AlphaMarket - SaaS Advisory Marketplace

## Overview
AlphaMarket is a SaaS marketplace platform connecting SEBI-registered Indian advisors (RA/RIA) with investors and brokers. Advisors can create and manage investment strategies across multiple segments and types, publish actionable calls, track revenue, manage subscribers, and download compliance reports. Includes admin approval workflow for advisors.

## Current State
- Fully functional MVP with database, backend API, and frontend
- Seed data with 6 sample advisors, 7+ strategies, sample calls/plans/content
- Authentication (session-based with scrypt password hashing)
- Public marketplace and advisor dashboard
- Admin dashboard with user/strategy management and advisor approval workflow
- Role-based access control: admin, advisor, investor

## Tech Stack
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui, wouter (routing), TanStack Query
- **Backend**: Express.js + TypeScript, express-session
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Auth**: Session-based with scrypt password hashing

## Recent Changes
- Added Forgot Password flow with email-based password reset (token expires in 1 hour)
- Login now accepts username OR email
- Registration now sends welcome/confirmation email to the user (in addition to admin notification)
- Public strategies page now filters out strategies from unapproved advisors
- Added password_reset_tokens table for secure password reset tokens
- Enhanced strategy management: Horizon column in table, Edit Strategy in actions dropdown, plan mapping with checkboxes
- Strategy actions dropdown now filters call types by strategy type (Equity→Stock Call, Option→Option Call, etc.)
- Added `planIds` array column to strategies table for flexible pricing plan mapping
- Secured PATCH/DELETE strategy routes with advisor ownership verification
- Added Market Outlook page (`/market-outlook`) showing MarketUpdate content from all advisors
- Added Learn page (`/learn`) showing Learn/research content from all advisors
- Added public API route `GET /api/content/public/:type` for fetching content by type with advisor info
- Replaced AlphaMarket logo with custom uploaded logo image
- Added Market Outlook and Learn navigation links to navbar
- Integrated SendGrid email notifications on new user registrations
- Integrated Replit Object Storage for SEBI certificate file uploads

## Project Structure
```
shared/schema.ts          - Database schema (8 tables), Zod schemas, types
server/index.ts           - Express server entry
server/routes.ts          - All API routes (public, advisor, admin)
server/storage.ts         - Database storage layer (IStorage interface + DatabaseStorage)
server/db.ts              - Drizzle database connection
server/seed.ts            - Seed data (6 advisors, 1 admin, 1 investor, strategies, calls, plans, content, scores)
client/src/App.tsx        - Root app with routes
client/src/lib/auth.tsx   - Auth context provider
client/src/lib/queryClient.ts - TanStack Query config
client/src/components/navbar.tsx - Shared navbar (role-aware)
client/src/pages/home.tsx - Landing page
client/src/pages/auth.tsx - Login & Register pages (role-based redirect)
client/src/pages/strategies-marketplace.tsx - Public strategies browse
client/src/pages/strategy-detail.tsx - Strategy detail with calls
client/src/pages/advisors-listing.tsx - Public advisors browse
client/src/pages/advisor-detail.tsx - Advisor profile detail
client/src/pages/market-outlook.tsx - Public Market Outlook page
client/src/pages/learn.tsx - Public Learn/research page
client/src/pages/dashboard/index.tsx - Advisor dashboard layout with sidebar
client/src/pages/dashboard/dashboard-home.tsx - Advisor dashboard home
client/src/pages/dashboard/strategy-management.tsx - CRUD strategies + calls + positions
client/src/pages/dashboard/plans.tsx - Plans & subscribers management
client/src/pages/dashboard/content-page.tsx - Content management
client/src/pages/dashboard/reports.tsx - Report downloads (CSV)
client/src/pages/dashboard/advisor-profile.tsx - Profile & SCORES settings
client/src/pages/admin/index.tsx - Admin dashboard layout with sidebar
client/src/pages/admin/admin-advisors.tsx - User management (approve/disapprove/edit/delete)
client/src/pages/admin/admin-strategies.tsx - Strategy management (edit/delete any)
```

## Database Tables
users, strategies, calls, positions, plans, subscriptions, content, scores

## Design
- Primary: warm red (hsl 10 72% 48%)
- Accent: green (hsl 145 45% 42%)
- Brand: AlphaMarket with TrendingUp icon

## Test Credentials
- Admin: username `admin`, password `admin123`
- Advisor: username `stokwiz`, password `advisor123`
- Investor: username `investor1`, password `investor123`

## Admin Features
- Approve/disapprove advisors (only approved advisors show publicly)
- Edit/delete any user (company name, email, phone, SEBI reg, overview)
- Edit/delete any strategy (name, description, status, horizon, risk, volatility)
- Search and filter users by role; strategies by status and type
- New advisor registrations require SEBI Registration Number and Certificate URL
- New advisors default to isApproved=false until admin approves

## Key API Routes
- POST /api/auth/register, /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- GET /api/strategies/public, /api/strategies/:id, /api/strategies/:id/calls
- GET /api/advisors, /api/advisors/:id
- POST /api/strategies/:id/subscribe (requires auth)
- Advisor dashboard: GET/POST /api/advisor/strategies, plans, content, scores, subscribers
- PATCH /api/advisor/profile
- GET /api/advisor/reports/download?type=...
- Admin: GET/PATCH/DELETE /api/admin/users/:id, GET/PATCH/DELETE /api/admin/strategies/:id
