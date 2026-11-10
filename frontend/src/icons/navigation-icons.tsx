import type { IconProps } from ".";

function Base({ children, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

export function ChartBarIcon(props: IconProps) {
  return <Base {...props}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Base>;
}
export function BriefcaseIcon(props: IconProps) {
  return <Base {...props}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></Base>;
}
export function DocumentTextIcon(props: IconProps) {
  return <Base {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></Base>;
}
export function MegaphoneIcon(props: IconProps) {
  return <Base {...props}><path d="M3 11v2a1 1 0 0 0 1 1h3l9 5V5L7 10H4a1 1 0 0 0-1 1ZM19 9a4 4 0 0 1 0 6M7 14l1 5h2l-1-4" /></Base>;
}
