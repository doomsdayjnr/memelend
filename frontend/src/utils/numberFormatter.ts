// numberFormatter.ts
export function formatLargeNumber(value: number | string): string {
    if (typeof value === 'string') value = parseFloat(value);
    if (isNaN(value)) return '0';

    const absValue = Math.abs(value);

    if (absValue >= 1_000_000_000) {
        return (value / 1_000_000_000).toFixed(2) + 'B';
    } else if (absValue >= 1_000_000) {
        return (value / 1_000_000).toFixed(2) + 'M';
    } else if (absValue >= 1_000) {
        return (value / 1_000).toFixed(2) + 'K';
    } else {
        return value.toString();
    }
}
