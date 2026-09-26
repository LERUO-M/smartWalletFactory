import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import Step from './Step';

export default function Result({ ok = true, title, children, actions }) {
  return (
    <Step>
      <div className="flex flex-1 flex-col justify-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className={`flex h-16 w-16 items-center justify-center rounded-full ${
            ok ? 'bg-zaka-teal text-zaka-ink' : 'bg-rose-400/15 text-rose-500'
          }`}
        >
          {ok ? <Check className="h-8 w-8" strokeWidth={2.5} /> : <X className="h-8 w-8" />}
        </motion.div>
        <h1 className="mt-8 font-display text-[34px] leading-[1.05] tracking-tight">{title}</h1>
        <div className="mt-5 space-y-4 text-zaka-mute">{children}</div>
      </div>
      <div className="space-y-3 pt-6">{actions}</div>
    </Step>
  );
}
