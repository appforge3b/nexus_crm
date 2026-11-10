#!/usr/bin/env node
/**
 * scripts/import-nextwebsite.mjs
 *
 * Fast O(1) multi-workbook importer for NEXUS.
 * Creates tenant tnt_nextwebsite_co and imports all 4 Excel workbooks
 * into Cloudflare D1 via Wrangler.
 */

import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Polyfill DOMParser for readXlsx ──────────────────────────────────────────
const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

const { readXlsx } = await import(join(root, 'js/xlsx.js'));
const { companyKey } = await import(join(root, 'js/migrate.js'));
const { defaultSettings } = await import(join(root, 'js/settings.js'));

const DRY_RUN     = process.argv.includes('--dry-run');
const TENANT_ID   = 'tnt_nextwebsite_co';
const TENANT_NAME = 'nextwebsite.co';
const TENANT_SLUG = 'nextwebsite-co';
const OWNER_EMAIL = 'karthik.win@gmail.com';
const D1_DB       = 'nexus-scrm';
const ACCOUNT_ID  = '2119b403c5ba8599154d482322cf6877';
const IMPORT_DIR  = '/home/puja/Documents/non-Snilld/next_websites/nextwebsite/docs/agencies/imports_101126';
const FILES = [
  'nexus-import_1.xlsx',
  'nexus-import_2.xlsx',
  'nexus-import_3.xlsx',
  'nexus-import_4.xlsx',
];

const TAG_PALETTE = ['#6366f1', '#14b8a6', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#f97316'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATEMENT_CHUNK = 50; // rows per INSERT statement (under SQLite 100KB statement limit)
const FILE_BATCH = 200;      // rows per uploaded SQL file

function esc(s) {
  return String(s ?? '').replace(/'/g, "''");
}

function runSql(sql, label = '') {
  if (DRY_RUN) return;
  const tmp = `/tmp/nexus_d1_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`npx wrangler d1 execute ${D1_DB} --remote --file=${tmp}`, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180_000,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
    });
    process.stdout.write('.');
  } catch (err) {
    console.error(`\n[wrangler error] ${label}\n`, err.stderr || err.message);
    throw err;
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function querySql(sql) {
  const out = execSync(`npx wrangler d1 execute ${D1_DB} --remote --command="${sql.replace(/"/g, '\\"')}" --json`, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
  });
  return JSON.parse(out);
}

// ── Step 1: Tenant Creation ──────────────────────────────────────────────────
console.log('\n═══ Step 1: Checking / Creating Tenant ═══');
if (DRY_RUN) {
  console.log(`[dry-run] Would create tenant ${TENANT_ID} and invite ${OWNER_EMAIL}.`);
} else {
  let exists = false;
  try {
    const res = querySql(`SELECT id FROM tenants WHERE id = '${TENANT_ID}';`);
    exists = (res?.[0]?.results?.length ?? 0) > 0;
  } catch (e) {
    console.log('Query note:', e.message);
  }

  if (exists) {
    console.log(`✓ Tenant ${TENANT_ID} already exists.`);
  } else {
    const now = new Date().toISOString();
    const inviteId = randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + 30 * 86400_000).toISOString();
    runSql(`
INSERT INTO tenants (id, name, slug, status, seq, created_at, created_by)
  VALUES ('${TENANT_ID}', '${esc(TENANT_NAME)}', '${esc(TENANT_SLUG)}', 'active', 0, '${now}', NULL);
INSERT INTO invitations (id, tenant_id, email, role, invited_by, created_at, expires_at)
  VALUES ('${inviteId}', '${TENANT_ID}', '${esc(OWNER_EMAIL)}', 'owner', NULL, '${now}', '${expires}');`, 'create tenant + invite');
    console.log(`✓ Tenant ${TENANT_ID} created.`);
    console.log(`✓ Invitation created for ${OWNER_EMAIL}.`);
  }
}

// ── Step 2: Parse & Merge All 4 Workbooks (Fast O(1)) ────────────────────────
console.log('\n═══ Step 2: Parsing & Merging Excel Files ═══');
const stamp = new Date().toISOString();
let idCounter = 0;
const newId = (prefix) => `${prefix}_${Date.now()}_${++idCounter}`;

