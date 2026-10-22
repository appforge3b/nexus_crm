# NEXUS — Sales Intelligence Command Center

> *"Not a CRM. A cockpit."*

NEXUS is an ultra-fast, zero-runtime-dependency sales command center built with pure web standards (Vanilla HTML, CSS, and modern JavaScript). It departs from generic spreadsheets and dull grey enterprise tables to deliver a dark, glassmorphic cockpit inspired by Bloomberg terminals, mission control rooms, and tactical HUDs.

---

## 🌟 Table of Contents
- [Executive Overview](#executive-overview)
- [Key Business Scenarios](#key-business-scenarios)
- [Feature Walkthrough](#feature-walkthrough)
- [Technical Architecture](#technical-architecture)
- [Data Storage & Isolation](#data-storage--isolation)
- [Deployment & Environments](#deployment--environments)
- [Local Development & Testing](#local-development--testing)
- [Secret & Config Management (Infisical)](#secret--config-management-infisical)

---

## 🎯 Executive Overview

Traditional CRMs often hinder sales momentum: sluggish page reloads, heavy client-side bundles, complex database roundtrips, and clunky interfaces. 

NEXUS is designed for speed and clarity:
- **Zero Runtime Dependencies:** Pure modern ES modules, native Canvas 2D charts, and CSS variables. Loads instantly with a negligible footprint.
- **Tactical Daily Focus:** Opens directly to **The Briefing**, a morning mission control highlighting high-probability deals, immediate follow-ups, and pipeline velocity.
- **Privacy & Edge Independence:** Runs entirely client-side using validated local persistence with full JSON export and import capabilities.
- **Dual-Instance Architecture:** Seamlessly supports an interactive demonstration sandbox with rich sample data alongside a clean, empty production instance for real business operations.

---

## 💼 Key Business Scenarios

### 1. B2B Deal Pipeline & Opportunity Management
Track complex multi-stage enterprise sales opportunities from initial contact through formal closing:
- Visual stages: `Prospect` ➔ `Qualified` ➔ `Proposal` ➔ `Negotiation` ➔ `Closing` ➔ `Won` / `Lost`.
- Drag/step deals forward with automated conversion calculations.
- Backward-move safeguards and structured lost-reason capture to identify sales friction.

### 2. High-Touch Account Management & Customer HQ
Maintain relationships after deals close:
- Dedicated **Customer HQ** for tracking customer accounts, lifetime value (LTV), active contracts, and order history.
- Relationship health scores (0–100) calculated dynamically based on interaction frequency, deal values, and recency.

### 3. Action-Driven Sales Execution (The Chronicle)
Log every customer interaction in seconds without leaving the keyboard:
- Calls, meetings, emails, status changes, and tactical notes.
- Quick-log shortcut actions with timestamped chronological timeline views.
- Deep bi-directional linking between contacts, deals, and activity logs.

### 4. Revenue Forecasting & Pipeline Analytics (The Radar)
Executive-level visibility into pipeline health and conversion dynamics:
- Interactive Canvas 2D visualizations: revenue trajectory, sales funnel drop-offs, stage velocity, and win/loss breakdowns.
- Configurable date range filters (`This Month`, `This Quarter`, `Year to Date`, or custom ranges).

---

## 🖥️ Feature Walkthrough

| Module | Route | Description |
|---|---|---|
| **The Briefing** | `#briefing` | Daily mission dashboard: active pipeline value, monthly win rate, priority alert cards, and live activity streams. |
| **The Pipeline** | `#pipeline` | Visual sales Kanban board with stage filtering, value thresholds, priority chips, and quick deal creation drawers. |
| **The Roster** | `#roster` | Contact directory with status filters, custom tags, relationship health scores, and direct activity triggers. |
| **The Chronicle**| `#chronicle`| Full chronological timeline of sales interactions with infinite scrolling and type-based filtering. |
| **The Radar** | `#radar` | Custom-rendered Canvas analytical charts: revenue trajectory, conversion funnels, stage velocity, and win-rate analysis. |
| **Customer HQ** | `#customers`| Post-sale account hub showing customer status, order logs, total lifetime value, and order placement. |
| **Settings** | `#settings` | Customization for user profile, currency (`₹`, `$`, `€`, `£`), pipeline stages, tags, data backup/restore, and reset utilities. |

---

## 🏗️ Technical Architecture

### Tech Stack
- **Frontend Core:** HTML5 + Vanilla CSS3 + Modern ES6+ JavaScript modules.
- **Styling:** Bespoke design system in `css/` using CSS Custom Properties (Design Tokens), glassmorphism (`backdrop-filter`), CSS Grid/Flexbox layouts, and hardware-accelerated animations.
- **Charts:** Native HTML5 `<canvas>` rendering (`js/charts.js`, `js/chart-render.js`) — zero third-party chart libraries.
- **Testing:** [Vitest](https://vitest.dev/) with `jsdom` (dev-only dependency) running 133 automated unit, integration, and contract tests.
- **Hosting & CDN:** [Cloudflare Pages](https://pages.cloudflare.com/) delivering global edge static distribution, HTTP/3, and automatic TLS.
- **Configuration & Secrets:** [Infisical](https://infisical.com/) centralized secret and variable management.

### Project Structure
```text
nexus_crm/
├── css/
│   ├── animations.css       # Keyframes, micro-interactions, particles
│   ├── base.css             # Typography, resets, global layouts
│   ├── components.css       # Buttons, cards, modals, drawers, toasts
│   ├── responsive.css       # Breakpoints for tablet and mobile
│   └── tokens.css           # Color palette, spacing, elevations, glass tokens
├── docs/                    # Architecture diagrams, specifications, mockups
├── js/
│   ├── app.js               # Application orchestration & event listeners
│   ├── chart-render.js      # Canvas chart drawing routines
│   ├── charts.js            # Chart data transformers
│   ├── customers.js         # Customer calculations & order schemas
│   ├── deals.js             # Pipeline stages, probabilities, conversions
│   ├── format.js            # Currency & date formatters
│   ├── fx.js                # Confetti bursts, particle field, counter animations
│   ├── icons.js             # Embedded SVG icon registry
│   ├── keyboard.js          # Global keyboard shortcuts
│   ├── main.js              # Entry point & dynamic instance configuration
│   ├── markup.js            # HTML sanitization & markup helpers
│   ├── router.js            # Hash-based client-side router
│   ├── seed.js              # Comprehensive demo dataset generator
│   ├── store.js             # Reactive localStorage store with validation
│   ├── views.js             # Component renderers for all views
│   └── validation.js        # Data integrity checks
├── tests/
│   ├── contract/            # Design system and constraint tests
│   ├── integration/         # View transitions and user workflows
│   └── unit/                # Core logic, math, store, priority engine
├── index.html               # Main application shell
├── package.json             # Scripts and dev dependencies
└── vitest.config.js         # Vitest configuration
```

---

## 💾 Data Storage & Isolation

The application employs an isolated, reactive client-side store backed by browser `localStorage`:
- **Collections:** `contacts`, `deals`, `activities`, `customers`, `orders`, `tags`, and `settings`.
- **Validation:** Every read/import validates schema integrity against `js/validation.js`.
- **Portability:** Built-in JSON export and import in the **Settings** view allows complete data portability with zero lock-in.

### Dual-Instance Storage Partitioning
1. **Demo Site (`crm.snilld.in`):**
   - Automatically bootstrapped with rich sample data on initial visit (`seed: true`).
   - Storage Key: `nexus_data`.
2. **Business Production Site (`scrm.snilld.in`):**
   - Automatically detected via hostname (`scrm.*`).
   - Starts with a pristine empty database (`seed: false`).
   - Storage Key: `nexus_scrm_data`.
   - The browser's same-origin policy completely isolates storage between `crm.snilld.in` and `scrm.snilld.in`.

---

## 🚀 Deployment & Environments

NEXUS CRM is deployed on Cloudflare Pages across two independent projects:

| Environment | Purpose | URL | Cloudflare Project |
|---|---|---|---|
| **Demo Instance** | Showcase / Testing (Seeded) | [https://crm.snilld.in](https://crm.snilld.in) | `nexus-crm` |
| **Business Instance** | Production (Clean / Empty DB) | [https://scrm.snilld.in](https://scrm.snilld.in) | `nexus-scrm` |
| **Staging Preview** | Direct Pages edge deploy | [https://nexus-scrm.pages.dev](https://nexus-scrm.pages.dev) | `nexus-scrm` |

### Cloudflare DNS Configuration
Both instances are managed under the `snilld.in` zone on Cloudflare:
- `crm` ➔ CNAME ➔ `nexus-crm-4yg.pages.dev` (Proxied)
- `scrm` ➔ CNAME ➔ `nexus-scrm.pages.dev` (Proxied)

---

## 🔐 Secret & Config Management (Infisical)

Deployment configurations and cloud project identifiers are managed centrally through [Infisical](https://infisical.com/) in the `nexus_crm` project (`Snilld AI` organization):

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account Identifier
- `CLOUDFLARE_PAGES_PROJECT`: `nexus-crm` (Demo project)
- `CUSTOM_DOMAIN`: `crm.snilld.in`
- `CLOUDFLARE_PAGES_PROJECT_SCRM`: `nexus-scrm` (Business project)
- `CUSTOM_DOMAIN_SCRM`: `scrm.snilld.in`

Local commands can fetch secrets and execute with:
```bash
infisical run --env=prod -- <command>
```

---

## 🛠️ Local Development & Testing

### Prerequisites
- Node.js (v18+ recommended)
- Python 3 (for local HTTP server) or any static file server

### 1. Run Locally
Because the application uses native JavaScript ES Modules, run via a local HTTP server:
```bash
# Start local dev server (http://localhost:8765)
npm start
```
- Open `http://localhost:8765` to test the **Demo** mode (seeded data).
- Open `http://localhost:8765/?empty=1` to test the **Clean Business** mode (empty database).

### 2. Run Test Suite
Execute the full Vitest suite:
```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### 3. Deployments
Deploy directly to Cloudflare Pages using Wrangler:
```bash
# Deploy to Demo instance (crm.snilld.in)
npm run deploy

# Deploy to Business instance (scrm.snilld.in)
npm run deploy:scrm

# Deploy to both instances simultaneously
npm run deploy:all

# Deploy with Infisical production secrets injected
npm run deploy:prod
```

---

## 📄 License
Private & Proprietary. All rights reserved.
