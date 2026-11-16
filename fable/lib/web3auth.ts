'use client';

// Lazy-initialised Web3Auth (MetaMask Embedded Wallets) v11 singleton.
// This module must only run on the client side.
//
// Wallet addresses are derived from the client ID + Sapphire network: never change
// either for a live game, or every Google-login player gets a brand-new wallet.

import type { Web3Auth as Web3AuthType } from '@web3auth/modal';

let web3authInstance: Web3AuthType | null = null;
let isInitialized = false;

const clientId =
  process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ||
  'BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiIQMAGN3Tu58cLx_jEw9bU1b5sN8mB4F_Txs';

// Must match the network the client ID's project is configured for on the
// dashboard (Sapphire Devnet is the default for new/free-tier projects;
// Mainnet requires the project to be explicitly upgraded there).
const web3AuthNetwork = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || 'sapphire_devnet';

const CELO_CHAIN_ID = '0xa4ec'; // Celo mainnet, 42220

async function getWeb3Auth(): Promise<Web3AuthType> {
  if (web3authInstance) return web3authInstance;

  const { Web3Auth, CHAIN_NAMESPACES } = await import('@web3auth/modal');

  // v10+ reads chains from the dashboard by default; passing Celo here keeps the
  // game on Celo no matter how the dashboard project is set up.
  web3authInstance = new Web3Auth({
    clientId,
    web3AuthNetwork: web3AuthNetwork as any,
    chains: [
      {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: CELO_CHAIN_ID,
        rpcTarget: 'https://forno.celo.org',
        displayName: 'Celo Mainnet',
        blockExplorerUrl: 'https://celoscan.io/',
        ticker: 'CELO',
        tickerName: 'Celo',
        logo: 'https://cryptologos.cc/logos/celo-celo-logo.png',
      },
    ],
    defaultChainId: CELO_CHAIN_ID,
  });

  return web3authInstance;
}

export async function web3authLogin(): Promise<void> {
  const web3auth = await getWeb3Auth();
  if (!isInitialized) {
    // v11: init() replaces v9's initModal() and also sets up the login modal.
    await web3auth.init();
    isInitialized = true;
  }
  if (!web3auth.connected) {
    await web3auth.connect();
  }
}

export async function web3authLogout(): Promise<void> {
  if (!web3authInstance) return;
  if (!isInitialized) return;
  if (web3authInstance.connected) {
    await web3authInstance.logout();
  }
  isInitialized = false;
}

/** The EIP-1193 provider for the signed-in wallet (v11: `connection.ethereumProvider`). */
export function getWeb3AuthProvider(): any | null {
  if (!web3authInstance || !web3authInstance.connected) return null;
  return web3authInstance.connection?.ethereumProvider ?? null;
}

export async function getUserInfo(): Promise<any | null> {
  if (!web3authInstance || !web3authInstance.connected) return null;
  return await web3authInstance.getUserInfo();
}
