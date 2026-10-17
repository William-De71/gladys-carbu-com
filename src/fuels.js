// -----------------------------------------------------------------------------
// The fuels Carbu.com compares, per country.
//
// Each fuel has a key of ours (stored by Gladys in the configuration, the
// feature external ids and the scenes: never renamed) and, per country, the
// code of the Carbu.com station list (`/liste-stations-service/<code>/…`).
// A list sometimes mixes two grades of the same family: the French "E10" and
// "SP95" lists both hold Sans Plomb 95 E5 and E10 stations, each item naming
// its own grade (`data-fuelname`). `require` / `exclude` keep the right one.
//
// Codes read on the selectors of carbu.com on 2026-10-17:
//   BE  E10 SP98 E10_98 GO DB10 DXTL GPL CNG GO_plus
//   FR  E10 SP95 SP98 E10_98 GO GPL CNG E85   (GO_plus / DB10: no price)
//   LU  SP95 SP98 E10_98 GO DB10 GPL CNG GO_plus
// -----------------------------------------------------------------------------

const COUNTRIES = ['BE', 'FR', 'LU'];

// Path of the country on carbu.com (French pages: the names of fuels and
// localities are parsed in French).
const COUNTRY_PATHS = { BE: 'belgique', FR: 'france', LU: 'luxembourg' };

const FUELS = {
  sp95_e10: {
    label: 'Super 95 (E10)',
    codes: { BE: 'E10', FR: 'E10' },
    require: /E10/i,
  },
  sp95_e5: {
    label: 'Super 95 (E5)',
    codes: { FR: 'SP95', LU: 'SP95' },
    exclude: /E10/i,
  },
  sp98_e5: {
    label: 'Super 98 (E5)',
    codes: { BE: 'SP98', FR: 'SP98', LU: 'SP98' },
    exclude: /E10/i,
  },
  sp98_e10: {
    label: 'Super 98 (E10)',
    codes: { BE: 'E10_98', FR: 'E10_98', LU: 'E10_98' },
  },
  diesel_b7: {
    label: 'Diesel (B7)',
    codes: { BE: 'GO', FR: 'GO', LU: 'GO' },
  },
  diesel_b10: {
    label: 'Diesel (B10)',
    codes: { BE: 'DB10', LU: 'DB10' },
  },
  diesel_xtl: {
    label: 'Diesel XTL / HVO',
    codes: { BE: 'DXTL' },
  },
  diesel_plus: {
    label: 'Diesel+',
    codes: { BE: 'GO_plus', LU: 'GO_plus' },
  },
  lpg: {
    label: 'LPG',
    codes: { BE: 'GPL', FR: 'GPL', LU: 'GPL' },
  },
  cng: {
    label: 'CNG',
    codes: { BE: 'CNG', FR: 'CNG', LU: 'CNG' },
  },
  e85: {
    label: 'E85',
    codes: { FR: 'E85' },
  },
};

const FUEL_KEYS = Object.keys(FUELS);

// The rows of the official price tables (carbu.com/<country>/prixmaximum), by
// their label folded: the Belgian maximum prices and the Luxembourg official
// prices. Dutch pages use the same labels.
const OFFICIAL_ROWS = {
  BE: {
    'super 95 e10': 'sp95_e10',
    'super 98 e5': 'sp98_e5',
    'super 98 e10': 'sp98_e10',
    'diesel b7': 'diesel_b7',
    'diesel b10': 'diesel_b10',
    'diesel xtl hvo': 'diesel_xtl',
    'diesel xtl': 'diesel_xtl',
    lpg: 'lpg',
  },
  LU: {
    diesel: 'diesel_b7',
    'super 95': 'sp95_e5',
    'super 98': 'sp98_e5',
    lpg: 'lpg',
  },
};

/**
 * @description Whether Carbu.com lists a fuel in a country.
 * @param {string} fuel - A fuel key.
 * @param {string} country - BE, FR or LU.
 * @returns {boolean} True when a station list exists.
 * @example
 * fuelAvailable('e85', 'BE'); // -> false
 */
const fuelAvailable = (fuel, country) => Boolean(FUELS[fuel]?.codes[country]);

/**
 * @description Whether an item of a list is of the wanted grade.
 * @param {string} fuel - A fuel key.
 * @param {string} fuelName - The `data-fuelname` of the item ("Sans Plomb 95 (E5)").
 * @returns {boolean} True when it is.
 * @example
 * gradeMatches('sp95_e10', 'Sans Plomb 95 (E5)'); // -> false
 */
function gradeMatches(fuel, fuelName) {
  const entry = FUELS[fuel];
  const name = String(fuelName ?? '');
  if (!entry) {
    return false;
  }
  if (entry.require && !entry.require.test(name)) {
    return false;
  }
  return !(entry.exclude && entry.exclude.test(name));
}

/**
 * @description The fuels Carbu.com publishes official prices for, in a country.
 * @param {string} country - BE, FR or LU.
 * @returns {string[]} Fuel keys (none in France).
 */
const officialFuels = (country) => [...new Set(Object.values(OFFICIAL_ROWS[country] ?? {}))];

export {
  COUNTRIES,
  COUNTRY_PATHS,
  FUELS,
  FUEL_KEYS,
  OFFICIAL_ROWS,
  fuelAvailable,
  gradeMatches,
  officialFuels,
};
