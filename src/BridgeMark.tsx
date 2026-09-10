import type { SVGProps } from "react";

/** Two spans connected by a keystone: practical help meeting a family's need. */
export default function BridgeMark({ size = 32, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
    <path d="M7 49V35C7 21 15 11 27 9V19C21 21 17 27 17 35V49H7ZM57 49V35C57 21 49 11 37 9V19C43 21 47 27 47 35V49H57Z" fill="currentColor" />
    <rect x="28" y="8" width="8" height="12" rx="3" fill="#DC7A46" />
    <path d="M5 51H21M43 51H59" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <path d="M22 39H42" stroke="#DC7A46" strokeWidth="4" strokeLinecap="round" />
  </svg>;
}
