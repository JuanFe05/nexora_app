import type { IconProps } from ".";

export function GearIcon(props: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 20 20" fill="none" {...props}>
      <path d="m8 2-.5 2-1.5.9-2-.5-2 3.2L3.5 9v2L2 12.4l2 3.2 2-.5 1.5.9.5 2h4l.5-2 1.5-.9 2 .5 2-3.2-1.5-1.4V9L18 7.6l-2-3.2-2 .5-1.5-.9-.5-2H8Z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={10} cy={10} r={3} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
