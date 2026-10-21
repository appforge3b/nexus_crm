# NEXUS — Visual Mockups Gallery

> Reference mockups for the building agent. Each image represents the target aesthetic and layout for its respective view.

---

## Design System: "The Dark Cockpit"

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-void` | `#0a0a0f` | Page background |
| `--bg-surface` | `#12121a` | Elevated panels, sidebar |
| `--bg-glass` | `rgba(255,255,255,0.03)` | Glassmorphism cards |
| `--glass-blur` | `backdrop-filter: blur(24px)` | Frosted glass effect |
| `--glass-border` | `rgba(255,255,255,0.06)` | Glass panel borders |
| `--accent-primary` | `#6366f1` | Primary indigo |
| `--accent-secondary` | `#8b5cf6` | Violet accent |
| `--accent-gradient` | `linear-gradient(135deg, #6366f1, #8b5cf6)` | Gradient accents |
| `--success` | `#10b981` | Won deals, positive metrics |
| `--warning` | `#f59e0b` | Attention needed |
| `--danger` | `#ef4444` | Critical / urgent |
| `--text-primary` | `#f1f5f9` | Primary text |
| `--text-secondary` | `#94a3b8` | Secondary text |
| `--text-muted` | `#64748b` | Muted/disabled text |

**Typography:** Inter (Google Fonts) — weights 300, 400, 500, 600, 700

---

## View 1: THE BRIEFING (Dashboard)

![The Briefing — Daily mission control dashboard with KPI cards, priority list, revenue forecast, and activity feed](C:/Users/pujac/.gemini/antigravity-ide/brain/ffb7d103-0eaa-401b-a014-dc04ea9b35d3/briefing_dashboard_1792597671620.jpg)

### Key Design Elements
- **Greeting bar**: Time-aware greeting ("Good morning/afternoon/evening, {name}") + current date
- **KPI cards**: Three glassmorphism stat cards with colored gradient borders — Pipeline Value, Won This Month, Conversion Rate. Each shows value, sub-metric, and trend indicator (▲/▼ with color)
- **Today's Priorities**: Vertical list of priority cards with urgency dot (🔴 red pulsing = critical, 🟡 amber = attention). Each shows contact name, deal value, and reason text
- **Revenue Forecast**: Area chart with indigo gradient fill and semi-transparent confidence bands
- **Activity Feed**: Scrollable list of recent events with timestamps and dot indicators
- **Navigation Sidebar**: Fixed left sidebar with icon + label for each view, active state highlighted

---

## View 2: THE PIPELINE (Deal Flow)

![The Pipeline — Kanban board with 6 stage columns, deal cards with urgency indicators, and filter bar](C:/Users/pujac/.gemini/antigravity-ide/brain/ffb7d103-0eaa-401b-a014-dc04ea9b35d3/pipeline_view_1792597685722.jpg)

### Key Design Elements
- **Stage columns**: PROSPECT → QUALIFIED → PROPOSAL → NEGOTIATION → CLOSING → WON. Each header shows stage name, deal count, total value
- **Deal cards**: Glassmorphism cards with gradient initials avatar, deal title, company, value (₹), time-in-stage progress bar (green→yellow→red), last activity timestamp, urgency dot
- **Filter bar**: Top bar with Pipeline filter, Owner filter, Date Range, and Search input
- **Drag & drop**: Cards are draggable between columns with visual feedback
- **WON column**: Subtle emerald glow to celebrate wins
- **Scroll**: Each column scrolls independently when content overflows

---

## View 3: THE ROSTER (Contacts)

![The Roster — Contact grid with relationship strength meters, tags, and expanded card detail](C:/Users/pujac/.gemini/antigravity-ide/brain/ffb7d103-0eaa-401b-a014-dc04ea9b35d3/roster_contacts_1792597697135.jpg)

### Key Design Elements
- **Contact cards**: Grid layout, each card shows gradient initials avatar, name, title + company, relationship strength bar (gradient meter with percentage), active deals count + value, last contact date, lifetime value, colored tags
- **Filter tabs**: All | Prospects | Customers | Inactive
- **Search bar**: Full-width glassmorphism search input
- **Add Contact button**: Indigo gradient CTA button
- **Expanded card**: Clicking a card expands it to show contact info (email, phone), recent activity feed, note snippets, and quick action buttons
- **Relationship Strength**: Calculated from interaction frequency, recency, conversion history

---

## View 4: THE CHRONICLE (Activity Timeline)

![The Chronicle — Vertical timeline with alternating activity cards, quick-log buttons, and filters](C:/Users/pujac/.gemini/antigravity-ide/brain/ffb7d103-0eaa-401b-a014-dc04ea9b35d3/chronicle_timeline_1792597732478.jpg)

### Key Design Elements
- **Quick-log bar**: Four large action buttons at top — Log Call (blue), Log Email (green), Log Meeting (purple), Add Note (gray). Opens modal forms
- **Filter bar**: Activity type toggle (All, Calls, Emails, Meetings, Notes), Date Range picker, Contact Search
- **Timeline**: Vertical glowing indigo line with entries alternating left/right. Each entry has: activity type icon with colored background, title, description text, timestamp, deal reference link, colored left border matching type
- **Card colors**: Calls = blue border, Emails = green, Meetings = purple, Notes = gray
- **Animations**: Entries stagger-fade-in when scrolling into view

---

## View 5: THE RADAR (Analytics)

![The Radar — Four-quadrant analytics dashboard with funnel, heatmap, velocity chart, and win/loss donut](C:/Users/pujac/.gemini/antigravity-ide/brain/ffb7d103-0eaa-401b-a014-dc04ea9b35d3/radar_analytics_1792597747105.jpg)

### Key Design Elements
- **Conversion Funnel** (top-left): Trapezoid funnel showing conversion from Prospect → Won with percentage at each stage. Indigo-to-violet gradient fill
- **Revenue Heatmap** (top-right): Calendar grid (GitHub-style) showing deal values by day. Dark-to-emerald color scale. Months labeled across top, days of week on side
- **Pipeline Velocity** (bottom-left): Horizontal bar chart showing average days deals spend in each stage. Gradient bars (indigo to violet)
- **Win/Loss** (bottom-right): Donut chart — emerald for wins, red for losses. Center shows win rate percentage. Legend below
- **Date range selector**: Top-right dropdown for time period selection
- **All charts**: Rendered on HTML5 Canvas, not images. Interactive with hover tooltips

---

## View 6: CUSTOMER HQ

![Customer HQ — Split-panel customer management with order history, stats, and satisfaction tracking](C:/Users/pujac/.gemini/antigravity-ide/brain/ffb7d103-0eaa-401b-a014-dc04ea9b35d3/customer_hq_1792597759220.jpg)

### Key Design Elements
- **Left panel**: Scrollable customer list with search. Each entry shows gradient avatar, name, company, lifetime revenue, order count, and mini sparkline trend chart
- **Right panel detail**: Selected customer header (avatar, name, company, "Customer since" date, satisfaction stars). Four stat cards (Total Revenue, Orders, Avg Order Value, Last Order Date)
- **Tab interface**: Orders | Pipeline | Notes | Activity tabs
- **Orders tab**: Table with date, description, amount, status (with colored badges). "New Order" button with emerald gradient
- **Pipeline tab**: Shows upsell/renewal deals for this customer
- **Sparkline charts**: Tiny line charts showing purchase trend per customer

---

> [!IMPORTANT]
> These mockups are **directional references**, not pixel-perfect specifications. The building agent should match the **aesthetic, layout structure, and interaction patterns** shown here while implementing clean, semantic HTML/CSS/JS.
