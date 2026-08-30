import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </IconBase>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </IconBase>
  );
}

export function AgentIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="6" y="8" width="12" height="9" rx="2" />
      <path d="M12 4v4M9 12h.01M15 12h.01M9 20v-3M15 20v-3M4 11h2M18 11h2" />
      <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function HashIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 3 8 21M16 3l-2 18M4 9h16M3 15h16" />
    </IconBase>
  );
}

export function AskIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.7 9a2.5 2.5 0 0 1 4.8 1c0 1.8-2.5 2-2.5 3.6M12 17h.01" />
    </IconBase>
  );
}

export function FindingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 17l-5-9V3" />
      <path d="M8 15h8M10 12h4" />
    </IconBase>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.2 9.2 0 0 1-4-.9L3 21l1.7-4.3A8.2 8.2 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.5 8.4 8.4 0 0 1 9 8.5Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </IconBase>
  );
}

export function OriginsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 7 9 5v10l-9-5V7ZM21 7l-9 5v10l9-5V7Z" />
      <path d="m8.5 9.7 7-4" />
    </IconBase>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v5h5M9 12h6M9 16h6" />
    </IconBase>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="8" y="8" width="11" height="11" rx="1.5" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 5 14 14M19 5 5 19" />
    </IconBase>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
      <path d="m9 12 2 2 4-5" />
    </IconBase>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </IconBase>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </IconBase>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </IconBase>
  );
}
