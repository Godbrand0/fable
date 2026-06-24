import { createPublicClient, createWalletClient, custom, http, parseAbi, encodeAbiParameters, parseAbiParameters, parseUnits } from 'viem';
import { celo } from 'viem/chains';
import { FABLE_ITEMS_ADDRESS, FABLE_ITEMS_ABI, NftItem } from './nft';

const CELO_RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';

export const G$_ADDRESS = (process.env.NEXT_PUBLIC_GOODDOLLAR_ADDRESS || '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A') as `0x${string}`;
export const UBISCHEME_ADDRESS = (process.env.NEXT_PUBLIC_UBISCHEME_ADDRESS || '0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1') as `0x${string}`;
export const IDENTITY_ADDRESS = (process.env.NEXT_PUBLIC_IDENTITY_ADDRESS || '0xC361A6E67822a0EDc17D899227dd9FC50BD62F42') as `0x${string}`;

export const IDENTITY_ABI = parseAbi([
  'function getWhitelistedRoot(address account) view returns (address)',
]);

export const G$_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transferAndCall(address to, uint256 value, bytes calldata data) returns (bool)',
]);

export const UBISCHEME_ABI = parseAbi([
  'function claim() returns (uint256)',
  'function checkEntitlement(address user) view returns (uint256)',
  'function checkEntitlement() view returns (uint256)',
]);

export const publicClient = createPublicClient({
  chain: celo,
  transport: http(CELO_RPC),
});

