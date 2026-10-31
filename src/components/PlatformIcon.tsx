import { platformName } from '../lib/devices';

/** Small line icon for the computer's operating system. */
export function PlatformIcon({ platform }: { platform: string }) {
  const label = platformName(platform);
  return (
    <svg
      className="platform-icon"
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      width="28"
      height="28"
    >
      <title>{label}</title>
      {platform === 'win32' ? (
        <g fill="currentColor">
          <rect x="3" y="3" width="8.5" height="8.5" rx="1" />
          <rect x="12.5" y="3" width="8.5" height="8.5" rx="1" />
          <rect x="3" y="12.5" width="8.5" height="8.5" rx="1" />
          <rect x="12.5" y="12.5" width="8.5" height="8.5" rx="1" />
        </g>
      ) : platform === 'darwin' ? (
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="4" y="5" width="16" height="11" rx="1.5" />
          <path d="M2 19h20" />
        </g>
      ) : platform === 'linux' ? (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 10l3 2.5L7 15M12 15h5" />
        </g>
      ) : (
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M9 20h6M12 16v4" />
        </g>
      )}
    </svg>
  );
}
