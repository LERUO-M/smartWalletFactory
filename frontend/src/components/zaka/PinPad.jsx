import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function PinPad({ value, onChange, error, max = 6 }) {
  const press = (k) => {
    if (k === 'del') onChange(value.slice(0, -1));
    else if (k && value.length < max) onChange(value + k);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const slots = Math.max(4, value.length);
  return (
    <div>
      <motion.div key={error} animate={error ? { x: [0, -8, 8, -6, 6, 0] } : {}} className="flex h-6 items-center justify-center gap-4">
        {Array.from({ length: slots }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full transition-all duration-200 ${
              i < value.length ? 'scale-100 bg-zaka-cream' : 'scale-90 border border-zaka-mute/50'
            }`}
          />
        ))}
      </motion.div>
      <p className="mt-3 min-h-[20px] text-center text-sm text-rose-500">{error}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              type="button"
              key={i}
              onClick={() => press(k)}
              aria-label={k === 'del' ? 'Delete' : k}
              className="flex h-[52px] items-center justify-center rounded-2xl text-xl font-medium transition hover:bg-zaka-cream/5 active:scale-95 active:bg-zaka-cream/10"
            >
              {k === 'del' ? <Delete className="h-5 w-5" /> : k}
            </button>
          )
        )}
      </div>
    </div>
  );
}
