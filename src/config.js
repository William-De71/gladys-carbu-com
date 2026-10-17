// -----------------------------------------------------------------------------
// Configuration of the Carbu.com integration.
//
// Fields of the config_schema:
//   - `country`      BE, FR or LU;
//   - `postal_code`  the postal code of the area ("4000", "71100", "1009");
//   - `town`         the locality, when the postal code covers several
//                    ("Rocourt" for 4000); empty: the main one;
//   - `fuels`        the followed fuels (multi_select, four at most: one page
//                    of Carbu.com is read per fuel and reading);
//   - `radius`       kilometres from the centre of the locality;
//   - `max_age`      days a price stays valid (French prices can be years old);
//   - `stations`     how many stations the Discovery screen offers, the
//                    cheapest of each fuel; 0 for none;
//   - `interval`     minutes between two readings;
//   - `language`     language of the texts Gladys does not ask for in a
//                    language (device and feature names): `auto` follows the
//                    last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`   language of the last widget request.
// -----------------------------------------------------------------------------

import { COUNTRIES, FUEL_KEYS } from './fuels.js';
import { isLanguage } from './i18n.js';

const MAX_FUELS = 4;
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
const DEFAULT_COUNTRY = 'BE';
const DEFAULT_FUELS = ['diesel_b7'];
const RADII = [2, 5, 10, 15, 20, 30];
const DEFAULT_RADIUS = 10;
const MAX_AGES = [1, 2, 3, 7, 14, 30];
const DEFAULT_MAX_AGE = 7;
const STATION_COUNTS = [0, 3, 5, 10, 20];
const DEFAULT_STATION_COUNT = 5;
const INTERVALS = [30, 60, 120, 240];
const DEFAULT_INTERVAL = 60;

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description Read a value among allowed numbers.
 * @param {unknown} raw - The raw value ("10", 10).
 * @param {number[]} allowed - The allowed values.
 * @param {number} fallback - The default.
 * @returns {number} The value.
 */
function readChoice(raw, allowed, fallback) {
  const value = Number(raw);
  return raw !== '' && raw !== null && allowed.includes(value) ? value : fallback;
}

/**
 * @description Read the followed fuels.
 * @param {unknown} raw - An array (multi_select), a JSON array or "a, b".
 * @returns {string[]} Known fuel keys, without duplicates, four at most; the
 * default when none is valid.
 * @example
 * readFuels(['lpg', 'nope', 'lpg']); // -> ['lpg']
 */
function readFuels(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(/[,;\s]+/);
    }
  }
  const fuels = [
    ...new Set((Array.isArray(list) ? list : []).map((value) => String(value).trim())),
  ].filter((value) => FUEL_KEYS.includes(value));
  return fuels.length ? fuels.slice(0, MAX_FUELS) : [...DEFAULT_FUELS];
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ country, postalCode, town, fuels, radius, maxAge,
 * stationCount, interval, language }`.
 * @example
 * normalizeConfig({ country: 'BE', postal_code: ' 4000 ', fuels: ['lpg'] });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const country = readString(config.country).toUpperCase();
  return {
    country: COUNTRIES.includes(country) ? country : DEFAULT_COUNTRY,
    postalCode: readString(config.postal_code).replace(/^L-/i, '').replace(/\s+/g, ''),
    town: readString(config.town),
    fuels: readFuels(config.fuels),
    radius: readChoice(config.radius, RADII, DEFAULT_RADIUS),
    maxAge: readChoice(config.max_age, MAX_AGES, DEFAULT_MAX_AGE),
    stationCount: readChoice(config.stations, STATION_COUNTS, DEFAULT_STATION_COUNT),
    interval: readChoice(config.interval, INTERVALS, DEFAULT_INTERVAL),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  MAX_FUELS,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  DEFAULT_COUNTRY,
  DEFAULT_FUELS,
  RADII,
  DEFAULT_RADIUS,
  MAX_AGES,
  DEFAULT_MAX_AGE,
  STATION_COUNTS,
  DEFAULT_STATION_COUNT,
  INTERVALS,
  DEFAULT_INTERVAL,
  readChoice,
  readFuels,
  normalizeConfig,
  readLanguage,
};