const tagByName = new Map();     // lower name -> tag
const companyByKey = new Map();  // companyKey -> company
const contacts = [];

for (const fname of FILES) {
  const fpath = join(IMPORT_DIR, fname);
  if (!existsSync(fpath)) { console.warn(`  ⚠ Missing: ${fpath}`); continue; }

  const t0 = Date.now();
  const buf = readFileSync(fpath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const wb = await readXlsx(ab);

  const tagsSheet = wb.sheets.find(s => s.name === 'Tags');
  const compsSheet = wb.sheets.find(s => s.name === 'Companies');
  const contactsSheet = wb.sheets.find(s => s.name === 'Contacts');

  // 1. Tags
  if (tagsSheet) {
    for (const row of tagsSheet.rows.slice(1)) {
      const name = String(row[1] ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!tagByName.has(key)) {
        const id = String(row[0] ?? '').trim() || newId('tag');
        const color = String(row[2] ?? '').trim() || TAG_PALETTE[tagByName.size % TAG_PALETTE.length];
        tagByName.set(key, { id, name, color, createdAt: stamp, updatedAt: stamp });
      }
    }
  }

  // 2. Companies
  if (compsSheet) {
    for (const row of compsSheet.rows.slice(1)) {
      const name = String(row[1] ?? '').trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = companyKey(name);
      if (!companyByKey.has(key)) {
        const id = String(row[0] ?? '').trim() || newId('com');
        const website = String(row[2] ?? '').trim();
        const industry = String(row[3] ?? '').trim();
        const notes = String(row[4] ?? '').trim();
        companyByKey.set(key, { id, name, website, industry, notes, createdAt: stamp, updatedAt: stamp });
      } else {
        const c = companyByKey.get(key);
        if (!c.website && row[2]) c.website = String(row[2]).trim();
        if (!c.industry && row[3]) c.industry = String(row[3]).trim();
        if (!c.notes && row[4]) c.notes = String(row[4]).trim();
      }
    }
  }

  // 3. Contacts
  if (contactsSheet) {
    for (const row of contactsSheet.rows.slice(1)) {
      const name = String(row[1] ?? '').trim();
      if (!name) continue;
      const rawEmail = String(row[2] ?? '').trim();
      const email = EMAIL_REGEX.test(rawEmail) ? rawEmail : '';
      const phone = String(row[3] ?? '').trim();
      const compName = String(row[4] ?? '').trim();
      const title = String(row[5] ?? '').trim();
      let status = String(row[6] ?? 'prospect').trim().toLowerCase();
      if (!['prospect', 'active', 'customer', 'inactive'].includes(status)) status = 'prospect';
      const source = String(row[7] ?? '').trim();
      const rawTags = String(row[8] ?? '').trim();
      const notes = String(row[9] ?? '').trim();
      const id = String(row[0] ?? '').trim() || newId('cnt');

      let comp = null;
      if (compName) {
        const cKey = companyKey(compName);
        comp = companyByKey.get(cKey);
        if (!comp) {
          comp = { id: newId('com'), name: compName, website: '', industry: '', notes: '', createdAt: stamp, updatedAt: stamp };
          companyByKey.set(cKey, comp);
        }
      }

      const contactTagIds = [];
      if (rawTags) {
        for (const tName of rawTags.split(/[,;]/).map(s => s.trim()).filter(Boolean)) {
          const tKey = tName.toLowerCase();
          let t = tagByName.get(tKey);
          if (!t) {
            t = { id: newId('tag'), name: tName, color: TAG_PALETTE[tagByName.size % TAG_PALETTE.length], createdAt: stamp, updatedAt: stamp };
            tagByName.set(tKey, t);
          }
          if (!contactTagIds.includes(t.id)) contactTagIds.push(t.id);
        }
      }

      contacts.push({
        id,
        name,
        email,
        phone,
        company: comp?.name || compName,
        companyId: comp?.id || null,
        title,
        status,
        source,
        tags: contactTagIds,
        notes,
        createdAt: stamp,
        updatedAt: stamp
      });
    }
  }

  console.log(`  ✓ ${fname} parsed in ${Date.now() - t0}ms`);
}

const tagList = [...tagByName.values()];
const compList = [...companyByKey.values()];
console.log(`\n  Parsed Totals:`);
console.log(`    Tags:      ${tagList.length}`);
console.log(`    Companies: ${compList.length}`);
console.log(`    Contacts:  ${contacts.length}`);
console.log(`    Total:     ${tagList.length + compList.length + contacts.length} records`);

if (DRY_RUN) {
  console.log('\n[dry-run] Parsing successful. Exiting without writing to D1.');
  process.exit(0);
}

// ── Step 3: Insert Records in Batches ─────────────────────────────────────────
console.log('\n═══ Step 3: Writing to Remote D1 ═══');

function writeCollection(collectionName, items) {
  process.stdout.write(`  ${collectionName} (${items.length}): `);
  for (let i = 0; i < items.length; i += FILE_BATCH) {
    const fileItems = items.slice(i, i + FILE_BATCH);
    const statements = [];
    for (let j = 0; j < fileItems.length; j += STATEMENT_CHUNK) {
      const chunk = fileItems.slice(j, j + STATEMENT_CHUNK);
      const valueRows = chunk.map(item => {
        const json = esc(JSON.stringify(item));
        return `('${TENANT_ID}', '${collectionName}', '${esc(item.id)}', '${json}', 1, (SELECT seq FROM tenants WHERE id='${TENANT_ID}'), '${stamp}', NULL, 0)`;
      }).join(',\n    ');
      statements.push(`
INSERT INTO records (tenant_id, collection, id, data, version, seq, updated_at, updated_by, deleted)
VALUES
    ${valueRows}
ON CONFLICT (tenant_id, collection, id) DO UPDATE SET
    data = excluded.data,
    version = records.version + 1,
    seq = excluded.seq,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted = excluded.deleted;
`);
    }

    const sql = `
UPDATE tenants SET seq = seq + 1 WHERE id = '${TENANT_ID}';
${statements.join('\n')}
`;
    runSql(sql, `${collectionName} [${i}..${i + fileItems.length}]`);
  }
  console.log(' Done.');
}

writeCollection('tags', tagList);
writeCollection('companies', compList);
writeCollection('contacts', contacts);

// ── Step 4: Write Default Settings ───────────────────────────────────────────
console.log('\n═══ Step 4: Writing Workspace Settings ═══');
const settingsJson = esc(JSON.stringify(defaultSettings()));
runSql(`
UPDATE tenants SET seq = seq + 1 WHERE id = '${TENANT_ID}';
INSERT INTO tenant_settings (tenant_id, data, version, seq, updated_at)
VALUES ('${TENANT_ID}', '${settingsJson}', 1, (SELECT seq FROM tenants WHERE id='${TENANT_ID}'), '${stamp}')
ON CONFLICT (tenant_id) DO UPDATE SET
  data = excluded.data,
  version = tenant_settings.version + 1,
  seq = excluded.seq,
  updated_at = excluded.updated_at;
`, 'tenant_settings');
console.log('  ✓ Default settings configured.');

// ── Step 5: Final Verification ────────────────────────────────────────────────
console.log('\n═══ Step 5: Verification ═══');
try {
  const verify = querySql(`
    SELECT collection, count(*) as count
    FROM records
    WHERE tenant_id = '${TENANT_ID}' AND deleted = 0
    GROUP BY collection;
  `);
  console.log('  D1 Record Counts:');
  console.table(verify?.[0]?.results ?? []);
} catch (e) {
  console.log('Verification note:', e.message);
}

console.log(`
${'═'.repeat(60)}
🎉 SUCCESS! Workspace provisioned and data imported.
   Tenant:     ${TENANT_ID} (${TENANT_NAME})
   Owner:      ${OWNER_EMAIL}
   Login URL:  https://scrm.snilld.in
${'═'.repeat(60)}
`);
