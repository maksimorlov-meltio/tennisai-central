// Calendar export (.ics). See ./icalendar.ts for the format notes.
export {
  buildIcs,
  escapeText,
  foldLine,
  octetLength,
  formatUtcDate,
  formatUtcDateTime,
  isAllDayRange,
  icsStatus,
} from "./icalendar";
export type { IcsEventInput, BuildIcsOptions } from "./icalendar";

export { periodRange, eventsInRange, icsFileName } from "./scope";
export type { IcsPeriod, IcsRange } from "./scope";

export { downloadTextFile } from "./download";
