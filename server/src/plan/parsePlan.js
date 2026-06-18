import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// plan/ lives at the repo root, three levels up from server/src/plan/.
const PLAN_PATH =
  process.env.PLAN_PATH ||
  resolve(__dirname, '../../../plan/plan_12_semaines_machine.md');

/** Split a markdown table row "| a | b |" into trimmed cells. */
function cells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

const isTableRow = (l) => l.trim().startsWith('|');
const isSeparator = (l) => /^\|[\s:|-]+\|?\s*$/.test(l.trim());

/** Collect the first markdown table found in a block of lines. */
function readTable(lines) {
  const rows = lines.filter(isTableRow).filter((l) => !isSeparator(l));
  if (rows.length < 2) return null;
  const header = cells(rows[0]);
  const body = rows.slice(1).map(cells);
  return { header, body };
}

/** Map a "Zone" label from the reference table to our internal type key. */
function zoneKey(label) {
  const l = label.toLowerCase();
  if (l.includes('easy') || l.includes('z2')) return 'easy';
  if (l.includes('longue')) return 'long';
  if (l.includes('tempo')) return 'tempo';
  if (l.includes('seuil')) return 'seuil';
  if (l.includes('vo2')) return 'vo2max';
  if (l.includes('strides')) return 'strides';
  return null;
}

function parseZones(md) {
  // Find the table whose header mentions "Allure cible".
  const lines = md.split('\n');
  const start = lines.findIndex((l) => isTableRow(l) && l.includes('Allure cible'));
  if (start === -1) return {};
  let end = start;
  while (end < lines.length && isTableRow(lines[end])) end++;
  const table = readTable(lines.slice(start, end));
  if (!table) return {};
  const zones = {};
  for (const row of table.body) {
    const key = zoneKey(row[0]);
    if (!key) continue;
    zones[key] = { label: row[0], pace: row[1], hr: row[2], feel: row[3] };
  }
  return zones;
}

/** Extract phase header info: "## PHASE 1 — Base (S1 → S4) · ..." */
function parsePhaseHeader(headerLine) {
  const m = headerLine.match(/##\s*PHASE\s*(\d+)\s*[—-]\s*([^(·]+)/i);
  const number = m ? parseInt(m[1], 10) : null;
  let name = m ? m[2].trim() : '';
  // "Peak / dépasser décembre" → keep first token group before "/"
  name = name.split('/')[0].trim();
  return { number, name };
}

function parsePhases(md) {
  const sections = md.split(/\n(?=##\s*PHASE\s)/i).filter((s) => /##\s*PHASE\s/i.test(s));
  return sections.map((section) => {
    const lines = section.split('\n');
    const { number, name } = parsePhaseHeader(lines[0]);
    const table = readTable(lines);
    const weeks = [];
    if (table) {
      for (const row of table.body) {
        const week = parseInt(row[0], 10);
        if (Number.isNaN(week)) continue;
        const cellsByHeader = {};
        table.header.forEach((h, i) => {
          cellsByHeader[h] = row[i] ?? '';
        });
        weeks.push({ week, cells: cellsByHeader });
      }
    }
    return { number, name, columns: table ? table.header : [], weeks };
  });
}

/** Parse the raw markdown plan into zones + phase tables (no interpretation). */
export function parsePlanMarkdown(md = readFileSync(PLAN_PATH, 'utf8')) {
  return {
    zones: parseZones(md),
    phases: parsePhases(md),
    sourcePath: PLAN_PATH,
  };
}

export { PLAN_PATH };
