export default function Logo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="rq-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a5a3d" />
          <stop offset="1" stopColor="#13291d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#rq-logo-bg)" />
      <path d="M9 47 24 23l9 13 6-8 16 19Z" fill="#b9874f" />
      <path d="m24 23 9 13-5 7-11-6Z" fill="#e0bb85" />
      <path d="M9 47h46" stroke="#e0bb85" strokeOpacity=".5" strokeWidth="1.5" />
    </svg>
  );
}
