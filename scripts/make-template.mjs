// Writes the blank Excel import template (the same file Settings ➔ Download Excel template ➔ Blank gives you).
// Usage: node scripts/make-template.mjs [output.xlsx] [--sample]   (--sample fills it with the demo data)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { writeXlsx } from '../js/xlsx.js';
import { workbookSheets } from '../js/spreadsheet.js';
import { emptyDocument } from '../js/store.js';
import { seedDemoData } from '../js/seed.js';

const args = process.argv.slice(2);
const sample = args.includes('--sample');
const output = args.find((arg) => !arg.startsWith('--')) || (sample ? 'docs/templates/nexus-sample-data.xlsx' : 'docs/templates/nexus-import-template.xlsx');
const now = new Date();
const state = sample ? seedDemoData(now) : emptyDocument();
const bytes = await writeXlsx(workbookSheets(state, { blank: !sample, workspace: sample ? 'the NEXUS demo' : '', now }), { now });
await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes);
console.log(`Wrote ${output} (${bytes.length.toLocaleString()} bytes)`);
