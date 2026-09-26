export default function Field({ error, helper, prefix, ...props }) {
  return (
    <div>
      <div
        className={`flex items-baseline gap-2 border-b-2 pb-3 transition-colors ${
          error ? 'border-rose-400/70' : 'border-zaka-line focus-within:border-zaka-teal'
        }`}
      >
        {prefix && <span className="text-3xl text-zaka-mute">{prefix}</span>}
        <input
          {...props}
          className="w-full bg-transparent text-3xl font-medium tracking-tight outline-none placeholder:text-zaka-line"
        />
      </div>
      <p className={`mt-3 text-sm ${error ? 'text-rose-500' : 'text-zaka-mute'}`}>{error || helper}</p>
    </div>
  );
}
