const V = {
  primary: 'bg-zaka-cream text-zaka-ink hover:bg-white',
  teal: 'bg-zaka-teal text-zaka-ink hover:brightness-110',
  ghost: 'border border-zaka-line text-zaka-cream hover:bg-white/5',
};

export default function Btn({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      {...props}
      className={`h-14 w-full rounded-2xl font-medium tracking-tight transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${V[variant]} ${className}`}
    />
  );
}
