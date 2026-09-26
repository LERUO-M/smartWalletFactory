import { ShieldCheck } from 'lucide-react';

export default function SponsoredNote({ text = 'R0 transfer fee' }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zaka-teal/30 bg-zaka-teal/10 px-3 py-1.5 text-xs text-zaka-teal">
      <ShieldCheck className="h-3.5 w-3.5" />
      {text}
    </div>
  );
}
