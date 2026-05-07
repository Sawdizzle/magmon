export default function MagmonLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer ring */}
      <ellipse cx="24" cy="24" rx="20" ry="8" stroke="#00c8dc" strokeWidth="1.5" strokeOpacity="0.7" />
      {/* Middle ring rotated */}
      <ellipse cx="24" cy="24" rx="20" ry="8" stroke="#00c8dc" strokeWidth="1.5" strokeOpacity="0.5"
        transform="rotate(60 24 24)" />
      {/* Inner ring rotated */}
      <ellipse cx="24" cy="24" rx="20" ry="8" stroke="#00c8dc" strokeWidth="1.5" strokeOpacity="0.35"
        transform="rotate(120 24 24)" />
      {/* Center dot */}
      <circle cx="24" cy="24" r="3.5" fill="#00c8dc" />
      {/* Orbiting dot */}
      <circle cx="44" cy="24" r="2.5" fill="#00c8dc" fillOpacity="0.9" />
    </svg>
  )
}
