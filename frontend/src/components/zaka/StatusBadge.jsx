export default function StatusBadge({ deployed }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
        deployed ? 'bg-zaka-teal/15 text-zaka-teal' : 'bg-zaka-gold/10 text-zaka-gold'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${deployed ? 'bg-zaka-teal' : 'bg-zaka-gold'}`} />
      {deployed ? 'Active' : 'Activates on first payment'}
    </span>
  );
}
