import { NextResponse } from 'next/server';
import { getDb, initSchema } from '../../../db/client.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  initSchema();
  const body = (await req.json()) as { suggestion_id?: unknown; status?: unknown; modified?: unknown };
  const { suggestion_id, status, modified } = body;

  if (typeof suggestion_id !== 'string' || !suggestion_id) {
    return NextResponse.json({ error: 'suggestion_id required' }, { status: 400 });
  }
  if (status !== 'adopted' && status !== 'ignored' && status !== 'modified') {
    return NextResponse.json({ error: 'status must be adopted | ignored | modified' }, { status: 400 });
  }

  const db = getDb();
  const exists = db
    .prepare(`SELECT id FROM suggestions WHERE id = ?`)
    .get(suggestion_id) as { id: string } | undefined;
  if (!exists) {
    return NextResponse.json({ error: 'suggestion not found' }, { status: 404 });
  }

  db.prepare(
    `INSERT INTO suggestion_outcomes (suggestion_id, status, modified_json, recorded_at) VALUES (?,?,?,?)`,
  ).run(
    suggestion_id,
    status,
    modified ? JSON.stringify(modified) : null,
    Date.now(),
  );

  return NextResponse.json({ ok: true });
}
