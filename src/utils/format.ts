/**
 * Format number with thousand separators
 */
export function formatThousands(num: number, fixed = 0): string {
    if (typeof num !== "number" || isNaN(num)) return "0";
    return num.toFixed(fixed).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format compact number (e.g., 1.2k, 1.5w)
 */
export function formatCompact(num: number): string {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + "万";
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + "k";
    }
    return num.toFixed(0);
}

/**
 * Normalize balance to avoid -0 display
 */
export function normalizeBalance(balance: number): number {
    return Math.abs(balance) < 0.000001 ? 0 : balance;
}
