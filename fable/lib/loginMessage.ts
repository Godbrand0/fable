// The sign-in message. Kept in its own file with no server imports so the browser
// (which signs it) and /api/auth/login (which rebuilds and checks it) share one copy.
export function buildLoginMessage(wallet: string, issuedAtIso: string): string {
  return [
    'Sign in to Fable RPG',
    '',
    'This proves you own this wallet. It does not send a transaction or cost gas.',
    '',
    `Wallet: ${wallet.toLowerCase()}`,
    `Issued at: ${issuedAtIso}`,
  ].join('\n');
}
