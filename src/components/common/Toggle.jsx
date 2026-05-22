export default function Toggle({ value, onChange, id }) {
  return (
    <div
      id={id}
      className={`toggle-track ${value ? 'on' : ''}`}
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') onChange(!value); }}
    >
      <div className="toggle-thumb" />
    </div>
  );
}
