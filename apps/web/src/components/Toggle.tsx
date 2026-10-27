export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3">
      <span className="flex-1">
        <span className="block text-body">{label}</span>
        {hint && <span className="block text-caption text-text-3">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-well shadow-[var(--key-pressed)] transition-colors peer-checked:bg-flame peer-focus-visible:outline-2 peer-focus-visible:outline-flame after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-text-2 after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-on-flame"
      />
    </label>
  );
}
