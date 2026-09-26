import { motion } from 'framer-motion';
import StatusBadge from '../StatusBadge';
import { zar } from '@/lib/wallet';

export default function BalanceCard({ wallet }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-zaka-line bg-gradient-to-br from-zaka-panel to-zaka-ink p-6">
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-zaka-teal/15 blur-2xl" />
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-mute">Available balance</p>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-sm text-zaka-mute">ZAR</span>
        <motion.span
          key={wallet.balance}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-5xl font-semibold tracking-tight"
        >
          {zar(wallet.balance)}
        </motion.span>
      </div>
      <div className="mt-6">
        <StatusBadge deployed={wallet.deployed} />
      </div>
    </div>
  );
}
