import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function icon(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SidebarIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <rect x="7" y="7" width="10" height="10" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <rect x="8.5" y="8.5" width="10" height="10" rx="1.5" />
      <path d="M15.5 8.5V6.8A1.8 1.8 0 0 0 13.7 5H6.8A1.8 1.8 0 0 0 5 6.8v6.9A1.8 1.8 0 0 0 6.8 15.5H8.5" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" />
      <path d="M20 5v5h-5" />
    </svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <path d="M7 10l5 5 5-5" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <path d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <path d="M4 8.2A1.7 1.7 0 0 1 5.7 6.5h4.1L12 8.5h6.3A1.7 1.7 0 0 1 20 10.2v7.3A1.7 1.7 0 0 1 18.3 19.2H5.7A1.7 1.7 0 0 1 4 17.5V8.2z" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...icon(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4.5v1.6M12 17.9v1.6M4.5 12h1.6M17.9 12h1.6M6.4 6.4l1.1 1.1M16.5 16.5l1.1 1.1M17.6 6.4l-1.1 1.1M7.5 16.5l-1.1 1.1" />
    </svg>
  );
}

export function MarkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect width="24" height="24" rx="6" fill="currentColor" opacity="0.12" />
      <path
        d="M8 8.2h8M8 12h4.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16.2" cy="15.7" r="1.35" fill="currentColor" />
    </svg>
  );
}
