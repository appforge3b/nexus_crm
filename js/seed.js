import { defaultSettings } from './settings.js';
import { STAGE_PROBABILITY } from './stages.js';
import { migrate } from './migrate.js';

export const DEFAULT_TAG_NAMES = [
  'Enterprise', 'SMB', 'Tech', 'Finance', 'Decision Maker', 'Influencer', 'Champion', 'Hot Lead',
];

const TAG_COLORS = ['#6366f1', '#14b8a6', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#f97316'];

const PIPELINE = ['prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won'];

const DAY = 86400000;

function iso(date) {
  return date.toISOString();
}

function daysAgo(now, days) {
  return new Date(now.getTime() - days * DAY);
}

function localDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysAhead(now, days) {
  return localDay(new Date(now.getTime() + days * DAY));
}

const PEOPLE = [
  ['Ravi Krishnan', 'Tata Digital', 'CTO', 'active', 'ravi.krishnan@tatadigital.example', 'Referral', [0, 2, 4]],
  ['Priya Sharma', 'Helios Bank', 'Head of Procurement', 'prospect', 'priya.sharma@heliosbank.example', 'Conference', [3, 0, 5]],
  ['Arjun Mehta', 'Orbit Labs', 'Founder & CEO', 'active', 'arjun@orbitlabs.example', 'Inbound', [1, 2, 7]],
  ['Ananya Iyer', 'Saffron Retail', 'VP Operations', 'customer', 'ananya.iyer@saffron.example', 'Referral', [0, 6]],
  ['Vikram Rao', 'Monsoon Media', 'Director of IT', 'customer', 'vikram.rao@monsoon.example', 'Outbound', [2, 4]],
  ['Meera Nair', 'Lumen Health', 'CFO', 'prospect', 'meera.nair@lumenhealth.example', 'Webinar', [3, 4]],
  ['Kabir Malhotra', 'Copper & Co', 'Product Lead', 'inactive', 'kabir@copperco.example', 'Inbound', [1, 5]],
  ['Sneha Kapoor', 'Northwind Logistics', 'COO', 'customer', 'sneha.kapoor@northwind.example', 'Partner', [0, 6, 4]],
  ['Rohan Desai', 'Helios Bank', 'CFO', 'prospect', 'rohan.desai@heliosbank.example', 'Conference', [0, 3, 4]],
  ['Kavya Menon', 'Helios Bank', 'Head of IT Security', 'prospect', 'kavya.menon@heliosbank.example', 'Conference', [2, 5]],
  ['Aditi Joshi', 'Tata Digital', 'Head of Data', 'active', 'aditi.joshi@tatadigital.example', 'Referral', [2, 6]],
  ['Farhan Ali', 'Saffron Retail', 'Store Systems Manager', 'customer', 'farhan.ali@saffron.example', 'Referral', [5]],
];

const PHONES = [
  '+91 98450 12873', '+91 99010 44521', '+91 98860 31094', '+91 97400 88216',
  '+91 98204 67390', '+91 99456 20718', '+91 98112 57463', '+91 97311 90542',
  '+91 98867 40215', '+91 99723 11864', '', '+91 97422 50396',
];

// deal index -> extra people on the deal: [contact, role]; the primary contact's role comes first.
const STAKEHOLDERS = {
  0: [[0, 'Decision maker'], [10, 'Champion']],
  2: [[1, 'Champion'], [8, 'Decision maker'], [9, 'Technical']],
  3: [[1, 'Champion'], [8, 'Finance']],
  6: [[3, 'Decision maker'], [11, 'User']],
};

// [title, contact, value, stage, priority, closeInDays, daysInStage, createdDaysAgo, lostReason]
const DEALS = [
  ['Data platform rollout', 0, 320000, 'closing', 'critical', 1, 4, 48, ''],
  ['Analytics add-on', 0, 180000, 'proposal', 'medium', 14, 9, 20, ''],
  ['Core banking integration', 1, 850000, 'negotiation', 'high', 5, 16, 60, ''],
  ['Treasury dashboard pilot', 1, 145000, 'qualified', 'medium', 25, 3, 10, ''],
  ['Sales stack setup', 2, 95000, 'prospect', 'low', 40, 2, 2, ''],
  ['Growth automation suite', 2, 260000, 'proposal', 'high', 10, 12, 30, ''],
  ['Store analytics expansion', 3, 420000, 'negotiation', 'critical', 3, 6, 35, ''],
  ['Ad-ops workflow revamp', 4, 210000, 'qualified', 'low', 30, 20, 28, ''],
  ['Patient portal modernisation', 5, 640000, 'prospect', 'medium', 55, 8, 8, ''],
  ['Fleet tracking renewal', 7, 380000, 'closing', 'high', 6, 2, 40, ''],
  ['Saffron POS integration', 3, 560000, 'won', 'high', null, 140, 200, ''],
  ['Monsoon content cloud', 4, 310000, 'won', 'medium', null, 95, 150, ''],
  ['Northwind route optimiser', 7, 720000, 'won', 'critical', null, 40, 110, ''],
  ['Tata Digital discovery sprint', 0, 150000, 'won', 'medium', null, 12, 45, ''],
  ['Copper & Co design system', 6, 230000, 'lost', 'medium', null, 35, 90, 'Competitor'],
];

// [type, contact, deal, title, description, daysAgo, duration, outcome]
const ACTIVITIES = [
  ['call', 0, 0, 'Pricing walkthrough with Ravi', 'Walked through the three-year pricing. Ravi wants the security annex before he signs.', 0.1, 35, 'Sending security annex'],
  ['email', 0, 0, 'Sent security annex', 'Shared the SOC 2 report and the data-residency annex for the rollout.', 0.75, null, ''],
  ['meeting', 1, 2, 'Integration scoping workshop', 'The core banking team walked through their API constraints. They need a sandbox by next week.', 6, 90, 'Sandbox requested'],
  ['email', 1, 2, 'Follow-up: sandbox timeline', 'Shared the sandbox provisioning plan and asked for a security contact.', 3, null, 'Awaiting reply'],
  ['call', 2, 5, 'Discovery call with Arjun', 'Orbit is scaling from 12 to 40 reps this year and wants outreach automation.', 2, 25, 'Proposal requested'],
  ['note', 2, 4, 'Budget signal', 'Arjun mentioned roughly **₹1L** for the initial setup, with room to grow.', 2.2, null, ''],
  ['meeting', 3, 6, 'Quarterly business review', 'Reviewed store analytics usage across 42 outlets. Strong interest in rolling out to the next 60.', 4, 60, 'Expansion scoped'],
  ['email', 3, 6, 'Sent expansion proposal', 'Proposal for 60 additional outlets with volume pricing.', 1, null, ''],
  ['call', 4, 7, 'Check-in on ad-ops workflow', 'Vikram is heads-down on festive-season campaigns. Asked to reconnect in November.', 18, 15, 'Call back in November'],
  ['note', 4, null, 'Renewal risk', 'Usage dropped about 20% last month. Flag for the success team.', 16, null, ''],
  ['call', 7, 9, 'Renewal terms discussion', 'Sneha is happy with the route optimiser and wants a two-year renewal on fleet tracking.', 1.2, 30, 'Agreed on two-year term'],
  ['email', 7, 9, 'Sent renewal contract', 'Contract sent for e-signature.', 0.3, null, ''],
  ['meeting', 0, 13, 'Discovery sprint kickoff', 'Kicked off the two-week discovery sprint with the Tata Digital platform team.', 21, 120, 'Sprint started'],
  ['call', 5, 8, 'Intro call with Meera', 'Lumen is replacing a legacy patient portal; budget is approved for Q1.', 8, 20, 'Send case studies'],
  ['email', 5, 8, 'Shared healthcare case studies', 'Sent two hospital case studies and a reference contact.', 7, null, ''],
  ['note', 0, 1, 'Analytics add-on idea', 'Ravi hinted that the BI team needs embedded dashboards for their partners.', 9, null, ''],
  ['call', 6, 14, 'Loss debrief', 'They went with a competitor on price. Open to revisiting next year.', 35, 15, 'Revisit in 2027'],
  ['meeting', 7, null, 'Onboarding review', 'Walked the dispatch team through the new route optimiser dashboards.', 10, 45, 'Team trained'],
  ['email', 1, 3, 'Treasury pilot one-pager', 'Sent a one-page summary of the treasury dashboard pilot.', 5, null, ''],
  ['call', 3, null, 'Satisfaction check-in', 'Ananya is happy with support response times.', 12, 10, 'Happy with support'],
  ['whatsapp', 9, 2, 'Sandbox access · WhatsApp', 'Hi Kavya, the sandbox credentials are on their way to your team. Shout if the VPN whitelist needs anything from us.', 1.1, null, 'Sent'],
  ['whatsapp', 3, 6, 'Follow-up · WhatsApp', 'Hi Ananya, following up on Store analytics expansion. Is there anything you need from my side to move ahead?', 0.9, null, 'Sent'],
];

// Voice notes recorded on the move: [contact, deal, title, transcript, daysAgo, seconds]
const VOICE_NOTES = [
  [10, 0, 'Coffee with Aditi after the workshop', 'Coffee with Aditi after the workshop. She is pushing for the data platform internally and wants a reference call with another bank before Ravi signs. Send her the Helios case study.', 0.4, 38],
];

// Planned next steps: [type, contact, deal, title, description, daysFromToday, hour, minute]
const NEXT_STEPS = [
  ['task', 3, 6, 'Send revised volume pricing', 'Ananya asked for pricing at 60 and 100 outlets.', -1, 17, 0],
  ['whatsapp', 5, 8, 'Check Meera has the case studies', '', 0, 16, 0],
  ['call', 0, 0, 'Follow up on the security annex', 'Confirm the annex unblocks signature.', 1, 10, 0],
  ['meeting', 1, 2, 'Present GTM deck to Helios leadership', 'Priya, Rohan and Kavya attending. Bring the integration timeline.', 2, 11, 30],
  ['meeting', 7, 9, 'Renewal signing with Sneha', '', 5, 15, 0],
  ['email', 8, 3, 'Send treasury pilot business case', 'Rohan wants the ROI model before the budget committee.', 9, 10, 0],
];

// [contact, convertedDeal, rating, notes, orders: [description, amount, daysAgo, status]]
const CUSTOMERS = [
  [3, 10, 5, 'Champion inside Saffron. Prefers **WhatsApp** for quick questions.\n- Renewal every April\n- Loves the store heatmap', [
    ['Saffron POS integration', 560000, 140, 'completed'],
    ['Loyalty module', 85000, 100, 'completed'],
    ['Additional store licences', 120000, 60, 'completed'],
    ['Training workshop', 95000, 25, 'completed'],
    ['Q4 support pack', 140000, 3, 'pending'],
  ]],
  [4, 11, 3, 'Usage dipped last month. *Schedule a health check* before renewal.', [
    ['Monsoon content cloud', 310000, 95, 'completed'],
    ['Storage expansion', 45000, 50, 'completed'],
    ['Editor seats', 60000, 15, 'completed'],
  ]],
  [7, 12, 4, 'Ops-heavy team. Sneha signs off on anything under **₹5L** directly.', [
    ['Northwind route optimiser', 720000, 40, 'completed'],
    ['Driver app add-on', 90000, 20, 'cancelled'],
    ['Warehouse integration', 110000, 6, 'completed'],
  ]],
];

function historyFor(stage, createdAt, changedAt) {
  const path = stage === 'lost'
    ? ['prospect', 'qualified', 'proposal', 'lost']
    : PIPELINE.slice(0, PIPELINE.indexOf(stage) + 1);
  const start = createdAt.getTime();
  const end = changedAt.getTime();
  const steps = path.length - 1;
  return path.map((name, index) => ({
    stage: name,
    at: iso(new Date(index === steps ? end : start + ((end - start) * index) / Math.max(steps, 1))),
  }));
}

export function seedDemoData(clock) {
  const now = clock instanceof Date ? clock : new Date(clock);
  const tags = DEFAULT_TAG_NAMES.map((name, index) => ({
    id: `tag-${index + 1}`,
    name,
    color: TAG_COLORS[index],
    createdAt: iso(daysAgo(now, 220)),
    updatedAt: iso(daysAgo(now, 220)),
  }));

  const contacts = PEOPLE.map(([name, company, title, status, email, source, tagIndexes], index) => ({
    id: `contact-${index + 1}`,
    name,
    company,
    title,
    status,
    email,
    phone: PHONES[index],
    tags: tagIndexes.map((tagIndex) => tags[tagIndex].id),
    notes: '',
    source,
    createdAt: iso(daysAgo(now, 210 - index * 12)),
    updatedAt: iso(daysAgo(now, 2)),
  }));

  const deals = DEALS.map(([title, contactIndex, value, stage, priority, closeIn, inStage, created, lostReason], index) => {
    const createdAt = daysAgo(now, created);
    const changedAt = daysAgo(now, inStage);
    return {
      id: `deal-${index + 1}`,
      title,
      contactId: contacts[contactIndex].id,
      stakeholders: (STAKEHOLDERS[index] ?? [[contactIndex, '']]).map(([person, role]) => ({ contactId: contacts[person].id, role })),
      value,
      stage,
      priority,
      probability: STAGE_PROBABILITY[stage],
      expectedCloseDate: closeIn == null ? localDay(changedAt) : daysAhead(now, closeIn),
      notes: '',
      lostReason,
      stageChangedAt: iso(changedAt),
      stageHistory: historyFor(stage, createdAt, changedAt),
      createdAt: iso(createdAt),
      updatedAt: iso(changedAt),
    };
  });

  const activities = ACTIVITIES.map(([type, contactIndex, dealIndex, title, description, ago, duration, outcome], index) => {
    const date = iso(daysAgo(now, ago));
    return {
      id: `activity-${index + 1}`,
      type,
      status: 'done',
      ...(type === 'whatsapp' ? { channel: 'whatsapp' } : {}),
      contactId: contacts[contactIndex].id,
      dealId: dealIndex == null ? null : deals[dealIndex].id,
      title,
      description,
      date,
      duration,
      outcome,
      createdAt: date,
      updatedAt: date,
    };
  });

  VOICE_NOTES.forEach(([contactIndex, dealIndex, title, description, ago, seconds], index) => {
    const date = iso(daysAgo(now, ago));
    activities.push({
      id: `voice-${index + 1}`,
      type: 'note',
      status: 'done',
      source: 'voice',
      durationSec: seconds,
      contactId: contacts[contactIndex].id,
      dealId: deals[dealIndex].id,
      title,
      description,
      date,
      duration: null,
      outcome: '',
      createdAt: date,
      updatedAt: date,
    });
  });

  NEXT_STEPS.forEach(([type, contactIndex, dealIndex, title, description, inDays, hour, minute], index) => {
    const date = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + inDays, hour, minute, 0, 0));
    activities.push({
      id: `step-${index + 1}`,
      type,
      status: 'planned',
      contactId: contacts[contactIndex].id,
      dealId: deals[dealIndex].id,
      title,
      description,
      date,
      duration: null,
      outcome: '',
      createdAt: iso(daysAgo(now, 1)),
      updatedAt: iso(daysAgo(now, 1)),
    });
  });

  const customers = [];
  const orders = [];
  CUSTOMERS.forEach(([contactIndex, dealIndex, rating, notes, orderRows], index) => {
    const deal = deals[dealIndex];
    const customer = {
      id: `customer-${index + 1}`,
      contactId: contacts[contactIndex].id,
      convertedDealId: deal.id,
      convertedAt: deal.stageChangedAt,
      satisfactionRating: rating,
      notes,
      createdAt: deal.stageChangedAt,
      updatedAt: iso(daysAgo(now, 1)),
    };
    customers.push(customer);
    orderRows.forEach(([description, amount, ago, status], orderIndex) => {
      const when = daysAgo(now, ago);
      orders.push({
        id: `order-${index + 1}-${orderIndex + 1}`,
        customerId: customer.id,
        description,
        amount,
        status,
        date: localDay(when),
        notes: '',
        createdAt: iso(when),
        updatedAt: iso(when),
      });
    });
  });

  let companyCount = 0;
  return migrate({
    contacts,
    deals,
    activities,
    customers,
    orders,
    tags,
    settings: defaultSettings(),
    version: 1,
  }, { now, id: () => `company-${++companyCount}` });
}
