import { NextRequest, NextResponse } from 'next/server';
import { getSessionWallet } from '../../../../lib/session';

export async function GET(req: NextRequest) {
  return NextResponse.json({ wallet: getSessionWallet(req) });
}
