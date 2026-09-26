import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import SponsoredNote from './SponsoredNote';

// Receipt: a reference number people can quote to support. No technical details.
export default function TxDetails({ reference }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-4">
      {reference && (
        <div className="rounded-2xl border border-zaka-line bg-zaka-panel p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">Reference</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="break-all font-mono text-sm text-zaka-cream">{reference}</p>
            <button type="button" onClick={copy} aria-label="Copy reference" className="shrink-0 rounded-lg p-2 text-zaka-mute transition hover:bg-zaka-cream/5 hover:text-zaka-cream">
              {copied ? <Check className="h-4 w-4 text-zaka-teal" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
      <SponsoredNote />
    </div>
  );
}
