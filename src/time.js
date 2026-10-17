// -----------------------------------------------------------------------------
// Dates and times.
//
// Carbu.com dates a price by its day only ("17/10/26"). The age of a price is
// counted in days from the local date of the Gladys instance, whose timezone
// the supervisor injects as TZ (Brussels, Paris or Luxembourg time).
// -----------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/**
 * @description The timezone of the instance.
 * @returns {string|undefined} An IANA name, undefined for the system one.
 */
function defaultTimeZone() {
  return process.env.TZ || undefined;
}

/**
 * @description The local date and time of an instant in a timezone.
 * @param {number} instant - The instant, in ms.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {{ date: string, minutes: number }} `YYYY-MM-DD` and minutes since midnight.
 * @example
 * localClock(Date.parse('2026-10-17T12:00:00Z'), 'Europe/Brussels'); // 2026-10-17, 840
 */
function localClock(instant, timeZone = defaultTimeZone()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * @description "07:42", in the timezone of the instance.
 * @param {number|null} instant - The instant, in ms.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {string} The time, '' when none.
 */
function formatTime(instant, timeZone = defaultTimeZone()) {
  if (!Number.isFinite(instant)) {
    return '';
  }
  const { minutes } = localClock(instant, timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * @description Days from one date to another.
 * @param {string} from - `YYYY-MM-DD`.
 * @param {string} to - `YYYY-MM-DD`.
 * @returns {number|null} Whole days (negative when `to` is before), null when
 * a date is missing.
 * @example
 * daysBetween('2026-10-15', '2026-10-17'); // -> 2
 */
function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / DAY_MS) : null;
}

/**
 * @description A short date: "17/10".
 * @param {string|null} date - `YYYY-MM-DD`.
 * @returns {string} The day and month, '' when none.
 */
function shortDate(date) {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  return match ? `${match[2]}/${match[1]}` : '';
}

/**
 * @description A full date: "17/10/2026".
 * @param {string|null} date - `YYYY-MM-DD`.
 * @returns {string} The date, '' when none.
 */
function fullDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

export {
  MINUTE_MS,
  DAY_MS,
  defaultTimeZone,
  localClock,
  formatTime,
  daysBetween,
  shortDate,
  fullDate,
};
