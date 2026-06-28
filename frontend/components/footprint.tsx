export function Footprint({ size = 20, color = "#ef4444", className = "" }: {
  size?: number; color?: string; className?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className}>
      <path
        fill={color}
        d="M38 78c-3-10-8-16-8-30 0-16 8-26 18-26s14 10 14 24c0 16-6 24-9 32-2 6-12 6-15 0z
           M22 30c2-4 8-4 9 1 1 4-2 8-6 7-3-1-5-5-3-8z
           M34 18c2-3 7-2 8 2 1 4-3 7-6 6-3-1-4-5-2-8z
           M48 14c2-3 6-2 7 2 1 4-3 6-6 5-2-1-3-4-1-7z
           M62 18c2-3 6-1 6 3 0 3-3 5-6 4-2-1-2-5 0-7z"
      />
    </svg>
  )
}
