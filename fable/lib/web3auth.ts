'use client';

// Lazy-initialised Web3Auth v11 singleton
// This module must only run on the client side.

let web3authInstance: any = null;
let isInitialized = false;

const clientId =
  process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ||
  'BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiIQMAGN3Tu58cLx_jEw9bU1b5sN8mB4F_Txs';

const CELO_CHAIN_CONFIG = {
  chainNamespace: 'eip155',
  chainId: '0xa4ec', // Celo mainnet 42220
  rpcTarget: 'https://forno.celo.org',
  displayName: 'Celo Mainnet',
  blockExplorerUrl: 'https://celoscan.io/',
  ticker: 'CELO',
  tickerName: 'Celo',
};

async function getWeb3Auth() {
  if (web3authInstance) return web3authInstance;

  const { Web3Auth } = await import('@web3auth/modal');
  const { EthereumPrivateKeyProvider } = await import('@web3auth/ethereum-provider');
  const { CHAIN_NAMESPACES } = await import('@web3auth/base');

  const privateKeyProvider = new EthereumPrivateKeyProvider({
    config: {
      chainConfig: {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: '0xa4ec',
        rpcTarget: 'https://forno.celo.org',
        displayName: 'Celo Mainnet',
        ticker: 'CELO',
        tickerName: 'Celo',
      },
    },
  });

  web3authInstance = new Web3Auth({
    clientId,
    web3AuthNetwork: 'sapphire_mainnet',
    privateKeyProvider: privateKeyProvider as any,
  });

  return web3authInstance;
}

export async function web3authLogin(): Promise<void> {
  const web3auth = await getWeb3Auth();
  if (!isInitialized) {
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
}

export function getWeb3AuthProvider(): any | null {
  if (!web3authInstance || !web3authInstance.connected) return null;
  return web3authInstance.provider;
}

export async function getUserInfo(): Promise<any | null> {
  if (!web3authInstance || !web3authInstance.connected) return null;
  return await web3authInstance.getUserInfo();
}
