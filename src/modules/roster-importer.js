/**
 * Smart Roster Importer
 * Parses CSV, TSV, JSON, and text roster files with auto-detection for
 * SportsEngine, TeamSnap, AYSO Sports Connect, and standard spreadsheets.
 */

/**
 * Parses raw CSV/TSV text into an array of rows and detected headers
 */
export function parseDelimitedText(rawText) {
  if (!rawText || typeof rawText !== 'string') return { headers: [], rows: [] };

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter: comma, tab, semicolon
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;

  const delimiter = tabCount > commaCount && tabCount > semiCount ? '\t' : semiCount > commaCount ? ';' : ',';

  // Robust CSV line parser taking quotes into account
  const parseLine = (line) => {
    const row = [];
    let insideQuote = false;
    let entry = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuote && line[i + 1] === '"') {
          entry += '"';
          i++; // skip escaped quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === delimiter && !insideQuote) {
        row.push(entry.trim());
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    return row;
  };

  const parsedRows = lines.map(parseLine);
  if (parsedRows.length === 0) return { headers: [], rows: [] };

  const headers = parsedRows[0].map((h) => h.replace(/^["']|["']$/g, '').trim());
  const dataRows = parsedRows.slice(1);

  return { headers, rows: dataRows, delimiter };
}

/**
 * Auto-detects column indices from headers
 */
export function detectColumns(headers) {
  const norm = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let fullNameIdx = -1;
  let firstNameIdx = -1;
  let lastNameIdx = -1;
  let numberIdx = -1;
  let ratingIdx = -1;
  let positionIdx = -1;
  let platform = 'Generic CSV';

  headers.forEach((h, idx) => {
    const nh = norm(h);

    // Full name match
    if (['playername', 'fullname', 'player', 'athlete', 'name', 'participant', 'child'].includes(nh)) {
      fullNameIdx = idx;
    }
    // First name match
    else if (['firstname', 'first', 'fname', 'playerfirstname'].includes(nh)) {
      firstNameIdx = idx;
    }
    // Last name match
    else if (['lastname', 'last', 'lname', 'surname', 'playerlastname'].includes(nh)) {
      lastNameIdx = idx;
    }
    // Number match
    else if (['jerseynumber', 'jersey', 'jerseyno', 'number', 'num', 'uniformnumber', 'uniformno', 'shirtnumber', 'shirtno', 'no'].includes(nh)) {
      numberIdx = idx;
    }
    // Rating match
    else if (['rating', 'skill', 'score', 'evaluation', 'level', 'rank'].includes(nh)) {
      ratingIdx = idx;
    }
    // Position match
    else if (['position', 'pos', 'preferredposition', 'primaryposition'].includes(nh)) {
      positionIdx = idx;
    }
  });

  // Detect Known Platforms
  const allHeadersStr = headers.map(norm).join(' ');
  if (allHeadersStr.includes('sportsengine') || (firstNameIdx !== -1 && lastNameIdx !== -1 && allHeadersStr.includes('rosterstatus'))) {
    platform = 'SportsEngine';
  } else if (allHeadersStr.includes('teamsnap') || (allHeadersStr.includes('positions') && allHeadersStr.includes('jersey'))) {
    platform = 'TeamSnap';
  } else if (allHeadersStr.includes('sportsconnect') || allHeadersStr.includes('ayso') || (allHeadersStr.includes('playerfirstname') && allHeadersStr.includes('division'))) {
    platform = 'AYSO Sports Connect';
  }

  return {
    platform,
    fullNameIdx,
    firstNameIdx,
    lastNameIdx,
    numberIdx,
    ratingIdx,
    positionIdx,
  };
}

/**
 * Extracts and normalizes players from raw text (CSV, TSV, JSON, or line-by-line TXT)
 */
export function extractPlayersFromFile(rawContent, filename = '') {
  const cleanContent = (rawContent || '').trim();
  if (!cleanContent) return { platform: 'Empty', players: [] };

  // 1. Handle JSON
  if (filename.endsWith('.json') || (cleanContent.startsWith('[') || cleanContent.startsWith('{'))) {
    try {
      const parsed = JSON.parse(cleanContent);
      const list = Array.isArray(parsed) ? parsed : parsed.players || [];
      const players = list.map((p, idx) => ({
        name: typeof p === 'string' ? p : p.name || `Player ${idx + 1}`,
        number: typeof p === 'object' && p.number != null ? parseInt(p.number, 10) : undefined,
        rating: typeof p === 'object' && p.rating != null ? parseInt(p.rating, 10) : undefined,
        status: 'available',
      })).filter((p) => p.name && p.name.trim().length > 0);

      return { platform: 'JSON Roster', players };
    } catch (_) {
      // Fall through to text/csv parser
    }
  }

  // 2. Delimited CSV / TSV Parsing
  const { headers, rows } = parseDelimitedText(cleanContent);

  if (headers.length > 1 && rows.length > 0) {
    const colMap = detectColumns(headers);
    const players = [];

    rows.forEach((row, rIdx) => {
      let name = '';
      if (colMap.fullNameIdx !== -1 && row[colMap.fullNameIdx]) {
        name = row[colMap.fullNameIdx].trim();
      } else if (colMap.firstNameIdx !== -1 && colMap.lastNameIdx !== -1) {
        const first = row[colMap.firstNameIdx] || '';
        const last = row[colMap.lastNameIdx] || '';
        name = `${first} ${last}`.trim();
      } else if (colMap.firstNameIdx !== -1) {
        name = (row[colMap.firstNameIdx] || '').trim();
      } else if (row[0]) {
        name = row[0].trim();
      }

      // Strip quotes and extra spaces
      name = name.replace(/^["']|["']$/g, '').trim();
      if (!name) return;

      let number;
      if (colMap.numberIdx !== -1 && row[colMap.numberIdx]) {
        const parsedNum = parseInt(row[colMap.numberIdx].replace(/[^\d]/g, ''), 10);
        if (!isNaN(parsedNum) && parsedNum > 0 && parsedNum <= 99) {
          number = parsedNum;
        }
      }

      let rating;
      if (colMap.ratingIdx !== -1 && row[colMap.ratingIdx]) {
        const parsedRating = parseInt(row[colMap.ratingIdx].replace(/[^\d]/g, ''), 10);
        if (!isNaN(parsedRating) && parsedRating >= 1 && parsedRating <= 5) {
          rating = parsedRating;
        }
      }

      players.push({
        name,
        number,
        rating,
        status: 'available',
      });
    });

    if (players.length > 0) {
      return { platform: colMap.platform, players };
    }
  }

  // 3. Fallback: Line-by-line raw text parsing (e.g. "Alex Smith #10" or "Jordan 7")
  const lines = cleanContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const players = lines.map((line) => {
    const match = line.trim().match(/^(.*?)(?:\s+#?(\d+))?$/);
    const pName = match ? match[1].replace(/[,;]/g, '').trim() : line.trim();
    const pNum = match && match[2] ? parseInt(match[2], 10) : undefined;
    return {
      name: pName,
      number: pNum && pNum > 0 && pNum <= 99 ? pNum : undefined,
      status: 'available',
    };
  }).filter((p) => p.name.length > 0);

  return { platform: 'Plain Text Roster', players };
}
