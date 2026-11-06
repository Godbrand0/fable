import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, isAddress } from 'viem';
import { celo } from 'viem/chains';
import {
  PLAYER_SESSION_COOKIE, PLAYER_SESSION_TTL_MS, LOGIN_MESSAGE_MAX_AGE_MS, createPlayerSessionToken,
} from '../../../../lib/session';
import { buildLoginMessage } from '../../../../lib/loginMessage';

const RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';
const publicClient = createPublicClient({ chain: celo, transport: http(RPC) });

// Exchanges a signed sign-in message for a session cookie bound to that wallet.
// The server rebuilds the message from the claimed wallet and timestamp, so the
// client can't get a different statement signed and passed off as a login.
export async function POST(req: NextRequest) {
  try {
    const { address, issuedAt, signature } = await req.json() as {
      address?: string; issuedAt?: string; signature?: string;
    };

    if (!address || !isAddress(address) || !issuedAt || !signature?.startsWith('0x')) {
      return NextResponse.json({ error: 'Missing or invalid address, issuedAt, or signature' }, { status: 400 });
    }

    const issuedAtMs = Date.parse(issuedAt);
    const age = Date.now() - issuedAtMs;
    if (!Number.isFinite(issuedAtMs) || age > LOGIN_MESSAGE_MAX_AGE_MS || age < -60_000) {
      return NextResponse.json({ error: 'Sign-in message expired, please sign again' }, { status: 401 });
    }

    // verifyMessage handles plain EOAs (MetaMask, Web3Auth) and smart-contract wallets (ERC-1271/6492).
    const valid = await publicClient.verifyMessage({
      address: address as `0x${string}`,
      message: buildLoginMessage(address, issuedAt),
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: 'Signature does not match wallet' }, { status: 401 });
    }

    const wallet = address.toLowerCase();
    const res = NextResponse.json({ ok: true, wallet });
    res.cookies.set(PLAYER_SESSION_COOKIE, createPlayerSessionToken(wallet), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: PLAYER_SESSION_TTL_MS / 1000,
    });
    return res;
  } catch (err: any) {
    console.error('[auth/login]', err);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
  }
}
