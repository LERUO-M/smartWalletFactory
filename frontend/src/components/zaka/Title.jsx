export default function Title({ title, sub }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-[30px] leading-[1.1] tracking-tight">{title}</h1>
      {sub && <p className="mt-3 text-zaka-mute">{sub}</p>}
    </div>
  );
}
