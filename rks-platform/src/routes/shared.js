// Hulpjes die meerdere routebestanden delen.
import { weekDays, parseHours, clean, hours, weekNumber } from '../util.js';
import { TimesheetError } from '../domain/timesheets.js';
import { InvoiceError } from '../domain/invoices.js';

export const baseUrl = (req) => (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

// Leest het urenformulier uit. Geeft { items } of { error }.
export function parseHoursForm(body, week) {
  const items = [];
  for (const datum of weekDays(week)) {
    const minuten = parseHours(body[`uren_${datum}`]);
    if (minuten === null) return { error: `Het aantal uren op ${datum} klopt niet. Gebruik bijvoorbeeld 8 of 7,75.` };
    items.push({ datum, minuten, omschrijving: clean(body[`note_${datum}`], 200) });
  }
  return { items };
}

export const approvalText = (sheet) =>
  `Hallo${sheet.goedkeurder_naam ? ` ${sheet.goedkeurder_naam}` : ''}, wil je de uren van ${sheet.zzp_naam} goedkeuren? ` +
  `Week ${weekNumber(sheet.week)}, project ${sheet.project_naam}: ${hours(sheet.minuten)} uur.`;

// Voert een actie uit en toont verwachte fouten (validatie, domeinregels) als melding.
export class FormError extends Error {}
export function attempt(fn, onError) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof TimesheetError || err instanceof InvoiceError || err instanceof FormError) return onError(err.message);
    throw err;
  }
}
