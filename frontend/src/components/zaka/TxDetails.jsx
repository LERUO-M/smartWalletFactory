import { ArrowUpRight } from 'lucide-react';
import SponsoredNote from './SponsoredNote';

export default function TxDetails({ hash }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zaka-line bg-zaka-panel p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">Receipt</p>
        <p className="mt-1 font-mono text-sm text-zaka-cream">Ref: {hash.slice(0, 8)}...</p>
        <a
          href={`https://jiffyscan.xyz/userOpHash/${hash}?network=sepolia`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm text-zaka-teal hover:underline"
        >
          View on explorer <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
      <SponsoredNote />
    </div>
  );
}
