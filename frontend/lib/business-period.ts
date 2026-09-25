export interface BusinessDateRange {
  from: string;
  to: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

export function localDateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function currentBusinessPeriodStart(date = new Date(), cycleDay = 10) {
  const start = new Date(date.getFullYear(), date.getMonth(), cycleDay, 12);
  if (date.getDate() < cycleDay) start.setMonth(start.getMonth() - 1);
  return start;
}

export function currentBusinessRange(date = new Date(), cycleDay = 10): BusinessDateRange {
  return {
    from: localDateInput(currentBusinessPeriodStart(date, cycleDay)),
    to: localDateInput(date),
  };
}

export function previousBusinessRange(date = new Date(), cycleDay = 10): BusinessDateRange {
  const currentStart = currentBusinessPeriodStart(date, cycleDay);
  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(currentStart);
  previousStart.setMonth(previousStart.getMonth() - 1);
  return { from: localDateInput(previousStart), to: localDateInput(previousEnd) };
}

export function timestampBounds(range: BusinessDateRange) {
  const start = parseLocalDate(range.from);
  start.setHours(0, 0, 0, 0);
  const endExclusive = parseLocalDate(range.to);
  endExclusive.setHours(0, 0, 0, 0);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { from: start.toISOString(), toExclusive: endExclusive.toISOString() };
}
