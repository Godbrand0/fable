import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo, celoAlfajores } from 'viem/chains';
import { FABLE_ITEMS_ADDRESS, FABLE_ITEMS_ABI, ITEM_TOKEN_IDS } from '../../../lib/nft';
import { G$_ADDRESS } from '../../../lib/celo';
import { parseAbi } from 'viem';

const IS_TESTNET = process.env.NEXT_PUBLIC_USE_TESTNET === 'true';
const chain = IS_TESTNET ? celoAlfajores : celo;
const RPC = process.env.CELO_RPC_URL
  || (IS_TESTNET ? 'https://alfajores-forno.celo-testnet.org' : 'https://forno.celo.org');

const serverClient = createPublicClient({ chain, transport: http(RPC) });

const ERC20_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

// Verify that a G$ Transfer event exists in the tx targeting the treasury
async function verifyPayment(txHash: `0x${string}`, expectedFrom: string, expectedAmount: number): Promise<boolean> {
  try {
    const receipt = await serverClient.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== 'success') return false;

    // Look for a Transfer log from the G$ contract to the treasury
    const logs = await serverClient.getLogs({
      address: G$_ADDRESS,
      event: ERC20_ABI[0],
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    return logs.some(log => {
      const from = (log.args as any).from?.toLowerCase();
      const to   = (log.args as any).to?.toLowerCase();
      const val  = Number((log.args as any).value ?? BigInt(0)) / 1e18;
      return (
        from === expectedFrom.toLowerCase() &&
        to   === '0x91487d8bc1b573f0bc6c23de7ba23d50f49f627b' &&
        val  >= expectedAmount * 0.99 // 1% tolerance for rounding
      );
    });
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, itemId, paymentTxHash, gdCost } = body as {
      walletAddress: string;
      itemId: string;
      paymentTxHash: string;
      gdCost: number;
    };

    if (!walletAddress || !itemId || !paymentTxHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const tokenId = ITEM_TOKEN_IDS[itemId];
    if (!tokenId) {
      return NextResponse.json({ error: `Unknown itemId: ${itemId}` }, { status: 400 });
    }

    const isMockPayment = paymentTxHash.startsWith('mock_');
    const contractDeployed = !!FABLE_ITEMS_ADDRESS;
    const minterKey = process.env.MINTER_PRIVATE_KEY;

    // ── Payment verification ────────────────────────────────────────────────
    if (!isMockPayment && contractDeployed) {
      const valid = await verifyPayment(paymentTxHash as `0x${string}`, walletAddress, gdCost);
      if (!valid && process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'G$ payment could not be verified' }, { status: 400 });
      }
    }

    // ── Mint NFT ────────────────────────────────────────────────────────────
    if (!contractDeployed || !minterKey) {
      // Contract not yet deployed — record as mock mint
      const mockHash = `mock_mint_${itemId}_${Date.now()}`;
      return NextResponse.json({
        success: true,
        mocked: true,
        tokenId,
        txHash: mockHash,
        message: 'NFT recorded off-chain (contract pending deployment)',
      });
    }

    const minterAccount = privateKeyToAccount(minterKey as `0x${string}`);
    const minterWallet  = createWalletClient({ account: minterAccount, chain, transport: http(RPC) });

    const { request } = await serverClient.simulateContract({
      account: minterAccount,
      address: FABLE_ITEMS_ADDRESS,
      abi: FABLE_ITEMS_ABI,
      functionName: 'mint',
      args: [walletAddress as `0x${string}`, BigInt(tokenId), itemId],
    });

    const mintHash = await minterWallet.writeContract(request);
    await serverClient.waitForTransactionReceipt({ hash: mintHash });

    return NextResponse.json({ success: true, mocked: false, tokenId, txHash: mintHash });
  } catch (err: any) {
    console.error('[mint-item]', err);
    return NextResponse.json({ error: err.message || 'Mint failed' }, { status: 500 });
  }
}
