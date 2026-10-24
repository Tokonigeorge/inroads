import "server-only";
import { getCountries } from "libphonenumber-js/max";

const countryNames = new Intl.DisplayNames(["en-GB"], { type: "region" });

/** Countries for reading local phone numbers, by English name. */
export const countries = getCountries()
  .map((code) => ({ code, name: countryNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

const allZones = Intl.supportedValuesOf("timeZone");

/** Every IANA zone, plus the one saved if this runtime doesn't list it. */
export const timezonesWith = (current: string) => (allZones.includes(current) ? allZones : [current, ...allZones]);
