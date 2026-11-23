/** Send Store-local wall-clock values without converting through the device timezone. */
export function collectionExtensionLocalTime(date: string | undefined, time: string): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return undefined;
  return `${date}T${time}:00`;
}
