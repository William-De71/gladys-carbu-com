// A fake Carbu.com for the tests, served through the `fetch` option of the
// integration. Its pages are real ones, read on 2026-10-17 around 23:00
// (Brussels) and reduced to their station blocks or their official table:
// Diesel and Super 95 E10 around Liège (4000), Diesel around Luxembourg
// (1009), Sans Plomb 95 around Chalon-sur-Saône (71100, French prices of
// every age), the Belgian maximum prices of the day, the ones of 2026-04-21
// (a decrease announced, read on the Internet Archive) and the Luxembourg
// official prices. Tests never touch the network.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 2026-10-17 20:00 in Brussels: the day of the readings.
const NOW = Date.parse('2026-10-17T18:00:00Z');
const TZ = 'Europe/Brussels';
const PREFIX = 'ext:test-integration';

const read = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const PAGES = {
  'location-4000': read('location-4000.json'),
  'location-71100': read('location-71100.json'),
  'location-1009': read('location-1009.json'),
  'be-GO': read('be-liege-GO.html'),
  'be-E10': read('be-liege-E10.html'),
  'lu-GO': read('lu-luxembourg-GO.html'),
  'lu-empty': read('lu-luxembourg-DB10-empty.html'),
  'fr-E10': read('fr-chalon-E10.html'),
  'fr-SP95': read('fr-chalon-SP95.html'),
  'be-official': read('be-official.html'),
  'be-official-announced': read('be-official-announced.nl.html'),
  'lu-official': read('lu-official.html'),
};

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'carbu-')), 'carbu.json');

/**
 * @description The fake site.
 * @returns {Function} A fetch function, with `.calls` and `.state`.
 */
function fakeCarbu() {
  const state = {
    // page name -> body, to change a page during a test.
    pages: { ...PAGES },
    // 'network', or an HTTP status, for every request.
    fail: null,
  };
  const calls = [];
  const html = (body) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

  /**
   * @description The page of a path.
   * @param {URL} url - The URL.
   * @returns {string|null} The page name.
   */
  function pageOf(url) {
    const path = decodeURIComponent(url.pathname);
    if (path.endsWith('controller.getlocation_JSON.php')) {
      return `location-${url.searchParams.get('location')}`;
    }
    const list =
      /^\/(belgique|france|luxembourg)\/liste-stations-service\/([^/]+)\/[^/]+\/[^/]+\/([^/]+)$/.exec(
        path,
      );
    if (list) {
      const country = { belgique: 'be', france: 'fr', luxembourg: 'lu' }[list[1]];
      const page = `${country}-${list[2]}`;
      return state.pages[page] !== undefined ? page : `${country}-empty`;
    }
    const official = /^\/(belgique|luxembourg|france)\/prixmaximum$/.exec(path);
    if (official) {
      return `${{ belgique: 'be', luxembourg: 'lu', france: 'fr' }[official[1]]}-official`;
    }
    return null;
  }

  /**
   * @description The fetch function.
   * @param {string} address - The URL.
   * @param {object} [options] - The options (headers checked).
   * @returns {Promise<Response>} The answer.
   */
  async function fetchFn(address, options = {}) {
    const url = new URL(address);
    const page = pageOf(url);
    calls.push({ path: decodeURIComponent(url.pathname), page, headers: options.headers ?? {} });
    if (state.fail === 'network') {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (typeof state.fail === 'number') {
      return new Response('refused', { status: state.fail });
    }
    if (page && page.startsWith('location-')) {
      return html(state.pages[page] ?? '[]');
    }
    if (page === 'lu-empty' || page === 'be-empty' || page === 'fr-empty') {
      return html(state.pages['lu-empty']);
    }
    if (page && state.pages[page] !== undefined) {
      return html(state.pages[page]);
    }
    return new Response('<html>not found</html>', { status: 404 });
  }
  fetchFn.calls = calls;
  fetchFn.state = state;
  return fetchFn;
}

/**
 * @description A minimal Gladys client for the pure builders.
 */
const fakeGladys = {
  externalIds: (type, id) => ({
    device: `${PREFIX}:${type}:${id}`,
    feature: (key) => `${PREFIX}:${type}:${id}:${key}`,
  }),
};

export { NOW, TZ, PREFIX, PAGES, read, silent, storePath, fakeCarbu, fakeGladys };
