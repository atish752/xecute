export default function ProgressRing({ progress = 0, size = 80, strokeWidth = 6, color = '#F5A623', label, sublabel }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.34,1.56,0.64,1)', filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
      </svg>
      {label !== undefined && (
        <div style={{ position: 'absolute', textAlign: 'center' }}>
          <div className="font-syne font-bold" style={{ fontSize: size * 0.22, color: '#F0F2F7', lineHeight: 1 }}>{label}</div>
          {sublabel && <div className="font-dm" style={{ fontSize: size * 0.13, color: '#8B90A0', marginTop: 2 }}>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}
