export const LONDON = "Europe/London";
export const HOUR = 60 * 60 * 1000;

const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const hourOnly = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, hour: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, weekday: "short", day: "numeric", month: "short" });
const dayNum = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, day: "numeric" });
const stampFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const num = (v, digits) =>
  Number(v).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const mw = (v, digits = 0) => (v == null ? "–" : num(v, digits));
export const signedMw = (v) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), 0)}`);
export const pct = (v, digits = 1) => (v == null ? "–" : `${num(v, digits)}%`);
export const leadHours = (v) => (v == null ? "–" : `${num(v, 1)} h`);
export const kilo = (v) => `${num(v / 1000, 0)}k`;

export const hhmm = (ms) => hourFmt.format(new Date(ms));
export const hourLabel = (ms) => `${hourOnly.format(new Date(ms))}:00`;
export const stamp = (ms) => stampFmt.format(new Date(ms));
export const dayLabel = (isoDate) => dayFmt.format(new Date(`${isoDate}T12:00:00Z`));
export const dayOfMonth = (isoDate) => dayNum.format(new Date(`${isoDate}T12:00:00Z`));
export const ms = (iso) => new Date(iso).getTime();

/** Every point on the hour whose London clock reads a multiple of `every`, inside [from, to). */
export function hourMarks(from, to, every = 3) {
  const marks = [];
  for (let t = from; t < to; t += HOUR) {
    if (Number(hourOnly.format(new Date(t))) % every === 0) marks.push(t);
  }
  return marks;
}

/** Round axis steps of 1, 2 or 5 times a power of ten. */
export function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const step = (scaled < 1.5 ? 1 : scaled < 3 ? 2 : scaled < 7 ? 5 : 10) * magnitude;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1000; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}
