'use client';

import React from 'react';
import Image from 'next/image';
import { X, Sword, Sparkles, ExternalLink, Gem } from 'lucide-react';
import { GD_ITEMS, FABLE_ITEMS_ADDRESS } from '../lib/nft';

interface NftItem {
  itemId: string;
  tokenId: number;
  txHash: string;
  mintedAt: string;
}

interface Props {
  nft: NftItem;
  onClose: () => void;
}

export default function NFTDetailModal({ nft, onClose }: Props) {
  const def = GD_ITEMS.find(i => i.id === nft.itemId);
  if (!def) return null;

  const isWeapon = def.category === 'weapon';
  const explorerUrl = `https://celoscan.io/nft/${FABLE_ITEMS_ADDRESS}/${nft.tokenId}`;

  return (
    <div
      className="fixed inset-0 z-80 bg-black/85 flex items-center justify-center p-4 font-mono"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-zinc-950 border border-purple-800/50 rounded-2xl shadow-2xl shadow-purple-950/40 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Image */}
        <div className="relative w-full aspect-square bg-zinc-900">
          <Image src={`/nft/${def.id}.png`} alt={def.name} fill className="object-cover" />
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-white rounded-full p-1.5"
          >
            <X size={16} />
          </button>
          <span className="absolute bottom-2 left-2 flex items-center gap-1 text-[9px] font-bold bg-purple-950/80 border border-purple-700/50 text-purple-300 px-2 py-1 rounded-full uppercase tracking-wider">
            <Gem size={10} /> On-chain NFT
          </span>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-yellow-400">{def.name}</h2>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                {isWeapon ? 'Weapon' : 'Ability'} · Token #{nft.tokenId}
              </span>
            </div>
          </div>

          {/* Story / flavor text */}
          <p className="text-xs text-zinc-400 italic leading-relaxed">"{def.desc}"</p>

          {/* Combat info */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
            {isWeapon ? <Sword size={14} className="text-red-400 shrink-0" /> : <Sparkles size={14} className="text-purple-400 shrink-0" />}
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Combat Effect</span>
              <span className="text-sm font-bold text-zinc-200">{def.effect}</span>
            </div>
          </div>

          {/* Price + mint info */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-2.5 flex flex-col gap-0.5">
              <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">Mint Price</span>
              <span className="text-sm font-extrabold text-emerald-300">{def.gdCost.toLocaleString()} G$</span>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 flex flex-col gap-0.5">
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Minted</span>
              <span className="text-[11px] font-bold text-zinc-300">{new Date(nft.mintedAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* On-chain link */}
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 py-2.5 rounded-lg text-xs font-bold tracking-wider transition-colors"
          >
            <ExternalLink size={13} /> View on Celoscan
          </a>
        </div>
      </div>
    </div>
  );
}