export const celoService = {
  hasInjectedProvider(): boolean {
    return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
  },

  // Switch the connected wallet to Celo mainnet. Call before any write transaction.
  async ensureCeloNetwork(): Promise<void> {
    if (!this.hasInjectedProvider()) return;
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa4ec' }], // 42220 in hex
      });
    } catch (switchError: any) {
      // Chain not added to wallet — add it
      if (switchError.code === 4902) {
        await (window as any).ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0xa4ec',
            chainName: 'Celo',
            nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
            rpcUrls: ['https://forno.celo.org'],
            blockExplorerUrls: ['https://explorer.celo.org'],
          }],
        });
      } else {
        throw switchError;
      }
    }
  },

  async getConnectedAddress(): Promise<string | null> {
    if (this.hasInjectedProvider()) {
      try {
        const walletClient = createWalletClient({ chain: celo, transport: custom((window as any).ethereum) });
        const [address] = await walletClient.getAddresses();
        return address || null;
      } catch {
        return null;
      }
    }
    return (typeof window !== 'undefined' ? localStorage.getItem('fable_mock_wallet') : null) || null;
  },

  async connectWallet(): Promise<string> {
    if (this.hasInjectedProvider()) {
      const walletClient = createWalletClient({ chain: celo, transport: custom((window as any).ethereum) });
      const [address] = await walletClient.requestAddresses();
      return address;
    }
    // Mock wallet for local dev
    let mockAddress = localStorage.getItem('fable_mock_wallet');
    if (!mockAddress) {
      const randHex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      mockAddress = `0x${randHex}`;
      localStorage.setItem('fable_mock_wallet', mockAddress);
    }
    return mockAddress;
  },

  async getG$Balance(address: string): Promise<string> {
    if (!address.startsWith('0x')) return '0.00';
    if (!this.hasInjectedProvider()) {
      return localStorage.getItem(`fable_mock_g$_bal_${address.toLowerCase()}`) || '50000.00';
    }
    try {
      const balance = await publicClient.readContract({ address: G$_ADDRESS, abi: G$_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] });
      const decimals = await publicClient.readContract({ address: G$_ADDRESS, abi: G$_ABI, functionName: 'decimals' }).catch(() => 18);
      return (Number(balance) / Math.pow(10, Number(decimals))).toFixed(2);
    } catch {
      return '0.00';
    }
  },

  async getEntitlement(address: string): Promise<string> {
    if (!address.startsWith('0x')) return '0.00';
    if (!this.hasInjectedProvider()) {
      const lastClaim = localStorage.getItem(`fable_last_claim_${address.toLowerCase()}`);
      return lastClaim === new Date().toDateString() ? '0.00' : '10.00';
    }
    try {
      const entitlement = await publicClient.readContract({
        address: UBISCHEME_ADDRESS, abi: UBISCHEME_ABI, functionName: 'checkEntitlement',
        args: [address as `0x${string}`],
      }).catch(() => BigInt(0));
      return (Number(entitlement) / 1e18).toFixed(2);
    } catch {
      return '0.00';
    }
  },

  async isGoodDollarVerified(address: string): Promise<boolean> {
    try {
      const root = await publicClient.readContract({
        address: IDENTITY_ADDRESS,
        abi: IDENTITY_ABI,
        functionName: 'getWhitelistedRoot',
        args: [address as `0x${string}`],
      });
      return root !== '0x0000000000000000000000000000000000000000';
    } catch {
      return false;
    }
  },

  async claimUBI(address: string): Promise<boolean> {
    if (!this.hasInjectedProvider()) {
      const today = new Date().toDateString();
      localStorage.setItem(`fable_last_claim_${address.toLowerCase()}`, today);
      const currentBal = Number(await this.getG$Balance(address));
      localStorage.setItem(`fable_mock_g$_bal_${address.toLowerCase()}`, (currentBal + 10).toFixed(2));
      return true;
    }
    await this.ensureCeloNetwork();
    const walletClient = createWalletClient({ chain: celo, transport: custom((window as any).ethereum) });
    const { request } = await publicClient.simulateContract({
      account: address as `0x${string}`, address: UBISCHEME_ADDRESS, abi: UBISCHEME_ABI, functionName: 'claim',
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === 'success';
  },

  // Buy a Fable item: transfers G$ and mints the NFT in one transaction via transferAndCall.
  // User calls: gToken.transferAndCall(fableItemsAddress, price, abi.encode(tokenId))
  async buyItem(walletAddress: string, itemId: string, tokenId: number, gdCost: number): Promise<NftItem | null> {
    const amountWei = parseUnits(String(gdCost), 18);
    const data = encodeAbiParameters(parseAbiParameters('uint256'), [BigInt(tokenId)]);

    if (!this.hasInjectedProvider()) {
      const currentBal = Number(await this.getG$Balance(walletAddress));
      if (currentBal < gdCost) return null;
      localStorage.setItem(`fable_mock_g$_bal_${walletAddress.toLowerCase()}`, (currentBal - gdCost).toFixed(2));
      return {
        itemId,
        tokenId,
        txHash: `mock_buy_${tokenId}_${Date.now()}`,
        mintedAt: new Date().toISOString(),
      };
    }

    try {
      await this.ensureCeloNetwork();
      const walletClient = createWalletClient({ chain: celo, transport: custom((window as any).ethereum) });
      const { request } = await publicClient.simulateContract({
        account: walletAddress as `0x${string}`,
        address: G$_ADDRESS,
        abi: G$_ABI,
        functionName: 'transferAndCall',
        args: [FABLE_ITEMS_ADDRESS, amountWei, data],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') return null;
      return {
        itemId,
        tokenId,
        txHash: hash,
        mintedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error('buyItem failed:', err);
      return null;
    }
  },

  // Check if a wallet owns a specific NFT (reads on-chain balance)
  async checkNFTOwnership(walletAddress: string, tokenId: number): Promise<boolean> {
    if (!FABLE_ITEMS_ADDRESS || !walletAddress.startsWith('0x')) return false;
    try {
      const balance = await publicClient.readContract({
        address: FABLE_ITEMS_ADDRESS,
        abi: FABLE_ITEMS_ABI,
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`, BigInt(tokenId)],
      });
      return Number(balance) > 0;
    } catch {
      return false;
    }
  },
};
