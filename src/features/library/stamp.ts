/**
 * Absolute timestamps for the thread — "12 APR · 09:14". Relative time
 * ("3 months ago") collapses the exact thing the demo is selling: a place's
 * history spread over months. Always absolute, always mono at reduced opacity.
 */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  const mon = MONTHS[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} · ${hh}:${mm}`;
}
