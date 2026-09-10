import type { SVGProps } from "react";

/** Compact lowercase b companion to the Bridge wordmark. */
export default function BridgeMark({ size = 32, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}><path d="M18 13V34" stroke="currentColor" strokeWidth="7"/><circle cx="31" cy="35" r="13" fill="none" stroke="currentColor" strokeWidth="7"/><circle cx="46" cy="16" r="4" fill="#DC7A46"/></svg>;
}
