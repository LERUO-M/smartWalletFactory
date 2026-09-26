import { motion } from 'framer-motion';
import Step from './Step';

export default function Processing({ label = 'Processing' }) {
  return (
    <Step className="items-center justify-center text-center">
      <div className="relative h-28 w-28">
        {[0, 0.8].map((d) => (
          <motion.span
            key={d}
            className="absolute inset-0 rounded-full border border-zaka-teal/50"
            animate={{ scale: [1, 1.6], opacity: [0.8, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: d, ease: 'easeOut' }}
          />
        ))}
        <div className="absolute inset-5 animate-spin rounded-full border-2 border-zaka-line border-t-zaka-teal" />
      </div>
      <p className="mt-10 font-display text-2xl tracking-tight">{label}</p>
      <p className="mt-2 text-sm text-zaka-mute">This takes a few seconds. No fees are charged.</p>
    </Step>
  );
}
