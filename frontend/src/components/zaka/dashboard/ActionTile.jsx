import { Link } from 'react-router-dom';

export default function ActionTile({ n, icon: Icon, label, sub, to }) {
  return (
    <Link
      to={to}
      className="group flex h-40 flex-col justify-between rounded-3xl border border-zaka-line bg-zaka-panel/60 p-5 transition-all duration-300 hover:border-zaka-teal/50 hover:bg-zaka-panel active:scale-[0.98]"
    >
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zaka-cream/5 text-zaka-teal transition-colors duration-300 group-hover:bg-zaka-teal group-hover:text-zaka-ink">
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-mono text-[11px] text-zaka-mute">{n}</span>
      </div>
      <span>
        <span className="block font-medium leading-snug">{label}</span>
        <span className="mt-0.5 block text-xs text-zaka-mute">{sub}</span>
      </span>
    </Link>
  );
}
