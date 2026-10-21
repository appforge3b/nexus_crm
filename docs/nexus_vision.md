# NEXUS — Sales Intelligence Command Center

> *"Not a CRM. A cockpit."*

---

## The Vision

Every CRM looks the same. Tables. Kanban boards. Grey forms. **NEXUS is different.**

NEXUS is a **dark, immersive command center** — inspired by mission control rooms, sci-fi HUDs, and Bloomberg terminals — where your entire sales universe lives. Every prospect is a living entity with a heartbeat. Every deal pulses with urgency. Every day begins with a tactical briefing.

When you open NEXUS, you don't see a spreadsheet. You see **your world**.

---

## 🏗️ Architecture

### Stack (100% Free / FOSS / Cloudflare)

| Layer | Technology | Cost |
|-------|-----------|------|
| **Frontend** | Vanilla HTML + CSS + JS (zero frameworks, zero dependencies) | Free |
| **Hosting** | Cloudflare Pages | Free |
| **Backend API** | Cloudflare Workers (Hono.js router) | Free tier: 100K req/day |
| **Database** | Cloudflare D1 (SQLite at the edge) | Free tier: 5M rows read/day |
| **File Storage** | Cloudflare R2 | Free tier: 10GB |
| **Auth Sessions** | Cloudflare KV | Free tier: 100K reads/day |
| **Realtime** | Server-Sent Events via Workers | Free |

> [!NOTE]
> Zero vendor lock-in beyond Cloudflare. The frontend is pure web standards. The backend is standard SQL + REST. You can migrate anywhere.

---

## 🎨 Design Philosophy: "The Dark Cockpit"

### Color System
```
Background:      #0a0a0f (Deep void)
Surface:         #12121a (Elevated panels)
Glass:           rgba(255,255,255,0.03) with backdrop-blur(24px)
Primary Accent:  #6366f1 → #8b5cf6 (Indigo → Violet gradient)
Success:         #10b981 (Emerald pulse for wins)
Warning:         #f59e0b (Amber for attention)
Danger:          #ef4444 (Red for urgency)
Text Primary:    #f1f5f9 (Bright white-blue)
Text Muted:      #64748b (Subtle slate)
```

### Visual Signatures
- **Glassmorphism everywhere** — frosted glass panels floating over a living background
- **Ambient particle field** — subtle floating particles in the background that respond to mouse movement
- **Glow effects** — active elements emit soft light halos
- **Micro-animations** — every interaction has weight and physics
- **Data-driven color** — deal cards shift hue based on value and urgency
- **Animated gradients** — borders and accents that breathe with slow color shifts
- **Depth layers** — parallax-like depth with multiple translucent surfaces

---

## 📐 Application Structure

### 1. **THE BRIEFING** (Dashboard / Home)
Your daily mission briefing. Opens with a cinematic fade-in.

```
┌─────────────────────────────────────────────────────────────┐
│  ☀️ Good morning, Puja.              Wednesday, Oct 21 2026 │
│  "You have 7 hot deals worth ₹12.4L closing this week"      │
├──────────┬──────────┬──────────┬────────────────────────────┤
│ PIPELINE │ WON THIS │ CONV.    │                            │
│ ₹47.2L   │ MONTH    │ RATE     │   [PIPELINE FLOW           │
│ 34 deals │ ₹8.1L    │ 32%      │    VISUALIZATION]          │
│ ▲ 12%    │ ▲ 24%    │ ▲ 3pp    │   Animated deal flow       │
├──────────┴──────────┴──────────┤   through stages            │
│                                │                            │
│  🔥 TODAY'S PRIORITIES         │                            │
│  ┌─────────────────────┐      │                            │
│  │ ⚡ Call Ravi @ Tata  │      ├────────────────────────────┤
│  │   ₹3.2L • Closing   │      │ 📊 REVENUE FORECAST        │
│  │   tomorrow          │      │ [Animated area chart]      │
│  ├─────────────────────┤      │                            │
│  │ 📧 Follow up Priya  │      │ Monthly projection with    │
│  │   ₹1.8L • No reply  │      │ confidence bands           │
│  │   since 3 days      │      │                            │
│  └─────────────────────┘      │                            │
│                                │                            │
│  📡 ACTIVITY FEED              │                            │
│  Live stream of recent events  │                            │
└────────────────────────────────┴────────────────────────────┘
```

**Priority Engine (Rule-based, no AI needed):**
- Deals closing within 7 days → 🔴 Critical
- No contact in 5+ days → 🟡 Follow-up needed  
- High-value deals (top 20%) → ⚡ High priority
- Stale deals (no movement 14+ days) → ⚠️ At risk
- Today's scheduled activities → 📋 On deck

### 2. **THE PIPELINE** (Deal Flow)
Not a flat kanban. A **flowing river of deals**.

**Stages (customizable):**
```
PROSPECT → QUALIFIED → PROPOSAL → NEGOTIATION → CLOSING → WON/LOST
```

Each deal card shows:
- Contact avatar (generated initials with unique gradient)
- Deal title & value
- **Heartbeat indicator** — a pulsing dot whose speed reflects urgency
- Time-in-stage bar (green → yellow → red as it ages)
- Last activity timestamp
- Quick-action buttons (log call, send email, schedule)

