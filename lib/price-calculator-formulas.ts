export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type YangoDriversBreakdown = {
  baseFee: number;
  km: number;
  mins: number;
  kmFirst10: number;
  kmAfter10: number;
  rate1: number;
  rate2: number;
  rate3: number;
  distanceFirst10Cost: number;
  distanceAfter10Cost: number;
  timeCost: number;
  total: number;
};

export type MoneBreakdown = {
  baseFee: number;
  km: number;
  mins: number;
  kmFirst10: number;
  kmAfter10: number;
  rateA: number;
  rateB: number;
  firstBlockUnits: number;
  firstBlockCost: number;
  secondBlockCost: number;
  total: number;
};

export const weekdayOptions: { key: WeekdayKey; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

export const BASE_FEE = 18.24;

export function parseTimeToMinutes(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function isNightYango(timeMinutes: number) {
  return timeMinutes >= 21 * 60 || timeMinutes <= 5 * 60 + 59;
}

export function isInRangeInclusive(value: number, from: number, to: number) {
  return value >= from && value <= to;
}

export function isInWrapRangeInclusive(value: number, from: number, to: number) {
  return value >= from || value <= to;
}

export function getYangoDriversRates(dayOfWeek: WeekdayKey, timeMinutes: number) {
  const isFriSat = dayOfWeek === "friday" || dayOfWeek === "saturday";
  const isNight = isNightYango(timeMinutes);
  if (isFriSat) {
    if (isNight) {
      return { rate1: 2.73, rate2: 4.57, rate3: 2.73 };
    }
    if (timeMinutes <= 15 * 60 + 59) {
      return { rate1: 1.95, rate2: 3.79, rate3: 1.95 };
    }
    return { rate1: 2.34, rate2: 4.18, rate3: 2.34 };
  }

  if (isNight) {
    return { rate1: 2.34, rate2: 4.18, rate3: 2.34 };
  }
  return { rate1: 1.95, rate2: 3.79, rate3: 1.95 };
}

export function getMoneRates(dayOfWeek: WeekdayKey, timeMinutes: number) {
  const isSunWed =
    dayOfWeek === "sunday" ||
    dayOfWeek === "monday" ||
    dayOfWeek === "tuesday" ||
    dayOfWeek === "wednesday";
  const isThuFri = dayOfWeek === "thursday" || dayOfWeek === "friday";
  const isSaturday = dayOfWeek === "saturday";

  if (isSunWed && isInRangeInclusive(timeMinutes, 6 * 60, 21 * 60)) {
    return { rateA: 1.95, rateB: 3.79 };
  }
  if (isSunWed && isInWrapRangeInclusive(timeMinutes, 21 * 60 + 1, 5 * 60 + 59)) {
    return { rateA: 2.34, rateB: 4.18 };
  }
  if (isThuFri && isInRangeInclusive(timeMinutes, 6 * 60, 16 * 60)) {
    return { rateA: 1.95, rateB: 3.79 };
  }
  if (isThuFri && isInRangeInclusive(timeMinutes, 16 * 60 + 1, 21 * 60)) {
    return { rateA: 2.34, rateB: 4.18 };
  }
  if (isThuFri && isInWrapRangeInclusive(timeMinutes, 21 * 60 + 1, 5 * 60 + 59)) {
    return { rateA: 2.73, rateB: 4.57 };
  }
  if (isSaturday && isInRangeInclusive(timeMinutes, 6 * 60, 19 * 60)) {
    return { rateA: 2.34, rateB: 4.18 };
  }
  if (isSaturday && isInWrapRangeInclusive(timeMinutes, 19 * 60 + 1, 5 * 60 + 59)) {
    return { rateA: 2.73, rateB: 4.57 };
  }
  return { rateA: 0, rateB: 0 };
}

export function calculateYangoDriversTariff(
  km: number,
  mins: number,
  dayOfWeek: WeekdayKey,
  timeMinutes: number,
): YangoDriversBreakdown {
  const { rate1, rate2, rate3 } = getYangoDriversRates(dayOfWeek, timeMinutes);
  const kmFirst10 = Math.min(km, 10);
  const kmAfter10 = Math.max(km - 10, 0);
  const distanceFirst10Cost = kmFirst10 * rate1;
  const distanceAfter10Cost = kmAfter10 * rate2;
  const timeCost = mins * rate3;
  return {
    baseFee: BASE_FEE,
    km,
    mins,
    kmFirst10,
    kmAfter10,
    rate1,
    rate2,
    rate3,
    distanceFirst10Cost,
    distanceAfter10Cost,
    timeCost,
    total: BASE_FEE + distanceFirst10Cost + distanceAfter10Cost + timeCost,
  };
}

export function calculateMoneTariff(
  km: number,
  mins: number,
  dayOfWeek: WeekdayKey,
  timeMinutes: number,
): MoneBreakdown {
  const { rateA, rateB } = getMoneRates(dayOfWeek, timeMinutes);
  const kmFirst10 = Math.min(km, 10);
  const kmAfter10 = Math.max(km - 10, 0);
  const firstBlockUnits = kmFirst10 + mins;
  const firstBlockCost = firstBlockUnits * rateA;
  const secondBlockCost = kmAfter10 * rateB;

  return {
    baseFee: BASE_FEE,
    km,
    mins,
    kmFirst10,
    kmAfter10,
    rateA,
    rateB,
    firstBlockUnits,
    firstBlockCost,
    secondBlockCost,
    total: BASE_FEE + firstBlockCost + secondBlockCost,
  };
}
