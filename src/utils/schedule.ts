/**
 * Schedule & Price Margin Calculation Utilities
 */

import { toPersianDigits, formatPersianNumber } from './jalali.ts';

// Fixed 3-hour refresh schedule hours in local time
export const FIXED_SCHEDULE_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

/**
 * Returns the timestamp and info of the next scheduled refresh time.
 */
export function getNextScheduledRefresh(now: Date = new Date()): {
  targetDate: Date;
  targetHour: number;
  remainingMinutes: number;
  remainingSeconds: number;
  formattedTargetTime: string;
} {
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();

  // Find the next scheduled hour
  let nextHour = FIXED_SCHEDULE_HOURS.find(
    (h) => h > currentHour || (h === currentHour && currentMinute === 0 && currentSecond === 0)
  );

  const targetDate = new Date(now);
  if (nextHour === undefined) {
    // Next hour is 00:00 tomorrow
    nextHour = 0;
    targetDate.setDate(targetDate.getDate() + 1);
  }

  targetDate.setHours(nextHour, 0, 0, 0);

  const diffMs = targetDate.getTime() - now.getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const remainingMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  const hourStr = toPersianDigits(nextHour.toString().padStart(2, '0'));
  const formattedTargetTime = `ساعت ${hourStr}:۰۰`;

  return {
    targetDate,
    targetHour: nextHour,
    remainingMinutes,
    remainingSeconds,
    formattedTargetTime,
  };
}

/**
 * Calculate recommended customer price based on reference price, margin percentage, or fixed buffer.
 * Automatically rounds to the nearest 1,000 Tomans for consistent pricing across all storefronts.
 */
export function calculateCustomerPrice(
  referencePriceToman: number,
  marginPercent: number = 8,
  extraBufferToman: number = 0
): {
  customerPrice: number;
  marginAmount: number;
  roundedCustomerPrice: number;
  formattedPrice: string;
} {
  if (!Number.isFinite(referencePriceToman) || referencePriceToman <= 0) {
    return {
      customerPrice: 0,
      marginAmount: 0,
      roundedCustomerPrice: 0,
      formattedPrice: '۰ تومان',
    };
  }

  const safeMargin =
    Number.isFinite(marginPercent) && marginPercent >= 0 ? Math.min(500, marginPercent) : 8;
  const safeBuffer = Number.isFinite(extraBufferToman) ? extraBufferToman : 0;
  const rawCustomerPrice = referencePriceToman * (1 + safeMargin / 100) + safeBuffer;
  const marginAmount = Math.round(referencePriceToman * (safeMargin / 100)) + safeBuffer;
  const customerPrice = referencePriceToman + marginAmount;
  const rounded = Math.round(rawCustomerPrice / 1000) * 1000;

  return {
    customerPrice,
    marginAmount,
    roundedCustomerPrice: rounded,
    formattedPrice: `${formatPersianNumber(rounded)} تومان`,
  };
}

/**
 * Parses Digikala URL to extract product code (DKP)
 */
export function extractDigikalaProductCode(url: string): string | null {
  if (!url) return null;
  const match = url.match(/dkp[/-](\d+)/i);
  return match ? match[1] : null;
}
