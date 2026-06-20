import { createPublicClient, createWalletClient, custom, http, parseAbi } from 'viem';
import { celo } from 'viem/chains';
import { FABLE_ITEMS_ADDRESS, FABLE_ITEMS_ABI, NftItem } from './nft';

const CELO_RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';

export const G$_ADDRESS = (process.env.NEXT_PUBLIC_GOODDOLLAR_ADDRESS || '0x62B8B11039FcfE5aB0C56E502b836208dA855E96') as `0x${string}`;
export const UBISCHEME_ADDRESS = (process.env.NEXT_PUBLIC_UBISCHEME_ADDRESS || '0xAACbaaB8571cbECEB46ba85B5981efDB8928545e') as `0x${string}`;
export const GAME_TREASURY_ADDRESS = (process.env.NEXT_PUBLIC_GAME_TREASURY_ADDRESS || '0x62B8B11039FcfE5aB0C56E502b836208dA855E96') as `0x${string}`;

export const G$_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
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
      return localStorage.getItem(`fable_mock_g$_bal_${address.toLowerCase()}`) || '150.00';
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

  async claimUBI(address: string): Promise<boolean> {
    if (!this.hasInjectedProvider()) {
      const today = new Date().toDateString();
      localStorage.setItem(`fable_last_claim_${address.toLowerCase()}`, today);
      const currentBal = Number(await this.getG$Balance(address));
      localStorage.setItem(`fable_mock_g$_bal_${address.toLowerCase()}`, (currentBal + 10).toFixed(2));
      return true;
    }
    try {
      const walletClient = createWalletClient({ chain: celo, transport: custom((window as any).ethereum) });
      const { request } = await publicClient.simulateContract({
        account: address as `0x${string}`, address: UBISCHEME_ADDRESS, abi: UBISCHEME_ABI, functionName: 'claim',
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('UBI Claim failed:', err);
      return false;
    }
  },

  // Transfer G$ to game treasury and return the tx hash (needed for NFT mint verification)
  async transferG$(sender: string, recipient: string, amount: string): Promise<{ success: boolean; txHash: string }> {
    const amountBig = BigInt(Math.floor(Number(amount) * 1e18));

    if (!this.hasInjectedProvider()) {
      const currentBal = Number(await this.getG$Balance(sender));
      if (currentBal >= Number(amount)) {
        localStorage.setItem(`fable_mock_g$_bal_${sender.toLowerCase()}`, (currentBal - Number(amount)).toFixed(2));
        return { success: true, txHash: `mock_tx_${Date.now()}` };
      }
      return { success: false, txHash: '' };
    }

    try {
      const walletClient = createWalletClient({ chain: celo, transport: custom((window as any).ethereum) });
      const { request } = await publicClient.simulateContract({
        account: sender as `0x${string}`, address: G$_ADDRESS, abi: G$_ABI,
        functionName: 'transfer', args: [recipient as `0x${string}`, amountBig],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { success: receipt.status === 'success', txHash: hash };
    } catch (err) {
      console.error('G$ Transfer failed:', err);
      return { success: false, txHash: '' };
    }
  },

  // Call the mint-item API route to mint an NFT after G$ payment
  async mintNFTViaAPI(walletAddress: string, itemId: string, paymentTxHash: string, gdCost: number): Promise<NftItem | null> {
    try {
      const res = await fetch('/api/mint-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, itemId, paymentTxHash, gdCost }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        console.error('[mintNFTViaAPI] Failed:', data.error);
        return null;
      }
      return {
        itemId,
        tokenId: data.tokenId,
        txHash: data.txHash,
        mintedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error('[mintNFTViaAPI]', err);
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
