import { NextResponse } from 'next/server';
import { initSchema } from '../../../db/client.ts';
import { runPipeline } from '../../../engine/pipeline.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  initSchema();
  const body = (await req.json().catch(() => ({}))) as { shop_id?: string };
  const shopId = body.shop_id ?? 'shop_demo_beauty';
  const result = runPipeline(shopId);
  return NextResponse.json(result);
}
