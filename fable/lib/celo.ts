import { createPublicClient, createWalletClient, custom, http, parseAbi, encodeAbiParameters, parseAbiParameters, parseUnits, formatUnits, WalletClient } from 'viem';
import { celo } from 'viem/chains';
import { FABLE_ITEMS_ADDRESS, FABLE_ITEMS_ABI, NftItem } from './nft';
import { FABLE_MARKETPLACE_ADDRESS, FABLE_MARKETPLACE_ABI, MarketListing } from './marketplace';
import { getWeb3AuthProvider } from './web3auth';

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
  'function transfer(address to, uint256 value) returns (bool)',
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

  getWalletClient(account?: `0x${string}`): WalletClient | null {
    const web3authProvider = getWeb3AuthProvider();
    if (web3authProvider) {
      return createWalletClient({ account, chain: celo, transport: custom(web3authProvider) });
    }
    if (this.hasInjectedProvider()) {
      return createWalletClient({ account, chain: celo, transport: custom((window as any).ethereum) });
    }
    return null;
  },

  // Switch the connected wallet to Celo mainnet. Call before any write transaction.
  async ensureCeloNetwork(): Promise<void> {
    const web3authProvider = getWeb3AuthProvider();
    if (web3authProvider) return; // Web3Auth is pre-configured for Celo
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
    const walletClient = this.getWalletClient();
    if (walletClient) {
      try {
        const [address] = await walletClient.getAddresses();
        return address || null;
      } catch {
        return null;
      }
    }
    return (typeof window !== 'undefined' ? localStorage.getItem('fable_mock_wallet') : null) || null;
  },

  async connectWallet(): Promise<string> {
    const walletClient = this.getWalletClient();
    if (walletClient) {
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
    if (!this.getWalletClient()) {
      return localStorage.getItem(`fable_mock_g$_bal_${address.toLowerCase()}`) || '50000.00';
    }
    try {
      const balance = await publicClient.readContract({ address: G$_ADDRESS, abi: G$_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] });
      const decimals = await publicClient.readContract({ address: G$_ADDRESS, abi: G$_ABI, functionName: 'decimals' }).catch(() => 18);
      let formatted = parseUnits(balance.toString(), -decimals).toString();
      if (formatted.length > 2) {
        formatted = formatted.slice(0, -16);
        return (Number(formatted) / 100).toFixed(2);
      }
      return '0.00';
    } catch {
      return '0.00';
    }
  },

  async getEntitlement(address: string): Promise<string> {
    if (!address.startsWith('0x')) return '0.00';
    if (!this.getWalletClient()) {
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
    if (!address.startsWith('0x')) return false;
    if (!this.getWalletClient()) {
      return localStorage.getItem(`fable_mock_verified_${address.toLowerCase()}`) === 'true';
    }
    try {
      const root = await publicClient.readContract({
        address: IDENTITY_ADDRESS,
        abi: IDENTITY_ABI,
        functionName: 'getWhitelistedRoot',
        args: [address as `0x${string}`],
      });
      return root !== '0x0000000000000000000000000000000000000000';
    } catch (err) {
      console.error("isGoodDollarVerified error:", err);
      return false;
    }
  },

  async getVerificationLink(address: string, callbackUrl: string): Promise<string> {
    if (!this.getWalletClient()) {
      localStorage.setItem(`fable_mock_verified_${address.toLowerCase()}`, 'true');
      return 'about:blank';
    }
    const walletClient = this.getWalletClient(address as `0x${string}`);
    if (!walletClient) throw new Error("WalletClient not found");

    const { IdentitySDK } = await import('@goodsdks/citizen-sdk');
    const sdk = new IdentitySDK({
      account: address as `0x${string}`,
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      env: 'production',
    });
    return await sdk.generateFVLink(true, callbackUrl, 42220);
  },

  async claimUBI(address: string): Promise<boolean> {
    if (!this.getWalletClient()) {
      const today = new Date().toDateString();
      localStorage.setItem(`fable_last_claim_${address.toLowerCase()}`, today);
      const currentBal = Number(await this.getG$Balance(address));
      localStorage.setItem(`fable_mock_g$_bal_${address.toLowerCase()}`, (currentBal + 10).toFixed(2));
      return true;
    }
    await this.ensureCeloNetwork();
    const walletClient = this.getWalletClient(address as `0x${string}`);
    if (!walletClient) throw new Error("WalletClient not found");

    const { IdentitySDK, ClaimSDK } = await import('@goodsdks/citizen-sdk');
    const identitySDK = new IdentitySDK({
      account: address as `0x${string}`,
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      env: 'production',
    });
    const claimSDK = new ClaimSDK({
      account: address as `0x${string}`,
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      identitySDK: identitySDK as any,
      env: 'production',
    });
    const receipt = await claimSDK.claim();
    return receipt.status === 'success';
  },

  async transferG$(from: string, to: string, amount: number): Promise<boolean> {
    const walletClient = this.getWalletClient(from as `0x${string}`);
    if (!walletClient) throw new Error("WalletClient not found");
    await this.ensureCeloNetwork();
    try {
      const value = parseUnits(amount.toString(), 18);
      const { request } = await publicClient.simulateContract({
        address: G$_ADDRESS,
        abi: G$_ABI,
        functionName: 'transfer',
        args: [to as `0x${string}`, value],
        account: from as `0x${string}`
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error("Transfer error:", err);
      return false;
    }
  },

  // Buy a Fable item: transfers G$ and mints the NFT in one transaction via transferAndCall.
  // User calls: gToken.transferAndCall(fableItemsAddress, price, abi.encode(tokenId))
  async buyItem(walletAddress: string, itemId: string, tokenId: number, gdCost: number): Promise<NftItem | null> {
    const amountWei = parseUnits(String(gdCost), 18);
    const data = encodeAbiParameters(parseAbiParameters('uint256'), [BigInt(tokenId)]);

    if (!this.getWalletClient()) {
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
      const walletClient = this.getWalletClient(walletAddress as `0x${string}`);
      if (!walletClient) throw new Error('No wallet client available');
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

  // ── Marketplace ────────────────────────────────────────────────────────────
  // Real wallet → FableMarketplace contract. No wallet (dev) → localStorage market,
  // same convention as buyItem/claimUBI above.

  // 'mock' = dev market in localStorage, 'chain' = deployed contract, 'unavailable' = real wallet but no contract address
  marketMode(): 'mock' | 'chain' | 'unavailable' {
    if (!this.getWalletClient()) return 'mock';
    return FABLE_MARKETPLACE_ADDRESS ? 'chain' : 'unavailable';
  },

  _readMockMarket(): { nextId: number; listings: MarketListing[] } {
    try {
      const raw = JSON.parse(localStorage.getItem('fable_mock_market') || 'null');
      if (raw && Array.isArray(raw.listings)) return raw;
    } catch { /* fall through */ }
    return { nextId: 1, listings: [] };
  },

  // Native CELO balance (gas). Dev mock wallet always reports plenty.
  async getCeloBalance(address: string): Promise<number> {
    if (!this.getWalletClient()) return Infinity;
    try {
      return Number(formatUnits(await publicClient.getBalance({ address: address as `0x${string}` }), 18));
    } catch {
      return 0;
    }
  },

  // Marketplace fee in basis points (100 = 1%). Dev mock market has no fee.
  async getMarketFeeBps(): Promise<number> {
    if (this.marketMode() !== 'chain') return 0;
    try {
      return Number(await publicClient.readContract({
        address: FABLE_MARKETPLACE_ADDRESS as `0x${string}`, abi: FABLE_MARKETPLACE_ABI, functionName: 'feeBps',
      }));
    } catch {
      return 0;
    }
  },

  async getMarketListings(): Promise<MarketListing[]> {
    const mode = this.marketMode();
    if (mode === 'unavailable') return [];
    if (mode === 'mock') return this._readMockMarket().listings;

    const market = FABLE_MARKETPLACE_ADDRESS as `0x${string}`;
    const next = Number(await publicClient.readContract({ address: market, abi: FABLE_MARKETPLACE_ABI, functionName: 'nextListingId' }));
    const PAGE = 500;
    const out: MarketListing[] = [];
    for (let start = 1; start < next; start += PAGE) {
      const [ids, rows] = await publicClient.readContract({
        address: market, abi: FABLE_MARKETPLACE_ABI, functionName: 'getActiveListings',
        args: [BigInt(start), BigInt(PAGE)],
      });
      rows.forEach((r, i) => out.push({
        id: Number(ids[i]),
        seller: r.seller.toLowerCase(),
        tokenId: Number(r.tokenId),
        price: Number(formatUnits(r.price, 18)),
      }));
    }
    return out;
  },

  // Escrow an item into the marketplace. Asks for a one-time setApprovalForAll first if needed.
  async listItem(walletAddress: string, tokenId: number, priceG$: number): Promise<boolean> {
    const mode = this.marketMode();
    if (mode === 'unavailable') return false;
    if (mode === 'mock') {
      const m = this._readMockMarket();
      m.listings.push({ id: m.nextId++, seller: walletAddress.toLowerCase(), tokenId, price: priceG$ });
      localStorage.setItem('fable_mock_market', JSON.stringify(m));
      return true;
    }

    try {
      await this.ensureCeloNetwork();
      const account = walletAddress as `0x${string}`;
      const walletClient = this.getWalletClient(account);
      if (!walletClient) throw new Error('No wallet client available');
      const market = FABLE_MARKETPLACE_ADDRESS as `0x${string}`;

      const approved = await publicClient.readContract({
        address: FABLE_ITEMS_ADDRESS, abi: FABLE_ITEMS_ABI, functionName: 'isApprovedForAll', args: [account, market],
      });
      if (!approved) {
        const { request } = await publicClient.simulateContract({
          account, address: FABLE_ITEMS_ADDRESS, abi: FABLE_ITEMS_ABI, functionName: 'setApprovalForAll', args: [market, true],
        });
        const approveHash = await walletClient.writeContract(request);
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        if (approveReceipt.status !== 'success') return false;
      }

      const { request } = await publicClient.simulateContract({
        account, address: market, abi: FABLE_MARKETPLACE_ABI, functionName: 'list',
        args: [BigInt(tokenId), parseUnits(String(priceG$), 18)],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('listItem failed:', err);
      return false;
    }
  },

  async cancelListing(walletAddress: string, listingId: number): Promise<boolean> {
    const mode = this.marketMode();
    if (mode === 'unavailable') return false;
    if (mode === 'mock') {
      const m = this._readMockMarket();
      const idx = m.listings.findIndex(l => l.id === listingId && l.seller === walletAddress.toLowerCase());
      if (idx < 0) return false;
      m.listings.splice(idx, 1);
      localStorage.setItem('fable_mock_market', JSON.stringify(m));
      return true;
    }

    try {
      await this.ensureCeloNetwork();
      const account = walletAddress as `0x${string}`;
      const walletClient = this.getWalletClient(account);
      if (!walletClient) throw new Error('No wallet client available');
      const { request } = await publicClient.simulateContract({
        account, address: FABLE_MARKETPLACE_ADDRESS as `0x${string}`, abi: FABLE_MARKETPLACE_ABI,
        functionName: 'cancel', args: [BigInt(listingId)],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('cancelListing failed:', err);
      return false;
    }
  },

  // Buy a listing in one tx: gToken.transferAndCall(marketplace, price, abi.encode(listingId)).
  async buyListing(walletAddress: string, listing: MarketListing): Promise<boolean> {
    const mode = this.marketMode();
    if (mode === 'unavailable') return false;
    if (mode === 'mock') {
      const m = this._readMockMarket();
      const idx = m.listings.findIndex(l => l.id === listing.id);
      if (idx < 0) return false;
      const buyerBal = Number(await this.getG$Balance(walletAddress));
      if (buyerBal < listing.price) return false;
      localStorage.setItem(`fable_mock_g$_bal_${walletAddress.toLowerCase()}`, (buyerBal - listing.price).toFixed(2));
      const sellerBal = Number(await this.getG$Balance(listing.seller));
      localStorage.setItem(`fable_mock_g$_bal_${listing.seller}`, (sellerBal + listing.price).toFixed(2));
      m.listings.splice(idx, 1);
      localStorage.setItem('fable_mock_market', JSON.stringify(m));
      return true;
    }

    try {
      await this.ensureCeloNetwork();
      const account = walletAddress as `0x${string}`;
      const walletClient = this.getWalletClient(account);
      if (!walletClient) throw new Error('No wallet client available');
      const { request } = await publicClient.simulateContract({
        account,
        address: G$_ADDRESS,
        abi: G$_ABI,
        functionName: 'transferAndCall',
        args: [
          FABLE_MARKETPLACE_ADDRESS as `0x${string}`,
          parseUnits(String(listing.price), 18),
          encodeAbiParameters(parseAbiParameters('uint256'), [BigInt(listing.id)]),
        ],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('buyListing failed:', err);
      return false;
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
