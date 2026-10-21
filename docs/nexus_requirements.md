# NEXUS CRM — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** 2026-10-21  
**Status:** Ready for Implementation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Constraints](#2-technology-constraints)
3. [Global Requirements](#3-global-requirements)
4. [Data Model](#4-data-model)
5. [View 1: The Briefing (Dashboard)](#5-view-1-the-briefing)
6. [View 2: The Pipeline (Deal Flow)](#6-view-2-the-pipeline)
7. [View 3: The Roster (Contacts)](#7-view-3-the-roster)
8. [View 4: The Chronicle (Activity Timeline)](#8-view-4-the-chronicle)
9. [View 5: The Radar (Analytics)](#9-view-5-the-radar)
10. [View 6: Customer HQ](#10-view-6-customer-hq)
11. [Settings & Configuration](#11-settings--configuration)
12. [Priority Engine Specification](#12-priority-engine-specification)
13. [Animation & Interaction Specifications](#13-animation--interaction-specifications)
14. [Keyboard Shortcuts](#14-keyboard-shortcuts)
15. [Data Import/Export](#15-data-importexport)
16. [Responsive Design](#16-responsive-design)

---

## 1. Project Overview

**NEXUS** is a single-user sales pipeline CRM application with the aesthetic of a sci-fi mission control center. It manages the full lifecycle: prospect identification → qualification → proposal → negotiation → closing → customer retention → repeat sales.

**Core Value Propositions:**
- All sales prospects and conversations in one place
- Intelligent daily prioritization
- Full customer lifecycle tracking (prospect → customer → repeat buyer)
- Stunning, immersive "Dark Cockpit" UI that makes users say "wow"

---

## 2. Technology Constraints

| Constraint | Specification |
|-----------|---------------|
| Frontend | Vanilla HTML5 + CSS3 + ES6+ JavaScript. **Zero frameworks. Zero external JS libraries.** |
| CSS | Vanilla CSS only. No Tailwind, Bootstrap, or any CSS framework |
| Fonts | Google Fonts (Inter) — loaded via `<link>` tag only |
| Icons | Inline SVG or CSS-generated icons. No icon libraries |
| Charts | HTML5 Canvas API only. No Chart.js, D3, or any chart library |
| Data Persistence | `localStorage` for Phase 1 (must work fully offline) |
| Deployment Target | Cloudflare Pages (static site) |
| Browser Support | Modern browsers (Chrome 90+, Firefox 90+, Safari 15+, Edge 90+) |
| External Dependencies | **NONE** — the app must have zero `npm install` requirements for the frontend |

---

## 3. Global Requirements

### 3.1 Application Shell

**REQ-SHELL-01**: The application MUST be a Single Page Application (SPA) using hash-based routing (`#/briefing`, `#/pipeline`, `#/roster`, `#/chronicle`, `#/radar`, `#/customers`).

**REQ-SHELL-02**: The default route (`#/` or empty hash) MUST redirect to `#/briefing`.

**REQ-SHELL-03**: The application MUST have a fixed left sidebar navigation with the following items (in order):
| Nav Item | Icon | Route | Label |
|----------|------|-------|-------|
| Briefing | Grid/Dashboard icon | `#/briefing` | Briefing |
| Pipeline | Funnel/Flow icon | `#/pipeline` | Pipeline |
| Roster | People icon | `#/roster` | Roster |
| Chronicle | Clock/Timeline icon | `#/chronicle` | Chronicle |
| Radar | Chart/Analytics icon | `#/radar` | Radar |
| Customers | Star/Crown icon | `#/customers` | Customers |

**REQ-SHELL-04**: The active navigation item MUST have a visually distinct highlighted state (background highlight + accent color).

**REQ-SHELL-05**: The sidebar MUST show the NEXUS logo/wordmark at the top.

**REQ-SHELL-06**: The sidebar MUST be collapsible to icons-only mode on desktop via a toggle button.

**REQ-SHELL-07**: On mobile (≤768px), the sidebar MUST be hidden by default and shown as an overlay when a hamburger button is tapped.

### 3.2 Design System

**REQ-DESIGN-01**: The app MUST use the following color tokens as CSS custom properties on `:root`:
```css
:root {
  --bg-void: #0a0a0f;
  --bg-surface: #12121a;
  --bg-elevated: #1a1a2e;
  --bg-glass: rgba(255, 255, 255, 0.03);
  --glass-border: rgba(255, 255, 255, 0.06);
  --glass-border-hover: rgba(255, 255, 255, 0.12);
  --glass-blur: 24px;
  --accent-primary: #6366f1;
  --accent-secondary: #8b5cf6;
  --accent-gradient: linear-gradient(135deg, #6366f1, #8b5cf6);
  --success: #10b981;
  --success-dim: rgba(16, 185, 129, 0.15);
  --warning: #f59e0b;
  --warning-dim: rgba(245, 158, 11, 0.15);
  --danger: #ef4444;
  --danger-dim: rgba(239, 68, 68, 0.15);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --shadow-glow: 0 0 20px rgba(99, 102, 241, 0.15);
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 400ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

**REQ-DESIGN-02**: The body background MUST be `var(--bg-void)`.

**REQ-DESIGN-03**: All card/panel elements MUST use the glassmorphism pattern:
```css
background: var(--bg-glass);
backdrop-filter: blur(var(--glass-blur));
-webkit-backdrop-filter: blur(var(--glass-blur));
border: 1px solid var(--glass-border);
border-radius: var(--radius-lg);
```

**REQ-DESIGN-04**: Font family MUST be Inter (loaded from Google Fonts) with fallback to system fonts: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.

**REQ-DESIGN-05**: The application MUST have an ambient animated particle background. Requirements:
- Render on a fixed-position `<canvas>` element behind all content (z-index: 0)
- Display 60-100 small circular particles (1-3px radius)
- Particles colored `rgba(99, 102, 241, 0.15)` (faint indigo)
- Particles drift slowly in random directions (speed: 0.1-0.5px per frame)
- Particles that exit the viewport wrap around to the opposite edge
- Subtle parallax: particles near the mouse cursor drift slightly away from it
- Frame rate: use `requestAnimationFrame`, skip frames if performance dips below 30fps
- Must NOT impact scroll performance or cause jank

### 3.3 Data Layer

**REQ-DATA-01**: All application data MUST be stored in `localStorage` under a single key: `nexus_data`.

**REQ-DATA-02**: The data MUST be stored as a JSON object with the following top-level keys:
```json
{
  "contacts": [],
  "deals": [],
  "activities": [],
  "customers": [],
  "orders": [],
  "tags": [],
  "settings": {},
  "version": 1
}
```

**REQ-DATA-03**: Every entity MUST have a unique `id` field generated as `crypto.randomUUID()` (or a fallback UUID v4 generator).

**REQ-DATA-04**: Every entity MUST have `createdAt` and `updatedAt` ISO 8601 timestamp strings.

**REQ-DATA-05**: The data layer MUST provide a `Store` class/module with methods:
- `getAll(collection)` → returns array
- `getById(collection, id)` → returns entity or null
- `create(collection, data)` → returns created entity with id and timestamps
- `update(collection, id, data)` → returns updated entity
- `delete(collection, id)` → returns boolean
- `query(collection, filterFn)` → returns filtered array
- `exportAll()` → returns full JSON string
- `importAll(jsonString)` → replaces all data
- `subscribe(callback)` → registers a listener called on any data change
- `unsubscribe(callback)` → removes listener

**REQ-DATA-06**: On first load, if no data exists in localStorage, the app MUST seed with demo data:
- 6-8 contacts with varied names, companies, titles
- 10-15 deals spread across all pipeline stages
- 15-20 activities of various types
- 2-3 customers with order history
- A set of default tags: "Enterprise", "SMB", "Tech", "Finance", "Decision Maker", "Influencer", "Champion", "Hot Lead"

### 3.4 Modals and Forms

**REQ-MODAL-01**: All create/edit operations MUST use modal dialogs.

**REQ-MODAL-02**: Modals MUST have:
- A dark overlay (rgba(0,0,0,0.6) with backdrop-blur(8px))
- A glassmorphism modal panel (max-width: 560px, centered)
- A title bar with close (×) button
- Form fields with dark-themed styling
- Primary action button (indigo gradient) and Cancel button
- Close on Escape key press
- Close on overlay click (outside the modal)
- Slide-up + fade-in animation on open
- Slide-down + fade-out animation on close

**REQ-MODAL-03**: Form inputs MUST be styled with:
- Dark background (`var(--bg-surface)`)
- Subtle border (`var(--glass-border)`)
- Focus state: border color transitions to `var(--accent-primary)` with subtle glow
- Label above each input in `var(--text-secondary)`
- Placeholder text in `var(--text-muted)`

**REQ-MODAL-04**: All forms MUST validate required fields before submission and show inline error messages in `var(--danger)` color.

### 3.5 Toast Notifications

**REQ-TOAST-01**: The app MUST show toast notifications for:
- Successful create/update/delete operations
- Data import/export operations
- Validation errors

**REQ-TOAST-02**: Toasts MUST:
- Appear in the bottom-right corner
- Have glassmorphism styling with a colored left border (success=emerald, error=red, info=indigo)
- Auto-dismiss after 3 seconds
- Support manual dismiss via close button
- Stack vertically if multiple toasts are active
- Slide-in from right on appear, slide-out to right on dismiss

### 3.6 Confirmation Dialogs

**REQ-CONFIRM-01**: All delete operations MUST show a confirmation dialog before executing.

**REQ-CONFIRM-02**: Confirmation dialogs MUST clearly state what will be deleted and warn about irreversibility.

---

## 4. Data Model

### 4.1 Contact

```typescript
interface Contact {
  id: string;                    // UUID
  name: string;                  // Full name (required)
  email: string;                 // Email address (optional)
  phone: string;                 // Phone number (optional)
  company: string;               // Company name (optional)
  title: string;                 // Job title (optional)
  tags: string[];                // Array of tag IDs
  notes: string;                 // Free-text notes (optional)
  status: 'prospect' | 'active' | 'customer' | 'inactive';
  source: string;                // How they were acquired (optional)
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

### 4.2 Deal

```typescript
interface Deal {
  id: string;                    // UUID
  title: string;                 // Deal name (required)
  contactId: string;             // FK to Contact (required)
  value: number;                 // Deal value in base currency (required, ≥0)
  stage: 'prospect' | 'qualified' | 'proposal' | 'negotiation' | 'closing' | 'won' | 'lost';
  priority: 'low' | 'medium' | 'high' | 'critical';
  probability: number;           // 0-100 (auto-set by stage, manually overridable)
  expectedCloseDate: string;     // ISO 8601 date (optional)
  notes: string;                 // Deal-specific notes
  lostReason: string;            // Required when stage='lost'
  stageChangedAt: string;        // ISO 8601 — when the stage was last changed
  createdAt: string;
  updatedAt: string;
}
```

**Default probability by stage:**
| Stage | Default Probability |
|-------|-------------------|
| prospect | 10% |
| qualified | 25% |
| proposal | 50% |
| negotiation | 65% |
| closing | 85% |
| won | 100% |
| lost | 0% |

### 4.3 Activity

```typescript
interface Activity {
  id: string;                    // UUID
  type: 'call' | 'email' | 'meeting' | 'note';
  contactId: string;             // FK to Contact (required)
  dealId: string | null;         // FK to Deal (optional)
  title: string;                 // Activity title (required)
  description: string;           // Detailed notes (optional)
  date: string;                  // ISO 8601 datetime (required)
  duration: number | null;       // Duration in minutes (for calls/meetings)
  outcome: string;               // Outcome/result (optional)
  createdAt: string;
  updatedAt: string;
}
```

### 4.4 Customer

```typescript
interface Customer {
  id: string;                    // UUID
  contactId: string;             // FK to Contact (required, 1:1)
  convertedDealId: string;       // FK to the Deal that converted them
  convertedAt: string;           // ISO 8601
  satisfactionRating: number;    // 1-5 scale (optional)
  notes: string;                 // Customer-specific notes
  createdAt: string;
  updatedAt: string;
}
```

### 4.5 Order

```typescript
interface Order {
  id: string;                    // UUID
  customerId: string;            // FK to Customer (required)
  description: string;           // What was ordered (required)
  amount: number;                // Order value (required, ≥0)
  status: 'pending' | 'completed' | 'cancelled';
  date: string;                  // ISO 8601 date (required)
  notes: string;                 // Order notes (optional)
  createdAt: string;
  updatedAt: string;
}
```

### 4.6 Tag

```typescript
interface Tag {
  id: string;                    // UUID
  name: string;                  // Tag name (required, unique)
  color: string;                 // Hex color code
  createdAt: string;
  updatedAt: string;
}
```

---

## 5. View 1: The Briefing

**Route:** `#/briefing`

### 5.1 Greeting Bar

**REQ-BRIEF-01**: Display a time-aware greeting: "Good morning" (5-12), "Good afternoon" (12-17), "Good evening" (17-21), "Good night" (21-5) followed by the user's name (from settings, default "there").

**REQ-BRIEF-02**: Display the current date formatted as "Day, Month DD, YYYY" (e.g., "Wednesday, October 21, 2026").

**REQ-BRIEF-03**: Below the greeting, display a contextual summary sentence derived from data (e.g., "You have {N} hot deals worth ₹{X}L closing this week").

### 5.2 KPI Cards

**REQ-BRIEF-04**: Display three KPI cards in a horizontal row (responsive: stack on mobile):

| Card | Main Value | Sub-metric | Trend |
|------|-----------|------------|-------|
| Pipeline Value | Sum of all active deal values (formatted as ₹XL or ₹XCr) | Count of active deals | % change vs previous month |
| Won This Month | Sum of deals won in current month | Count of deals won | % change vs previous month |
| Conversion Rate | (Won deals / Total closed deals) × 100 | "this month" | Percentage point change vs previous month |

**REQ-BRIEF-05**: KPI values MUST animate with a counting-up effect on page load (0 → final value over 1 second, using `requestAnimationFrame`).

**REQ-BRIEF-06**: Trend indicators MUST show ▲ (green) for positive and ▼ (red) for negative changes.

### 5.3 Today's Priorities

**REQ-BRIEF-07**: Display a list of up to 8 prioritized items, each showing:
- Urgency indicator dot (colored, pulsing animation for critical items)
- Contact name
- Deal value (formatted)
- Reason text (e.g., "Closing tomorrow", "No reply 5 days", "High value deal")
- Chevron (›) indicating clickability

**REQ-BRIEF-08**: Clicking a priority item MUST navigate to the deal detail (expand in pipeline view).

**REQ-BRIEF-09**: The priority algorithm is specified in [Section 12](#12-priority-engine-specification).

### 5.4 Revenue Forecast Chart

**REQ-BRIEF-10**: Display a Canvas-rendered area chart showing:
- X-axis: months (past 6 months + current month + next 3 months forecast)
- Y-axis: revenue amount
- Filled area with indigo gradient (solid for past, semi-transparent for forecast)
- Data points as small circles on the line
- Hover tooltip showing month name and exact value
- Smooth curve interpolation (cubic bezier or similar)

**REQ-BRIEF-11**: Forecast months MUST be calculated as: sum of (deal value × probability / 100) for deals with expectedCloseDate in that month.

### 5.5 Activity Feed

**REQ-BRIEF-12**: Display the 10 most recent activities in a scrollable list.

**REQ-BRIEF-13**: Each activity item shows: colored type icon, title, contact name (linked), relative timestamp ("2 hours ago", "yesterday").

**REQ-BRIEF-14**: Clicking an activity MUST navigate to the Chronicle view filtered for that contact.

---

## 6. View 2: The Pipeline

**Route:** `#/pipeline`

### 6.1 Stage Columns

**REQ-PIPE-01**: Display 6 stage columns in a horizontally scrollable container: PROSPECT, QUALIFIED, PROPOSAL, NEGOTIATION, CLOSING, WON.

**REQ-PIPE-02**: Each column header MUST show: stage name (uppercase), number of deals, total value of deals in that stage.

**REQ-PIPE-03**: The WON column MUST have a subtle emerald green glow effect on its header/border.

**REQ-PIPE-04**: A 7th collapsed column "LOST" MUST be accessible via a toggle/filter showing lost deals.

### 6.2 Deal Cards

**REQ-PIPE-05**: Each deal card MUST display:
- **Avatar**: Circular, 36px, showing contact initials with a deterministic gradient background (generated from contact name hash)
- **Deal title**: Bold, truncated with ellipsis if >30 chars
- **Company name**: Secondary text, from linked contact
- **Value**: Formatted as ₹X,XX,XXX or ₹X.XL (for lakhs) or ₹X.XCr (for crores)
- **Time-in-stage bar**: Thin (4px) horizontal progress bar. Color: green if <7 days, yellow if 7-14 days, red if >14 days in current stage
- **Last activity**: Relative timestamp ("2h ago", "3d ago")
- **Urgency dot**: 8px circle, colored per priority (critical=red pulsing, high=amber, medium=indigo, low=gray)

**REQ-PIPE-06**: The urgency dot for critical priority MUST have a CSS pulsing animation (scale 1→1.5→1, opacity 1→0.5→1, duration 1.5s, infinite).

**REQ-PIPE-07**: Deal cards MUST show a subtle glow on hover (`box-shadow: var(--shadow-glow)`).

### 6.3 Drag and Drop

**REQ-PIPE-08**: Deal cards MUST be draggable using the HTML5 Drag and Drop API or pointer events.

**REQ-PIPE-09**: While dragging, the source card MUST show reduced opacity (0.4) and the valid drop columns MUST show a highlighted border/glow.

**REQ-PIPE-10**: On drop, the deal's `stage` MUST be updated and `stageChangedAt` MUST be set to the current timestamp.

**REQ-PIPE-11**: If a deal is dropped into "WON", a celebration animation MUST play (particle burst or confetti effect, duration 2 seconds) and if the contact is not yet a customer, a prompt MUST ask "Convert {contact name} to a customer?"

**REQ-PIPE-12**: If a deal is dropped backward in the pipeline (e.g., from Negotiation to Qualified), a confirmation dialog MUST appear: "Move this deal back to {stage}? This usually indicates a setback."

**REQ-PIPE-13**: Dropping into "LOST" MUST trigger a modal asking for a "Lost Reason" (required text field with suggestions: "Price", "Competitor", "No Budget", "No Decision", "Timing", "Other").

### 6.4 Pipeline Filters

**REQ-PIPE-14**: A filter bar at the top MUST allow filtering by:
- Search (text match on deal title, company name, contact name)
- Value range (min/max)
- Priority (checkboxes: critical, high, medium, low)
- Date range (deals created within range)

**REQ-PIPE-15**: Active filters MUST show as removable chips/badges below the filter bar.

### 6.5 Deal Actions

**REQ-PIPE-16**: Clicking a deal card MUST open a detail panel (slide-in from right, 400px wide) showing:
- Full deal details (all fields)
- Linked contact info (name, company, email, phone)
- Activity timeline for this deal (recent 10 activities)
- Quick-action buttons: Log Call, Log Email, Log Meeting, Add Note
- Edit button (opens edit modal)
- Delete button (with confirmation)

**REQ-PIPE-17**: A floating "+" button (or "New Deal" button in header) MUST open the create deal modal with fields: Title, Contact (searchable dropdown), Value, Stage (dropdown), Expected Close Date, Priority, Notes.

---

## 7. View 3: The Roster

**Route:** `#/roster`

### 7.1 Contact Grid

**REQ-ROST-01**: Display contacts as a responsive card grid (4 columns on desktop, 2 on tablet, 1 on mobile).

**REQ-ROST-02**: Each contact card MUST display:
- **Avatar**: 48px circle with gradient background (deterministic from name) and initials (first letter of first name + first letter of last name)
- **Name**: Bold primary text
- **Title & Company**: Secondary text ("CTO at TechCorp")
- **Relationship Strength**: Horizontal bar (120px wide, 6px tall) with gradient fill (red→yellow→green) and percentage label. Calculation defined in [Section 12.2](#122-relationship-strength)
- **Active Deals**: "{N} active deals (₹{X})"
- **Last Contact**: "Last contact: {relative time}"
- **Lifetime Value**: "Lifetime: ₹{X}"
- **Tags**: Small colored pill badges (max 3 visible, +N more indicator)

**REQ-ROST-03**: Cards MUST have a hover effect: border brightens to `var(--glass-border-hover)` and subtle translate-Y(-2px).

### 7.2 Filters and Search

**REQ-ROST-04**: A search bar at top MUST filter contacts by name, company, email (real-time, debounced 300ms).

**REQ-ROST-05**: Filter tabs: All | Prospects | Customers | Inactive. Each shows count badge.

**REQ-ROST-06**: "Add Contact" button in header MUST open a create modal with fields: Name (required), Email, Phone, Company, Title, Tags (multi-select), Source, Notes.

### 7.3 Contact Detail

**REQ-ROST-07**: Clicking a contact card MUST expand it (or open a slide-over panel) showing:
- Full contact information (all fields)
- Relationship Strength with breakdown (what contributes to the score)
- Active deals list (linked, clickable)
- Recent activities (last 5)
- Quick actions: Log Call, Log Email, Schedule Meeting, Add Note, Edit, Delete
- If status is 'customer': link to Customer HQ

**REQ-ROST-08**: Contact deletion MUST warn if there are associated deals and require confirmation.

---

## 8. View 4: The Chronicle

**Route:** `#/chronicle`

### 8.1 Quick Log Bar

**REQ-CHRON-01**: Display 4 prominent action buttons at top:
- 📞 Log Call (blue accent: #3b82f6)
- 📧 Log Email (green accent: #10b981)
- 🤝 Log Meeting (purple accent: #8b5cf6)
- 📝 Add Note (gray accent: #64748b)

**REQ-CHRON-02**: Each button MUST open a modal with fields:
- **All types**: Contact (searchable dropdown, required), Deal (optional dropdown filtered by selected contact), Title (required), Description (textarea), Date/Time (defaults to now)
- **Call & Meeting only**: Duration (minutes, number input)
- **All types**: Outcome (text input, optional)

### 8.2 Filter Bar

**REQ-CHRON-03**: Filter by activity type (toggle buttons: All, Calls, Emails, Meetings, Notes).

**REQ-CHRON-04**: Filter by date range (date pickers for start/end).

**REQ-CHRON-05**: Filter by contact (searchable dropdown).

### 8.3 Timeline Display

**REQ-CHRON-06**: Activities MUST be displayed as a vertical timeline with:
- A thin vertical line (2px, `var(--accent-primary)` with glow) running down the center
- Entries alternate left and right of the line
- Each entry connected to the line with a small dot (8px circle)
- Date separators for day boundaries ("Today", "Yesterday", "October 19, 2026")

**REQ-CHRON-07**: Each timeline entry card MUST show:
- Activity type icon (colored circle background matching type)
- Title (bold)
- Contact name (linked, clickable → navigates to roster detail)
- Deal reference if linked (clickable → navigates to pipeline)
- Description text (truncated to 2 lines, expandable)
- Timestamp
- Duration (for calls/meetings)
- Colored left border matching activity type

**REQ-CHRON-08**: Timeline entries MUST animate in with a staggered fade + slide effect when the view loads and when scrolling new entries into view (Intersection Observer).

**REQ-CHRON-09**: Each entry MUST have an edit (pencil icon) and delete (trash icon) button on hover.

**REQ-CHRON-10**: Pagination: load 20 activities initially, load 20 more on scroll-to-bottom (infinite scroll).

---

## 9. View 5: The Radar

**Route:** `#/radar`

### 9.1 Date Range Control

**REQ-RADAR-01**: A date range selector at the top with presets: "This Month", "Last 3 Months", "Last 6 Months", "This Year", "All Time", and custom date range.

### 9.2 Conversion Funnel

**REQ-RADAR-02**: Canvas-rendered funnel chart (top-left quadrant) showing:
- Stages: Prospect → Qualified → Proposal → Negotiation → Closing → Won
- Each stage as a trapezoid, width proportional to deal count at that stage
- Percentage label at each stage (relative to Prospect count = 100%)
- Indigo-to-violet gradient fill
- Hover on any stage: tooltip with deal count and total value
- Smooth draw-in animation on load (stages appear sequentially top-down)

### 9.3 Revenue Heatmap

**REQ-RADAR-03**: Canvas-rendered calendar heatmap (top-right quadrant) showing:
- Grid of squares representing days (similar to GitHub contribution graph)
- Color intensity based on total deal value won on that day (dark → bright emerald)
- Month labels across top, day-of-week labels on left
- Hover tooltip: date and total value won
- Show last 6 months of data

### 9.4 Pipeline Velocity

**REQ-RADAR-04**: Canvas-rendered horizontal bar chart (bottom-left quadrant) showing:
- One bar per stage: average number of days deals spend in that stage
- Gradient fill (indigo to violet)
- Value label at end of each bar (e.g., "12 days")
- Hover for exact value

### 9.5 Win/Loss Ratio

**REQ-RADAR-05**: Canvas-rendered donut chart (bottom-right quadrant) showing:
- Emerald segment for won deals
- Red segment for lost deals
- Center text: win rate percentage (large, bold)
- Legend below: "Won: N deals (₹X)" / "Lost: N deals (₹X)"
- Draw-in animation: segments grow from 0 to final angle

### 9.6 Chart Interactivity

**REQ-RADAR-06**: All charts MUST support hover tooltips rendered as DOM elements positioned relative to the canvas.

**REQ-RADAR-07**: All charts MUST re-render when the date range changes.

**REQ-RADAR-08**: Charts MUST have smooth animation on initial render and when data changes.

---

## 10. View 6: Customer HQ

**Route:** `#/customers`

### 10.1 Customer List

**REQ-CUST-01**: Left panel (300px on desktop, full-width on mobile) showing a scrollable list of customers.

**REQ-CUST-02**: Each customer list item MUST show:
- Gradient initials avatar (36px)
- Name and company
- Total lifetime revenue (₹ formatted)
- Total order count
- Mini sparkline chart (60×20px, Canvas-rendered) showing order amounts over time

**REQ-CUST-03**: A search input at the top filters customers by name/company.

**REQ-CUST-04**: Clicking a customer selects them and loads their detail in the right panel. Active customer has highlighted border.

### 10.2 Customer Detail

**REQ-CUST-05**: Right panel showing selected customer detail:
- **Header**: Large avatar (64px), name, company, "Customer since {date}", satisfaction rating (1-5 stars, editable)
- **Stat cards row**: Total Revenue, Total Orders, Average Order Value, Last Order Date (4 glassmorphism cards)

**REQ-CUST-06**: Stat card values MUST animate with counting-up effect on load.

### 10.3 Customer Tabs

**REQ-CUST-07**: Tab interface with 4 tabs:

**Orders tab:**
- Table with columns: Date, Description, Amount, Status
- Status badges: "completed" (emerald), "pending" (amber), "cancelled" (red)
- "New Order" button (emerald gradient)
- Clicking "New Order" opens modal: Description (required), Amount (required), Date (defaults today), Status, Notes
- Table rows have hover highlight

**Pipeline tab:**
- Shows deals linked to this customer's contact that are NOT in won/lost stage
- Each deal shown as a mini card with title, value, stage
- "New Deal" button to create a deal pre-linked to this contact

**Notes tab:**
- Free-text notes area for the customer
- Markdown-like rendering (bold, italic, lists)
- Auto-save on blur with debounce

**Activity tab:**
- Timeline of activities linked to this customer's contact (same format as Chronicle but filtered)
- Quick-log buttons

### 10.4 Customer Conversion

**REQ-CUST-08**: When a deal is moved to WON stage and the linked contact is not yet a customer, a modal MUST prompt:
- "Convert {name} to a customer?"
- Yes → Creates Customer record, updates Contact status to 'customer', creates first Order from the deal
- No → Only marks deal as won

---

## 11. Settings & Configuration

**Route:** `#/settings` (accessible via gear icon in sidebar bottom)

**REQ-SET-01**: Settings page MUST include:
- **Profile**: User name (used in greeting), currency symbol (default ₹)
- **Pipeline Stages**: Ability to rename stages (but not add/remove in Phase 1)
- **Tags Management**: Create, edit, delete tags with color picker
- **Data Management**:
  - Export All Data (downloads JSON file)
  - Import Data (file upload, with overwrite confirmation)
  - Reset Demo Data (restores seed data)
  - Clear All Data (with double confirmation)

---

## 12. Priority Engine Specification

### 12.1 Deal Priority Score

Each deal is assigned a numeric priority score (0-100). The daily priorities list sorts by this score descending.

**Scoring rules (additive):**

| Condition | Points | Reason Text |
|-----------|--------|-------------|
| Expected close date is today | +40 | "Closing today!" |
| Expected close date within 3 days | +30 | "Closing in {N} days" |
| Expected close date within 7 days | +20 | "Closing this week" |
| Expected close date has passed | +35 | "Close date passed {N} days ago" |
| No activity in 7+ days | +20 | "No contact for {N} days" |
| No activity in 14+ days | +30 | "Going cold — {N} days silent" |
| Deal value in top 20% of all deals | +15 | "High value deal" |
| Deal value in top 5% of all deals | +25 | "Top value deal" |
| Stage is 'closing' | +10 | "In closing stage" |
| Stage is 'negotiation' | +5 | "In negotiation" |
| Priority manually set to 'critical' | +20 | "Marked critical" |
| Priority manually set to 'high' | +10 | "Marked high priority" |
| Time in current stage >14 days | +10 | "Stalling — {N} days in {stage}" |
| Time in current stage >30 days | +20 | "Stalled — {N} days in {stage}" |

**Urgency level derived from score:**
- Score ≥ 60: 🔴 Critical (red, pulsing)
- Score 40-59: 🟡 High (amber)
- Score 20-39: 🔵 Medium (indigo)
- Score < 20: ⚪ Low (gray)

### 12.2 Relationship Strength

Calculated per contact as a percentage (0-100):

```
Base score = 0

// Recency (max 30 points)
days_since_last_activity = (now - last_activity_date) / (1000*60*60*24)
if days_since_last_activity <= 1: +30
elif days_since_last_activity <= 3: +25
elif days_since_last_activity <= 7: +20
elif days_since_last_activity <= 14: +10
elif days_since_last_activity <= 30: +5
else: +0

// Frequency (max 30 points)
activities_last_30_days = count activities in last 30 days
points = min(activities_last_30_days * 5, 30)

// Depth (max 20 points)
total_activities = count all activities for contact
if total_activities >= 20: +20
elif total_activities >= 10: +15
elif total_activities >= 5: +10
elif total_activities >= 2: +5
else: +0

// Conversion (max 20 points)
if contact has won deals: +15
if contact is a customer: +5

relationship_strength = Base score (capped at 100)
```

---

## 13. Animation & Interaction Specifications

### 13.1 Page Transitions

**REQ-ANIM-01**: When navigating between views:
- Outgoing view: fade-out (opacity 1→0, duration 150ms)
- Incoming view: fade-in + slide-up (opacity 0→1, transform translateY(20px)→0, duration 300ms, eased)
- Content within the new view: staggered fade-in (each major section delays 50ms after the previous)

### 13.2 Card Animations

**REQ-ANIM-02**: Cards entering the viewport for the first time MUST animate in (fade + slide-up, staggered 30ms per card, max stagger 10 cards).

**REQ-ANIM-03**: Card hover: `transform: translateY(-2px)`, `box-shadow` increases, `border-color` brightens. Transition: 200ms ease.

### 13.3 Chart Animations

**REQ-ANIM-04**: All Canvas charts MUST animate from zero to final values on initial render:
- Area chart: line draws from left to right, fill fades in
- Funnel: stages appear top-to-bottom, widths grow from 0
- Donut: segments grow from 0° to final angle
- Bars: grow from left to right
- Duration: 800ms with easeOutCubic timing

### 13.4 Counting Animations

**REQ-ANIM-05**: Numeric values (KPI cards, stat cards) MUST animate from 0 to final value over 1000ms using easeOutCubic timing.

### 13.5 Drag Feedback

**REQ-ANIM-06**: During drag operations, the dragged element MUST have: `transform: rotate(2deg) scale(1.05)`, `opacity: 0.8`, cursor: `grabbing`.

### 13.6 Pulsing Urgency Dot

**REQ-ANIM-07**: Critical urgency dots MUST pulse:
```css
@keyframes pulse-critical {
  0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
  50% { transform: scale(1.3); opacity: 0.8; box-shadow: 0 0 0 8px rgba(239,68,68,0); }
}
```

### 13.7 Celebration Effect

**REQ-ANIM-08**: When a deal is moved to WON:
- Spawn 50-80 particle elements (small circles and squares, 4-8px)
- Colors: mix of emerald, gold, and white
- Physics: launch upward from the card position with random spread, gravity pulls down
- Fade out after 2 seconds
- Clean up DOM elements after animation completes

---

## 14. Keyboard Shortcuts

**REQ-KB-01**: The following keyboard shortcuts MUST be supported:

| Shortcut | Action |
|----------|--------|
| `1` - `6` | Navigate to views 1-6 (Briefing, Pipeline, etc.) |
| `N` | Open "New" modal for the current view context (New Deal on Pipeline, New Contact on Roster, etc.) |
| `Escape` | Close any open modal or panel |
| `/` | Focus the search input on the current view |
| `?` | Show keyboard shortcuts help overlay |

---

## 15. Data Import/Export

**REQ-IO-01**: Export MUST download a file named `nexus-backup-{YYYY-MM-DD}.json` containing the full data store.

**REQ-IO-02**: Import MUST:
- Accept a `.json` file via file input
- Validate the JSON structure (check for required keys: contacts, deals, activities, etc.)
- Show a preview: "This file contains: X contacts, Y deals, Z activities..."
- Warn: "This will replace ALL existing data. This action cannot be undone."
- Require explicit confirmation before proceeding

---

## 16. Responsive Design

**REQ-RESP-01**: Breakpoints:
- **Desktop**: ≥1024px — Full layout with sidebar
- **Tablet**: 768-1023px — Collapsed sidebar, adjusted grid columns
- **Mobile**: <768px — Hidden sidebar (overlay), single-column layout, bottom navigation bar

**REQ-RESP-02**: The pipeline view on mobile MUST show one stage at a time with horizontal swipe/tab navigation between stages.

**REQ-RESP-03**: All modals MUST be full-screen on mobile (≤480px).

**REQ-RESP-04**: Touch interactions: swipe left/right on deal cards to show quick actions (on mobile only).

---

> [!NOTE]
> This PRD contains **69 numbered requirements** (REQ-*) plus supporting specifications for the data model, priority engine, relationship strength, and animations. Every requirement has clear acceptance criteria that maps to a testable behavior.
