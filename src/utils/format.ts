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

/**
 * Round to 2 decimal places to avoid floating-point drift.
 * e.g. roundCurrency(0.1 + 0.2) === 0.3
 */
export function roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Net amount after refund/discount, safely rounded.
 */
export function netAmount(amount: number, deduction: number = 0): number {
    return roundCurrency(amount - deduction);
}

/**
 * 获取本地日期字符串 (YYYY-MM-DD)
 * 使用本地时间而非 UTC，避免跨时区日期错误
 */
export function getLocalDateString(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * 获取本地时间字符串 (HH:MM)
 */
export function getLocalTimeString(date: Date = new Date()): string {
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${min}`;
}
