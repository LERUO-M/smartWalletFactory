export default function Logo({ size = 40 }) {
  return (
    <div className="relative flex items-center" style={{ width: size * 1.35, height: size }}>
      <div className="grid grid-cols-2 gap-[2px]" style={{ width: size * 0.56, height: size * 0.62 }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="rounded-[2px] bg-zaka-teal" />
        ))}
      </div>
      <div
        className="absolute right-0 top-0 flex h-full items-center justify-end rounded-[22%] bg-zaka-cream"
        style={{ width: size * 0.9, paddingRight: size * 0.1 }}
      >
        <span
          className="flex items-center justify-center rounded-[30%] border-2 border-zaka-ink/80"
          style={{ width: size * 0.36, height: size * 0.3 }}
        >
          <span className="rounded-full bg-zaka-gold" style={{ width: size * 0.11, height: size * 0.11 }} />
        </span>
      </div>
    </div>
  );
}
