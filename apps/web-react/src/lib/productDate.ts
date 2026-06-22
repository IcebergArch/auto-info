const PRODUCT_TIME_ZONE = "Asia/Shanghai";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PRODUCT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function parts(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Object.fromEntries(
    DATE_FORMATTER.formatToParts(d)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as { year?: string; month?: string; day?: string };
}

export function productDateKey(value: string | Date) {
  if (!value) return "";
  const p = parts(value);
  return p?.year && p.month && p.day ? `${p.year}-${p.month}-${p.day}` : "";
}

export function todayProductKey() {
  return productDateKey(new Date());
}

export function currentProductMonthKey() {
  return todayProductKey().slice(0, 7);
}
