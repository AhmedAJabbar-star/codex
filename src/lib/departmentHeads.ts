// Fetch head of department names from the HR sheets in the same published Google Sheet.
// HR  (gid 862796482) used for first semester  ("الاول").  Column E = position, Column O = name.
// HR2 (gid 98541586)  used for second semester ("الثاني"). Column D = position, Column G = name.

const PUB_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub';
const HR_GID = '862796482';
const HR2_GID = '98541586';

const cache = new Map<string, string>();
const sheetCache = new Map<string, Promise<string[][]>>();

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let val = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else inQ = false; }
      else val += c;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === ',') { row.push(val); val = ''; }
    else if (c === '\n') { row.push(val); rows.push(row); row = []; val = ''; }
    else if (c !== '\r') val += c;
  }
  if (val.length || row.length) { row.push(val); rows.push(row); }
  return rows;
}

async function fetchSheet(gid: string): Promise<string[][]> {
  if (!sheetCache.has(gid)) {
    sheetCache.set(gid, (async () => {
      const r = await fetch(`${PUB_BASE}?gid=${gid}&single=true&output=csv`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HR fetch failed ${r.status}`);
      const txt = (await r.text()).replace(/^\uFEFF/, '');
      return parseCsv(txt);
    })().catch((e) => { sheetCache.delete(gid); throw e; }));
  }
  return sheetCache.get(gid)!;
}

const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();

export async function fetchDepartmentHead(department: string, semester: string): Promise<string> {
  const dept = norm(department);
  if (!dept) return '';
  const sem = norm(semester);
  const key = `${sem}::${dept}`;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const isFirst = sem.includes('الاول') || sem.includes('الأول');
    const gid = isFirst ? HR_GID : HR2_GID;
    const positionCol = isFirst ? 4 /* E */ : 3 /* D */;
    const nameCol = isFirst ? 14 /* O */ : 6 /* G */;

    const rows = await fetchSheet(gid);
    for (const r of rows) {
      const position = norm(r[positionCol] || '');
      if (!position) continue;
      if (position.includes('رئيس') && position.includes(dept)) {
        const name = norm(r[nameCol] || '');
        if (name) { cache.set(key, name); return name; }
      }
    }
    cache.set(key, '');
    return '';
  } catch {
    return '';
  }
}
