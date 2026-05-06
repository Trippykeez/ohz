import { NextResponse } from 'next/server';
import { initSchema } from '../../../db/client.ts';
import { parseOrderExport } from '../../../import/parser.ts';
import { importParsedRows } from '../../../import/importer.ts';
import { runPipeline } from '../../../engine/pipeline.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  initSchema();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  const shopName = (form.get('shop_name') ?? '').toString().trim();
  const vertical = (form.get('vertical') ?? 'beauty').toString().trim() || 'beauty';
  const marginInput = Number(form.get('margin_pct') ?? 0.65);
  const marginPct = Number.isFinite(marginInput) ? marginInput : 0.65;

  if (!shopName) {
    return NextResponse.json({ error: 'shop_name is required' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const text = await file.text();
  const { rows, diagnostics } = parseOrderExport(text);

  if (diagnostics.unmappedFields.length > 0) {
    return NextResponse.json(
      {
        error: 'Could not find required columns in CSV',
        unmapped: diagnostics.unmappedFields,
        headerColumns: diagnostics.headerColumns,
        delimiter: diagnostics.delimiter,
      },
      { status: 422 },
    );
  }
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No usable rows found in CSV', diagnostics },
      { status: 422 },
    );
  }

  const summary = importParsedRows(rows, { shopName, vertical, marginPct });
  const pipeline = runPipeline(summary.shopId);

  return NextResponse.json({ summary, diagnostics, pipeline });
}
