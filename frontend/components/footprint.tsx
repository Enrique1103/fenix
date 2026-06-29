export function Footprint({ size = 20, color = "#ef4444", className = "", mirror = false }: {
  size?: number; color?: string; className?: string; mirror?: boolean
}) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.6)}
      viewBox="0 0 52 82"
      style={{ display: "block", ...(mirror ? { transform: "scaleX(-1)" } : {}) }}
      className={className}
    >
      {/* Main sole — arch on left (right-foot silhouette) */}
      <path
        fill={color}
        d="
          M 26 78
          C 14 80  7 70  9 56
          C 11 42 13 30 11 20
          C  9 10 14  4 22  4
          C 30  4 40  8 42 20
          C 44 32 42 44 44 56
          C 46 70 40 80 26 78 Z
        "
      />
      {/* Toes — big toe left, pinky right */}
      <ellipse fill={color} cx="10" cy="5"  rx="7"   ry="8.5"/>
      <ellipse fill={color} cx="22" cy="0"  rx="6.5" ry="7.5"/>
      <ellipse fill={color} cx="33" cy="0"  rx="6"   ry="7"/>
      <ellipse fill={color} cx="43" cy="4"  rx="5.5" ry="6.5"/>
      <ellipse fill={color} cx="50" cy="13" rx="5"   ry="6"/>
    </svg>
  )
}
