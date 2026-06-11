import { createPublicClient, createWalletClient, custom, http, parseAbi } from 'viem';
import { celo } from 'viem/chains';

const CELO_RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';

export const G$_ADDRESS = (process.env.NEXT_PUBLIC_GOODDOLLAR_ADDRESS || '0x62B8B11039FcfE5aB0C56E502b836208dA855E96') as `0x${string}`;
export const UBISCHEME_ADDRESS = (process.env.NEXT_PUBLIC_UBISCHEME_ADDRESS || '0xAACbaaB8571cbECEB46ba85B5981efDB8928545e') as `0x${string}`;

// Minimum ABIs needed for the game
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

// Public client for reading on-chain details
export const publicClient = createPublicClient({
  chain: celo,
  transport: http(CELO_RPC),
});

export const celoService = {
  // Check if a wallet is connected / injected
  hasInjectedProvider(): boolean {
    return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
  },

  // Get currently connected address without triggering connection popup
  async getConnectedAddress(): Promise<string | null> {
    if (this.hasInjectedProvider()) {
      try {
        const walletClient = createWalletClient({
          chain: celo,
          transport: custom((window as any).ethereum),
        });
        const [address] = await walletClient.getAddresses();
        return address || null;
      } catch (err) {
        return null;
      }
    }
    // Return mock wallet if it exists in local storage
    return (typeof window !== 'undefined' ? localStorage.getItem('fable_mock_wallet') : null) || null;
  },

  // Connect wallet and return Celo address
  async connectWallet(): Promise<string> {
    if (this.hasInjectedProvider()) {
      try {
        const walletClient = createWalletClient({
          chain: celo,
          transport: custom((window as any).ethereum),
        });
        const [address] = await walletClient.requestAddresses();
        return address;
      } catch (err) {
        console.error('Wallet connection failed:', err);
        throw err;
      }
    }

    // Local Storage Mock Wallet for local dev / testing
    let mockAddress = localStorage.getItem('fable_mock_wallet');
    if (!mockAddress) {
      // Create a mock address
      const randHex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      mockAddress = `0x${randHex}`;
      localStorage.setItem('fable_mock_wallet', mockAddress);
    }
    return mockAddress;
  },

  // Read G$ balance (Decimals are typically 18 for G$ on Celo)
  async getG$Balance(address: string): Promise<string> {
    if (!address.startsWith('0x')) return '0.00';

    // If we're using a mock wallet, return a simulated balance
    if (address.toLowerCase().startsWith('0xmock') || !this.hasInjectedProvider()) {
      const mockBal = localStorage.getItem(`fable_mock_g$_bal_${address.toLowerCase()}`) || '150.00';
      return mockBal;
    }

    try {
      const balance = await publicClient.readContract({
        address: G$_ADDRESS,
        abi: G$_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });
      // G$ usually uses 18 decimals, but let's read or default
      const decimals = await publicClient.readContract({
        address: G$_ADDRESS,
        abi: G$_ABI,
        functionName: 'decimals',
      }).catch(() => 18);

      return (Number(balance) / Math.pow(10, decimals)).toFixed(2);
    } catch (err) {
      console.warn('Could not read G$ balance from chain, using fallback:', err);
      return '0.00';
    }
  },

  // Check UBI entitlement (claimable amount)
  async getEntitlement(address: string): Promise<string> {
    if (!address.startsWith('0x')) return '0.00';

    if (!this.hasInjectedProvider()) {
      // Simulate UBI claim entitlement
      const lastClaim = localStorage.getItem(`fable_last_claim_${address.toLowerCase()}`);
      const today = new Date().toDateString();
      return lastClaim === today ? '0.00' : '10.00';
    }

    try {
      const entitlement = await publicClient.readContract({
        address: UBISCHEME_ADDRESS,
        abi: UBISCHEME_ABI,
        functionName: 'checkEntitlement',
        args: [address as `0x${string}`],
      }).catch(() => {
        // Fallback for checkEntitlement without arguments if UBIScheme expects sender
        return 0n;
      });

      return (Number(entitlement) / 1e18).toFixed(2);
    } catch (err) {
      console.warn('Could not read entitlement:', err);
      return '0.00';
    }
  },

  // Trigger GoodDollar claim
  async claimUBI(address: string): Promise<boolean> {
    if (!this.hasInjectedProvider()) {
      // Mock UBI claim success
      const today = new Date().toDateString();
      localStorage.setItem(`fable_last_claim_${address.toLowerCase()}`, today);
      // Add UBI amount (10.00 G$) to mock balance
      const currentBal = Number(await this.getG$Balance(address));
      localStorage.setItem(`fable_mock_g$_bal_${address.toLowerCase()}`, (currentBal + 10).toFixed(2));
      return true;
    }

    try {
      const walletClient = createWalletClient({
        chain: celo,
        transport: custom((window as any).ethereum),
      });

      const { request } = await publicClient.simulateContract({
        account: address as `0x${string}`,
        address: UBISCHEME_ADDRESS,
        abi: UBISCHEME_ABI,
        functionName: 'claim',
      });

      const hash = await walletClient.writeContract(request);
      // Wait for tx confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('UBI Claim failed:', err);
      return false;
    }
  },

  // Spend G$ on-chain (e.g. transfer to game treasury)
  async transferG$(sender: string, recipient: string, amount: string): Promise<boolean> {
    const amountBig = BigInt(Math.floor(Number(amount) * 1e18));

    if (!this.hasInjectedProvider()) {
      // Mock transfer
      const currentBal = Number(await this.getG$Balance(sender));
      if (currentBal >= Number(amount)) {
        localStorage.setItem(`fable_mock_g$_bal_${sender.toLowerCase()}`, (currentBal - Number(amount)).toFixed(2));
        return true;
      }
      return false;
    }

    try {
      const walletClient = createWalletClient({
        chain: celo,
        transport: custom((window as any).ethereum),
      });

      const { request } = await publicClient.simulateContract({
        account: sender as `0x${string}`,
        address: G$_ADDRESS,
        abi: G$_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, amountBig],
      });

      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('G$ Transfer failed:', err);
      return false;
    }
  }
};
