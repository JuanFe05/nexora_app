import type { IconProps } from ".";

export function UserIcon(props: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx={10} cy={6} r={3} stroke="currentColor" strokeWidth={1.5} />
      <path d="M4 17v-1a6 6 0 0 1 12 0v1H4Z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
