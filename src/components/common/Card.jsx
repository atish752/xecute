export default function Card({ children, className = '', style = {}, onClick, glass = true, amber = false, cyan = false }) {
  const baseClass = amber ? 'glass-amber' : cyan ? 'glass-cyan' : glass ? 'glass' : '';
  return (
    <div
      className={`card ${baseClass} ${onClick ? 'card-hover' : ''} ${className}`}
      style={{ cursor: onClick ? 'pointer' : 'default', ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
