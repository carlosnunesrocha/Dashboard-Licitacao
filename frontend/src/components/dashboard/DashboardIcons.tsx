/**
 * Ícones para o Dashboard em SVG inline.
 * Padrão: viewBox="0 0 24 24", fill="currentColor", aria-hidden="true"
 * Props: width?: number, height?: number (default 20), className?: string
 */

interface IconProps {
  width?: number;
  height?: number;
  className?: string;
}

const defaultSize = 20;

export function Users({ width = defaultSize, height = defaultSize, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      width={width}
      height={height}
      className={className}
    >
      {/* First user: head and body */}
      <circle cx="8" cy="6" r="2.5" />
      <path d="M8 9c-2.2 0-4 1.3-4 3v3h8v-3c0-1.7-1.8-3-4-3z" />
      {/* Second user: head and body */}
      <circle cx="16" cy="6" r="2.5" />
      <path d="M16 9c-2.2 0-4 1.3-4 3v3h8v-3c0-1.7-1.8-3-4-3z" />
    </svg>
  );
}

export function TrendingUp({ width = defaultSize, height = defaultSize, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      width={width}
      height={height}
      className={className}
    >
      {/* Polyline going up: points at (4,16), (9,10), (14,12), (20,4) */}
      <polyline
        points="4,16 9,10 14,12 20,4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow tip at top right */}
      <path d="M20 4l-3-3v6h6l-3-3z" />
    </svg>
  );
}

export function Package({ width = defaultSize, height = defaultSize, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      width={width}
      height={height}
      className={className}
    >
      {/* Box body */}
      <path d="M12 2L4 6v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6l-8-4z" />
      {/* Top flaps */}
      <path d="M4 6l8-4 8 4" strokeWidth="1" stroke="var(--bg)" />
    </svg>
  );
}

export function ShoppingCart({ width = defaultSize, height = defaultSize, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      width={width}
      height={height}
      className={className}
    >
      {/* Cart body */}
      <path d="M7 4V3h10v1h5v2H4V4h3zm0 4v8h10V8H7zm2 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
    </svg>
  );
}

export function FileText({ width = defaultSize, height = defaultSize, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      width={width}
      height={height}
      className={className}
    >
      {/* Document outline */}
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-8-6z" />
      {/* Text lines */}
      <line x1="8" y1="9" x2="16" y2="9" stroke="var(--bg)" strokeWidth="1.5" />
      <line x1="8" y1="13" x2="16" y2="13" stroke="var(--bg)" strokeWidth="1.5" />
      <line x1="8" y1="17" x2="13" y2="17" stroke="var(--bg)" strokeWidth="1.5" />
    </svg>
  );
}

export function BarChart2({ width = defaultSize, height = defaultSize, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      width={width}
      height={height}
      className={className}
    >
      {/* Baseline */}
      <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="1.5" />
      {/* Three bars of increasing height */}
      <rect x="6" y="14" width="3" height="6" fill="currentColor" />
      <rect x="10.5" y="9" width="3" height="11" fill="currentColor" />
      <rect x="15" y="4" width="3" height="16" fill="currentColor" />
    </svg>
  );
}
