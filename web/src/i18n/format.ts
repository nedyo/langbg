// Kept apart from the dictionary on purpose: the browser script imports this and must not pull in
// every string of both languages with it.

/** Fills {placeholders}: format("Hi {name}", { name: "x" }). Unknown placeholders stay as they are. */
export function format(template: string, values: object = {}): string {
  const lookup = values as Record<string, unknown>;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in lookup ? String(lookup[key]) : whole));
}
