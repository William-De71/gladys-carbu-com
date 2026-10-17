// -----------------------------------------------------------------------------
// HTTP client of Carbu.com (https://carbu.com), the fuel price comparator of
// Belgium, France and Luxembourg run by Fuel Media Service.
//
// Carbu.com has no public API and asks for no account: the integration reads
// the pages a visitor reads (see parse.js), gently — one station list per
// followed fuel and one official price table per reading (every hour by
// default), with a User-Agent that names the integration. The pages are
// gzip-compressed (about 55 KB for a list of 100 stations).
//
// Pages read:
//   commonFunctions/getlocation/controller.getlocation_JSON.php?location=<pc>&SHRT=1
//   <country>/liste-stations-service/<fuel code>/<town>/<postal code>/<area id>
//   <country>/prixmaximum                     (BE: maximum prices, LU: official)
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { COUNTRY_PATHS, FUELS } from './fuels.js';
import { parseLocations, parseStations, parseOfficial } from './parse.js';

const BASE_URL = process.env.CARBU_BASE_URL || 'https://carbu.com';
const TIMEOUT_MS = 30000;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const USER_AGENT = `gladys-carbu-com/${version} (+https://github.com/William-De71/gladys-carbu-com)`;

class CarbuError extends Error {
  /**
   * @param {string} kind - `unreachable`, `blocked` (403, 429) or `invalid`.
   * @param {string} message - The detail.
   * @param {object} [extra] - `{ status }`.
   */
  constructor(kind, message, { status = null } = {}) {
    super(message);
    this.name = 'CarbuError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description A client of Carbu.com.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - The fetch function (tests).
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {string} [options.baseUrl] - The site root (tests).
 * @returns {object} The methods, and `requests` for the diagnostic.
 */
function createCarbuClient({
  fetch: fetchFn = globalThis.fetch,
  now = () => Date.now(),
  baseUrl = BASE_URL,
} = {}) {
  // Requests made, per page kind, and the last failure, for the diagnostic.
  const requests = { total: 0, byKind: {}, failed: 0, last: null, lastError: null };

  /**
   * @description Read a page.
   * @param {string} kind - For the diagnostic ("stations").
   * @param {string} path - The path, from the root.
   * @returns {Promise<string>} The body.
   */
  async function get(kind, path) {
    requests.total += 1;
    requests.byKind[kind] = (requests.byKind[kind] ?? 0) + 1;
    requests.last = now();
    let response;
    try {
      response = await fetchFn(`${baseUrl}/${path}`, {
        headers: {
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'fr',
          'user-agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      requests.failed += 1;
      requests.lastError = err.cause?.code ?? err.message;
      throw new CarbuError('unreachable', String(requests.lastError));
    }
    if (!response.ok) {
      requests.failed += 1;
      requests.lastError = `HTTP ${response.status}`;
      throw new CarbuError(
        response.status === 403 || response.status === 429 ? 'blocked' : 'unreachable',
        `HTTP ${response.status}`,
        { status: response.status },
      );
    }
    return response.text();
  }

  return {
    requests,
    /**
     * @description The localities of a postal code.
     * @param {string} postalCode - "4000".
     * @param {string} country - BE, FR or LU.
     * @returns {Promise<object[]>} parseLocations(), of that country and code only.
     */
    async locations(postalCode, country) {
      const query = new URLSearchParams({ location: postalCode, SHRT: '1' });
      const body = await get(
        'locations',
        `commonFunctions/getlocation/controller.getlocation_JSON.php?${query}`,
      );
      try {
        return parseLocations(body).filter(
          (location) => location.country === country && location.postalCode === postalCode,
        );
      } catch (err) {
        throw new CarbuError('invalid', err.message);
      }
    },
    /**
     * @description The stations selling a fuel around a locality.
     * @param {object} location - `{ id, name, postalCode, country }`.
     * @param {string} fuel - A fuel key, available in the country.
     * @returns {Promise<object[]>} parseStations().
     */
    async stations(location, fuel) {
      const code = FUELS[fuel]?.codes[location.country];
      if (!code) {
        throw new CarbuError('invalid', `${fuel} is not listed in ${location.country}`);
      }
      const town = encodeURIComponent(location.name || 'x');
      const html = await get(
        'stations',
        `${COUNTRY_PATHS[location.country]}/liste-stations-service/${code}/${town}/${encodeURIComponent(location.postalCode)}/${encodeURIComponent(location.id)}`,
      );
      if (/station-content/.test(html)) {
        return parseStations(html, location.country);
      }
      // "Nous n'avons trouvé aucune station délivrant ce carburant…"
      if (/aucune station/i.test(html)) {
        return [];
      }
      throw new CarbuError('invalid', 'not a station list');
    },
    /**
     * @description The official prices of a country.
     * @param {string} country - BE or LU.
     * @returns {Promise<object>} parseOfficial().
     */
    async official(country) {
      const html = await get('official', `${COUNTRY_PATHS[country]}/prixmaximum`);
      const table = parseOfficial(html, country);
      if (!table) {
        throw new CarbuError('invalid', 'no official price table');
      }
      return table;
    },
  };
}

export { BASE_URL, USER_AGENT, CarbuError, createCarbuClient };
