// Parse a TikTok Shop order export (CSV) into rows the importer can consume.
//
// TikTok's column names drift across regions and platform versions, so we
// match each logical field against a list of header aliases (case- and
// punctuation-insensitive). Anything we can't map gets surfaced as a
// diagnostic so the upload page can tell the seller what to fix.
//
// We avoid pulling in a CSV library: the standard order export is RFC4180
// CSV with quoted fields and \r\n line endings. The state machine below
// handles BOM, CRLF, embedded newlines inside quoted fields, and doubled
// quotes inside quoted fields.
//
// Delimiter is auto-detected on the header row (comma, tab, or semicolon).

export interface ParsedOrderRow {
  orderId: string;
  orderedAt: number;     // ms epoch
  sku: string;           // canonical seller SKU (preferred) or platform SKU id
  productName: string;
  qty: number;
  unitPrice: number;     // gross unit price in shop currency
  status: string;        // raw status string (filtering happens in importer)
}

export interface ParseDiagnostics {
  totalRows: number;
  acceptedRows: number;
  skippedNoOrderId: number;
  skippedNoSku: number;
  skippedBadDate: number;
  skippedBadPrice: number;
  unmappedFields: string[]; // logical fields we couldn't find a column for
  delimiter: ',' | '\t' | ';';
  headerColumns: string[];
}

export interface ParseResult {
  rows: ParsedOrderRow[];
  diagnostics: ParseDiagnostics;
}

const ALIASES: Record<keyof Omit<ParsedOrderRow, 'orderedAt'> | 'orderedAt', string[]> = {
  orderId: ['order id', 'order number', 'order no', 'order#'],
  orderedAt: [
    'created time', 'order created time', 'paid time', 'order time',
    'payment time', 'creation time', 'order date',
  ],
  sku: ['seller sku', 'sku id', 'sku', 'merchant sku'],
  productName: ['product name', 'product title', 'item name', 'sku name'],
  qty: ['quantity', 'qty', 'sku quantity', 'item quantity'],
  unitPrice: [
    'sku unit original price', 'unit price', 'original price',
    'sku original price', 'item price', 'sku subtotal before discount',
  ],
  status: ['order status', 'order substatus', 'status'],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-\s]+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
}

function detectDelimiter(headerLine: string): ',' | '\t' | ';' {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  if (tabs > commas && tabs > semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

function parseCsv(text: string, delimiter: string): string[][] {
  // Strip UTF-8 BOM.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      cur.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      // Lookahead for \n; treat both as a single row terminator.
      if (text[i + 1] === '\n') i++;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
      i++;
      continue;
    }
    if (c === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Trailing field/row.
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  // Drop trailing all-empty rows.
  while (rows.length > 0 && rows[rows.length - 1].every(v => v === '')) rows.pop();
  return rows;
}

function findColumn(normalizedHeaders: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const idx = normalizedHeaders.indexOf(target);
    if (idx !== -1) return idx;
  }
  // Fallback: substring match — TikTok sometimes appends parenthetical units
  // like "SKU Unit Original Price (USD)".
  for (let i = 0; i < normalizedHeaders.length; i++) {
    for (const alias of aliases) {
      if (normalizedHeaders[i].includes(normalizeHeader(alias))) return i;
    }
  }
  return -1;
}

function parseDate(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  // Try direct Date parse first — handles ISO 8601 and most US locale formats.
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();
  // Fallback: "YYYY-MM-DD HH:MM:SS" with a space; convert to ISO.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (m) {
    const d2 = new Date(`${m[1]}T${m[2]}Z`);
    if (!isNaN(d2.getTime())) return d2.getTime();
  }
  return null;
}

function parseNumber(raw: string): number | null {
  if (!raw) return null;
  // Strip currency symbols, thousands separators, whitespace.
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseOrderExport(text: string): ParseResult {
  // First non-empty line determines delimiter and headers.
  const firstNewline = text.search(/\r?\n/);
  const headerLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const delimiter = detectDelimiter(headerLine.replace(/^﻿/, ''));

  const grid = parseCsv(text, delimiter);
  const diagnostics: ParseDiagnostics = {
    totalRows: 0,
    acceptedRows: 0,
    skippedNoOrderId: 0,
    skippedNoSku: 0,
    skippedBadDate: 0,
    skippedBadPrice: 0,
    unmappedFields: [],
    delimiter,
    headerColumns: [],
  };
  if (grid.length < 2) return { rows: [], diagnostics };

  const headers = grid[0].map(h => h.trim());
  diagnostics.headerColumns = headers;
  const normalized = headers.map(normalizeHeader);

  const colIndex: Record<keyof ParsedOrderRow, number> = {
    orderId: findColumn(normalized, ALIASES.orderId),
    orderedAt: findColumn(normalized, ALIASES.orderedAt),
    sku: findColumn(normalized, ALIASES.sku),
    productName: findColumn(normalized, ALIASES.productName),
    qty: findColumn(normalized, ALIASES.qty),
    unitPrice: findColumn(normalized, ALIASES.unitPrice),
    status: findColumn(normalized, ALIASES.status),
  };
  for (const k of Object.keys(colIndex) as (keyof ParsedOrderRow)[]) {
    // status is optional — we tolerate exports without it.
    if (colIndex[k] === -1 && k !== 'status') diagnostics.unmappedFields.push(k);
  }

  const rows: ParsedOrderRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    diagnostics.totalRows++;

    const orderId = (row[colIndex.orderId] ?? '').trim();
    if (!orderId) {
      diagnostics.skippedNoOrderId++;
      continue;
    }
    const sku = (row[colIndex.sku] ?? '').trim();
    if (!sku) {
      diagnostics.skippedNoSku++;
      continue;
    }
    const orderedAt = colIndex.orderedAt === -1 ? null : parseDate(row[colIndex.orderedAt] ?? '');
    if (orderedAt === null) {
      diagnostics.skippedBadDate++;
      continue;
    }
    const unitPrice = colIndex.unitPrice === -1 ? null : parseNumber(row[colIndex.unitPrice] ?? '');
    if (unitPrice === null || unitPrice <= 0) {
      diagnostics.skippedBadPrice++;
      continue;
    }
    const qtyRaw = colIndex.qty === -1 ? 1 : parseNumber(row[colIndex.qty] ?? '') ?? 1;
    const qty = Math.max(1, Math.round(qtyRaw));

    rows.push({
      orderId,
      orderedAt,
      sku,
      productName: (row[colIndex.productName] ?? '').trim() || sku,
      qty,
      unitPrice,
      status: colIndex.status === -1 ? '' : (row[colIndex.status] ?? '').trim(),
    });
    diagnostics.acceptedRows++;
  }

  return { rows, diagnostics };
}
