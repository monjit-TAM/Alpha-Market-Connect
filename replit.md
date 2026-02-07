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
- **Payments**: Cashfree Payment Gateway (Production mode, cashfree-pg SDK v5)

## Recent Changes
- Integrated Cashfree Payment Gateway for subscription payments
- Payment flow: Plan Selection → Create Order (Cashfree API) → Cashfree JS SDK Checkout → Callback Verification → Subscription Activation
- Added `payments` table tracking order_id, cf_order_id, payment_session_id, status, payment_method, cf_payment_id
- Backend routes: POST /api/payments/create-order, POST /api/payments/verify, POST /api/webhooks/cashfree
- GET /api/payments/history (user), GET /api/advisor/payments (advisor with enriched customer/strategy/plan names)
- Payment callback page (/payment-callback) with auto-verification polling and success/failure states
- Advisor dashboard: Payments section with total revenue, successful/pending counts, transaction history table
- Subscription is only created AFTER successful payment (not before)
- Webhook handler processes PAYMENT_SUCCESS_WEBHOOK and ORDER_PAID events with idempotent subscription creation
- Security: Payment verify uses dual-auth (session OR HMAC verify token) to handle session-loss during Cashfree redirect
- Security: Verify token is time-limited (3-hour HMAC with hour-bucket), timing-safe comparison, length-validated
- Security: Webhook signature and timestamp headers are mandatory (rejects if missing)
- Security: Idempotent subscription creation with double-check to prevent race conditions between webhook and verify endpoint
- Sitemap uses SITE_DOMAIN env var (production: alphamarket.co.in) for correct URLs
- Added Draft tab in strategy management: Active | Closed | Draft tabs for managing call/position lifecycle
- Draft/Watchlist items saved privately with Publish button to go live when ready
- Added `publishMode` column to calls table (draft/watchlist/live) for parity with positions
- AddStockSheet now uses publishMode dropdown (Draft/Watchlist/Live) instead of Published checkbox
- Edit Call/Position dialogs now include Rationale field for editing before publishing
- Added POST /api/calls/:id/publish and POST /api/positions/:id/publish routes for draft→live publishing
- PATCH /api/calls/:id and PATCH /api/positions/:id now support updating rationale
- Fixed zero-value display: exitPrice, gainPercent, sellPrice now use null checks instead of truthy checks
- Added ClosePositionDialog with exit price input field for proper position closing workflow
- Closed items display: close price, gain/loss %, and closed date/time in both strategy detail and advisor dashboard
- Performance chart falls back to list view when all CAGR values are 0/null
- Added content detail page (`/content/:id`) with full article view, attachment rendering (images, videos, audio, PDFs)
- Market Outlook and Learn pages now have clickable "Read More" links to content detail view
- Strategy detail page now fetches and displays positions (F&O) alongside calls in active/closed sections
- Position close endpoint now captures exit price, exit date, and auto-calculates gain% respecting buy/sell direction
- Calls Report CSV now includes entry date/time, exit date/time, exit price, gain%, and both calls AND positions data
- Added public API routes: `/api/content/:id` (single content), `/api/strategies/:id/positions` (public positions with subscription gating)
- Added `attachments` text array column to content table for multi-format content publishing
- Added `exitPrice`, `exitDate`, `gainPercent` columns to positions table for exit tracking
- Fixed F&O P&L calculation: now uses live option premium (CE/PE LTP) instead of underlying index/stock LTP
- P&L for Sell positions calculates inversely (entry - LTP) / entry
- Option chain data fetched per strategy for active F&O positions to resolve live option premiums
- Added manual entry toggle for expiry date and strike price in Add Position form
- Live option premium auto-displayed near Entry Price field when symbol + expiry + strike selected
- Added F&O option chain integration: expiry date dropdown and strike price dropdown populated from Groww API option chain endpoint
- Live option premium display when selecting a strike price (shows CE/PE LTP)
- Added F&O publish flow with three modes: Draft (save privately), Watchlist (monitor), Live (active recommendation)
- Added `publishMode` column to positions table (draft/watchlist/live)
- Added rationale requirement: advisors cannot publish calls/positions without typing rationale (frontend validation + backend 400 enforcement)
- Added rationale display, created date/time, and closed date/time across strategy detail page and advisor dashboard
- Added GET /api/option-chain/expiries and GET /api/option-chain routes for Groww API option chain data
- Completed Groww API integration with proper two-step authentication (API Key + Secret → SHA256 checksum → access token exchange)
- Access tokens are cached and auto-refresh before daily 6:00 AM IST expiry
- Live market prices now fully functional: LTP display with change indicators on strategy detail page and advisor dashboard
- Bulk LTP endpoint uses Groww's efficient batch API (up to 50 symbols per request)
- Live prices auto-refresh every 15 seconds on frontend for active calls/positions
- Added comprehensive advisor call management: expandable strategy cards showing active/closed calls & positions with edit target/SL and close actions
- Added NSE/BSE/MCX symbol autocomplete (165+ symbols) in Add Stock Call and Add Position sheets
- Added subscription gating on strategy detail page: active recommendations locked behind subscription for non-subscribers
- Added intraday auto-square-off scheduler (3:25 PM IST) that automatically closes active calls/positions for Intraday strategies
- Added PATCH /api/calls/:id, POST /api/calls/:id/close, PATCH /api/positions/:id, POST /api/positions/:id/close routes
- Added GET /api/strategies/:id/subscription-status route for checking subscription
- Added GET /api/symbols/search?q=&segment= route for symbol autocomplete
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
- Added admin Settings page (/admin/settings) with Groww access token management
- Groww token supports dual modes: manual paste (admin portal) and automatic API Key+Secret flow
- Admin can view token status (active/expired/none), source, set time, and expiry
- Added GET /api/admin/groww-token-status and POST /api/admin/groww-token admin routes

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
users, strategies, calls, positions, plans, subscriptions, content, scores, payments

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

## Key Files (New)
- server/data/nse-symbols.json - Static NSE/BSE/MCX symbol list for autocomplete
- server/scheduler.ts - Intraday auto-square-off scheduler

## Key API Routes
- POST /api/auth/register, /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- GET /api/strategies/public, /api/strategies/:id, /api/strategies/:id/calls
- GET /api/advisors, /api/advisors/:id
- POST /api/strategies/:id/subscribe (requires auth)
- Advisor dashboard: GET/POST /api/advisor/strategies, plans, content, scores, subscribers
- PATCH /api/advisor/profile
- GET /api/advisor/reports/download?type=...
- Admin: GET/PATCH/DELETE /api/admin/users/:id, GET/PATCH/DELETE /api/admin/strategies/:id
