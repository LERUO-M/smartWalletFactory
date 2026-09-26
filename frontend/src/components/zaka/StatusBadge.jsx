import { isVerified } from '@/lib/wallet';

// Shows the person's verification level – never technical account state.
export default function StatusBadge({ wallet }) {
  const verified = isVerified(wallet);
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
        verified ? 'bg-zaka-teal/15 text-zaka-teal' : 'bg-zaka-gold/10 text-zaka-gold'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${verified ? 'bg-zaka-teal' : 'bg-zaka-gold'}`} />
      {verified ? 'Verified' : 'Not verified yet'}
    </span>
  );
}
