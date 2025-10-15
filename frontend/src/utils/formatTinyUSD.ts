// utils/formatTinyUSD.ts
import { JSX } from "react";

/**
 * Formats very small USD values into a compact, readable form.
 * 
 * Examples:
 * - 0.012345678 → $0.01234568
 * - 0.000000123456 → $0.0⁶123456
 * - 1.2345 → $1.23450000
 */
export const formatTinyUSD = (value: number): JSX.Element | string => {
  if (value >= 0.01) {
    return `$${value.toFixed(8)}`;
  }

  const str = value.toString();
  const decimalPart = str.split(".")[1] || "";
  const match = decimalPart.match(/^(0*)(\d+)/);

  if (!match) {
    return `$${value.toFixed(8)}`;
  }

  const zeroCount = match[1].length;
  const significantDigits = match[2].slice(0, 6);

  return (
    <span className="tiny-usd">
      $0.0<sup>{zeroCount}</sup>
      {significantDigits}
    </span>
  );
};
