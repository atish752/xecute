const LABELS = { p1: 'P1 Critical', p2: 'P2 Important', p3: 'P3 Nice to Have' };
const ICONS  = { p1: '🔴', p2: '🟡', p3: '🟢' };

export default function PriorityBadge({ priority, showLabel = true }) {
  return (
    <span
      className={`chip badge-${priority}`}
      style={{ borderRadius: 8, padding: '3px 8px' }}
    >
      {ICONS[priority]} {showLabel && LABELS[priority]}
    </span>
  );
}
