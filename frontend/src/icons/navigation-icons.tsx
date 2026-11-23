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
/** Receipt with line items: invoicing (Facturación General). */
export function ReceiptIcon(props: IconProps) {
  return <Base {...props}><path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1Z" /><path d="M9 8h6M9 12h6M9 16h3" /></Base>;
}
/** Shopping cart: consumption (Consumo General). */
export function CartIcon(props: IconProps) {
  return <Base {...props}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 7H6" /></Base>;
}
/** Heartbeat line: epidemiological surveillance (SIVIGILA). */
export function PulseIcon(props: IconProps) {
  return <Base {...props}><path d="M3 12h4l3-8 4 16 3-8h4" /></Base>;
}
export function MegaphoneIcon(props: IconProps) {
  return <Base {...props}><path d="M3 11v2a1 1 0 0 0 1 1h3l9 5V5L7 10H4a1 1 0 0 0-1 1ZM19 9a4 4 0 0 1 0 6M7 14l1 5h2l-1-4" /></Base>;
}
