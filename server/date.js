/**
 * Calendar dates on the wire.
 */

/**
 * A DATE column as the API exposes it: a plain calendar date, 'YYYY-MM-DD'.
 *
 * pg parses DATE into a JS Date at local midnight, and res.json writes that out
 * as a UTC timestamp — '2026-08-29T10:00:00.000Z'. The client stores and
 * formats plain calendar dates, so that string reached Game History as a date
 * it could not parse and rendered as "Invalid Date"; on a server east of UTC
 * the day was wrong too, local midnight falling on the day before in UTC.
 *
 * The Date branch reads local getters on purpose: local midnight is the clock
 * pg built the value on, so they give back the stored date exactly.
 */
export function toDateOnly(value) {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${value.getFullYear()}-${month}-${day}`;
    }

    const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
    return match ? match[1] : String(value);
}