**Interactions:**
- Drag & drop between stages with particle burst on transition
- Click to expand into full deal view with slide-up animation
- Filter by value, age, priority, contact
- Stage summary bars showing total value per stage

### 3. **THE ROSTER** (Contacts & Companies)
Your contact intelligence center.

**Contact Card:**
```
┌──────────────────────────────┐
│  👤 Ravi Krishnan             │
│  CTO, Tata Digital           │
│                              │
│  ████████████░░░ 78%          │
│  Relationship Strength        │
│                              │
│  🔥 2 active deals (₹5.1L)   │
│  📞 Last contact: 2 days ago  │
│  📊 Lifetime value: ₹12.4L   │
│                              │
│  Tags: [Enterprise] [Tech]   │
│  [Decision Maker]            │
└──────────────────────────────┘
```

**Relationship Strength** is calculated from:
- Frequency of interactions (calls, emails, meetings)
- Recency of last contact
- Deal conversion history
- Response patterns

### 4. **THE CHRONICLE** (Activity Timeline)
Every interaction, logged and visualized.

- Vertical timeline with animated entries
- Filter by contact, deal, activity type
- Quick-log buttons: 📞 Call | 📧 Email | 🤝 Meeting | 📝 Note
- Each entry supports rich notes with markdown
- Automatic "days since last contact" tracking

### 5. **THE RADAR** (Analytics & Insights)

**Visualizations (all hand-built with Canvas API):**
- **Conversion Funnel** — animated waterfall showing drop-off at each stage
- **Revenue Heatmap** — calendar heatmap of deals won (like GitHub contributions)
- **Pipeline Velocity** — how fast deals move through stages
- **Win/Loss Analysis** — reasons for won vs lost deals
- **Forecast** — projected revenue based on pipeline probability

### 6. **CUSTOMER HQ** (Post-Conversion)
Once a deal is won, the contact becomes a **Customer** with:
- Complete purchase history
- Repeat order tracking
- Renewal/upsell pipeline
- Satisfaction notes
- Revenue contribution over time

---

## 💾 Database Schema (D1 / SQLite)

```sql
-- Core entities
contacts        -- People and companies
deals           -- Sales opportunities with stage tracking
activities      -- All interactions (calls, emails, meetings, notes)
deal_stages     -- Customizable pipeline stages
tags            -- Flexible tagging system
contact_tags    -- Many-to-many relationship

-- Customers
customers       -- Converted contacts with purchase history
orders          -- Repeat sales tracking
```

---

## 🚀 Implementation Plan

### Phase 1: The Foundation (What we build NOW)
- [x] Complete frontend SPA with all 6 views
- [x] Full CSS design system (the dark cockpit aesthetic)
- [x] Client-side routing (hash-based)
- [x] LocalStorage persistence (works immediately, no backend needed)
- [x] All CRUD operations for contacts, deals, activities
- [x] Pipeline drag-and-drop
- [x] Priority engine
- [x] Analytics with Canvas charts
- [x] Responsive design (works on mobile too)
- [x] Keyboard shortcuts for power users
- [x] Data export/import (JSON)

### Phase 2: Cloudflare Backend (Deploy-ready code)
- [ ] Cloudflare Worker API with Hono.js
- [ ] D1 database schema and migrations
- [ ] KV-based session management
- [ ] API endpoints for all CRUD operations
- [ ] Data sync between local and cloud

### Phase 3: Polish & Power Features
- [ ] Email integration (via Worker + Mailchannels)
- [ ] Calendar sync
- [ ] Webhook integrations
- [ ] Multi-user support
- [ ] Mobile PWA with offline support

---

## 🎯 What Makes This "WOW"

1. **No framework. No dependencies. Pure web.** — The entire app is built from scratch. Every animation, every chart, every interaction. Raw craftsmanship.

2. **The Particle Field** — A WebGL-powered ambient background with thousands of floating particles that subtly react to your mouse. Not gimmicky — atmospheric.

3. **Physics-Based Interactions** — Cards don't just snap. They have momentum, easing, and weight. Drag a deal and it follows with spring physics.

4. **The Heartbeat System** — Every deal card has a pulsing indicator whose rhythm reflects urgency. Critical deals pulse fast. Cold leads pulse slowly. You can *feel* your pipeline's health.

5. **Cinematic Transitions** — Page transitions aren't just fades. They're choreographed sequences with staggered element animations.

6. **The Priority Engine** — Opens every morning with a tactical briefing. "You have 3 deals closing this week worth ₹8.2L. Ravi hasn't responded in 4 days. Priya's proposal expires tomorrow." It thinks like a sales manager.

7. **Canvas-Rendered Charts** — No chart library. Hand-painted visualizations with smooth animations, custom tooltips, and interactive elements.

8. **Sound Design** (optional) — Subtle audio cues for deal stage changes, won deals (a satisfying chime), and priority alerts.

---

> [!IMPORTANT]
> **Ready to build?** This plan covers the complete Phase 1 implementation — a fully functional, stunning sales CRM that works immediately in your browser with localStorage, ready to deploy to Cloudflare Pages with the backend code included.
