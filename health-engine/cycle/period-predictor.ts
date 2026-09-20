export function predictNextPeriod(lastStart?: Date, averageLength?: number) {
  if (!lastStart || !averageLength) return undefined;
  const date = new Date(lastStart);
  date.setUTCDate(date.getUTCDate() + averageLength);
  return date;
}
