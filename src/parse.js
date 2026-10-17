// -----------------------------------------------------------------------------
// Reading the pages of Carbu.com.
//
// Carbu.com has no public API: the integration reads the same pages as a
// visitor, in French:
//   - the locality search (JSON): `[{ id, n, pn, c, pc }]`, the id being the
//     area code the station lists need ("BE_lg_826");
//   - the station list of a fuel around a locality: one `<div id="item_<id>"
//     data-…>` per station, its price, grade, distance from the centre of the
//     locality, address and position in `data-*` attributes; the date of the
//     price is the first `dd/mm/yy` of the block. An item without `data-price`
//     sells the fuel without a known price: it is left out;
//   - the official price table (`table.prix-officiel`): the Belgian maximum
//     prices of today, the ones the government announced for the next days
//     (header cells with `rowspan`), then the forecast of Carbu.com (the last
//     header cell, without `rowspan`); the colour of a cell gives the
//     direction (text-success: down, text-danger: up, text-primary: unchanged,
//     text-muted: not available). Luxembourg: the official prices of today.
//
// Every function here is pure: the tests feed them real pages (test/fixtures).
// -----------------------------------------------------------------------------

import { OFFICIAL_ROWS } from './fuels.js';

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  euro: '€',
  deg: '°',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  szlig: 'ß',
  oelig: 'œ',
  OElig: 'Œ',
  aelig: 'æ',
};
// Accented letters: &eacute; &Egrave; &ccedil; &ouml; …
const ACCENTS = { acute: '́', grave: '̀', circ: '̂', uml: '̈', cedil: '̧', tilde: '̃', ring: '̊' };

/**
 * @description Decode the HTML entities of a text.
 * @param {string} value - The text ("Li&egrave;ge").
 * @returns {string} The text ("Liège").
 * @example
 * decodeEntities('Total &Eacute;nergies &amp; Co'); // -> 'Total Énergies & Co'
 */
function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    if (ENTITIES[name] !== undefined) {
      return ENTITIES[name];
    }
    const accent = /^([a-z])(acute|grave|circ|uml|cedil|tilde|ring)$/i.exec(name);
    return accent ? `${accent[1]}${ACCENTS[accent[2]]}`.normalize('NFC') : whole;
  });
}

/**
 * @description The text of an HTML fragment.
 * @param {string} html - The fragment.
 * @returns {string} Its text, spaces collapsed.
 */
const textOf = (html) =>
  decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * @description Fold a text for comparisons.
 * @param {unknown} value - The text.
 * @returns {string} Lower case, no accent, words separated by one space.
 * @example
 * fold('Diesel (XTL / HVO)'); // -> 'diesel xtl hvo'
 */
function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * @description An ISO date from a Carbu.com date.
 * @param {string} value - "17/10/26" or "17/10/2026".
 * @returns {string|null} "2026-10-17", null when not a date.
 * @example
 * isoDate('17/10/26'); // -> '2026-10-17'
 */
function isoDate(value) {
  const match = /(\d{2})\/(\d{2})\/(\d{2}|\d{4})\b/.exec(String(value ?? ''));
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  const full = year.length === 2 ? `20${year}` : year;
  const date = `${full}-${month}-${day}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}

/**
 * @description A price written by Carbu.com.
 * @param {string} value - "2,0640 €/l", "2.444".
 * @returns {number|null} The price per litre, null when none.
 */
function readPrice(value) {
  const match = /(\d+)[.,](\d+)/.exec(String(value ?? ''));
  if (!match) {
    return null;
  }
  const price = Number(`${match[1]}.${match[2]}`);
  return Number.isFinite(price) && price > 0 && price < 100 ? price : null;
}

/**
 * @description Read the answer of the locality search.
 * @param {string} body - The JSON text.
 * @returns {Array<{ id: string, name: string, region: string, country: string, postalCode: string }>}
 * The localities (a level with postal code "0" — a province — is left out).
 */
function parseLocations(body) {
  let list;
  try {
    list = JSON.parse(String(body ?? '').trim() || '[]');
  } catch {
    throw new SyntaxError('locality search: not JSON');
  }
  if (!Array.isArray(list)) {
    throw new SyntaxError('locality search: not a list');
  }
  return list
    .filter((item) => item && typeof item === 'object' && item.id && item.pc && item.pc !== '0')
    .map((item) => ({
      id: String(item.id),
      name: decodeEntities(item.n ?? ''),
      region: decodeEntities(item.pn ?? ''),
      country: String(item.c ?? '').toUpperCase(),
      postalCode: String(item.pc),
    }));
}

/**
 * @description The brand of a station: the `alt` of its logo, else the brand
 * segment of its link ("/station/shell-express/…").
 * @param {string} block - The HTML of the station.
 * @param {string} link - Its link.
 * @returns {string} "Shell Express".
 */
function brandOf(block, link) {
  const alt = /class="station-logo[^"]*"[\s\S]*?<img[^>]*\balt\s*=\s*"([^"]*)"/.exec(block);
  if (alt && textOf(alt[1])) {
    return textOf(alt[1]);
  }
  const segment = /\/station\/([^/]+)\//.exec(link);
  return segment
    ? segment[1]
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : '';
}

/**
 * @description Read a station list.
 * @param {string} html - The page.
 * @param {string} country - BE, FR or LU (the stations of a Belgian list near
 * the border can be French: the link of each station tells its country).
 * @returns {object[]} The stations with a price: `{ id, key, country, name,
 * brand, fuelName, price, distance, latitude, longitude, street, postalCode,
 * city, url, date }`. `key` ("be-2430") is unique across countries.
 */
function parseStations(html, country) {
  const stations = [];
  const seen = new Set();
  const blocks = String(html ?? '').split(/<div class="station-content/);
  for (const block of blocks.slice(1)) {
    const item = /<div\s+id="item_(\d+)"([\s\S]*?)class="stationItem/.exec(block);
    if (!item) {
      continue;
    }
    const data = {};
    for (const [, name, value] of item[2].matchAll(/data-([a-z]+)="([^"]*)"/g)) {
      data[name] = value;
    }
    const price = readPrice(data.price);
    if (price === null) {
      continue;
    }
    const url = /^https:\/\//.test(data.link ?? '') ? data.link : '';
    const where = /carbu\.com\/(belgique|belgie|france|luxembourg)\//.exec(url);
    const stationCountry =
      { belgique: 'BE', belgie: 'BE', france: 'FR', luxembourg: 'LU' }[where?.[1]] ?? country;
    const key = `${stationCountry.toLowerCase()}-${item[1]}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const [street = '', place = ''] = decodeEntities(data.address ?? '')
      .split(/<br\s*\/?>/i)
      .map((part) => part.replace(/\s+/g, ' ').trim());
    const town = /^([0-9A-Z-]{3,10})\s+(.*)$/.exec(place);
    const date = /(\d{2}\/\d{2}\/\d{2,4})\s*<\/span>/.exec(block);
    const latitude = Number(data.lat);
    const longitude = Number(data.lng);
    const distance = Number(data.distance);
    stations.push({
      id: item[1],
      key,
      country: stationCountry,
      name: decodeEntities(data.name ?? '').trim() || `#${item[1]}`,
      brand: brandOf(block, url),
      fuelName: decodeEntities(data.fuelname ?? '').trim(),
      price,
      distance: Number.isFinite(distance) && distance >= 0 ? distance : null,
      latitude: Number.isFinite(latitude) && latitude !== 0 ? latitude : null,
      longitude: Number.isFinite(longitude) && longitude !== 0 ? longitude : null,
      street,
      postalCode: town ? town[1] : '',
      city: town ? town[2] : place,
      url,
      date: date ? isoDate(date[1]) : null,
    });
  }
  return stations;
}

/**
 * @description The direction a cell of the official table announces.
 * @param {string} cell - The HTML of the cell.
 * @returns {string|null} `down`, `up`, `same`, null when not available.
 */
function trendOf(cell) {
  if (/text-success/.test(cell)) {
    return 'down';
  }
  if (/text-danger/.test(cell)) {
    return 'up';
  }
  if (/text-primary/.test(cell)) {
    return 'same';
  }
  return null;
}

/**
 * @description Read the official price table.
 * @param {string} html - The page (carbu.com/<country>/prixmaximum).
 * @param {string} country - BE or LU.
 * @returns {{ date: string|null, fuels: object }|null} `fuels[fuel] = { label,
 * price, next: [{ date, kind, price, trend }] }` — `kind` is `official` (a
 * price the government announced) or `forecast` (Carbu.com's expectation);
 * null when the page holds no table.
 */
function parseOfficial(html, country) {
  const page = String(html ?? '');
  const start = page.indexOf('prix-officiel');
  if (start < 0) {
    return null;
  }
  const table = page.slice(start, page.indexOf('</table>', start) + 1 || undefined);
  const head = /<thead>([\s\S]*?)<\/thead>/.exec(table)?.[1] ?? '';
  const headers = [...head.matchAll(/<th([^>]*)>([\s\S]*?)<\/th>/g)].slice(1).map((match) => ({
    date: isoDate(textOf(match[2])),
    // The government's prices span two header rows; the forecast does not.
    kind: /rowspan/.test(match[1]) ? 'official' : 'forecast',
  }));
  if (headers.length === 0 || !headers[0].date) {
    return null;
  }
  const rows = OFFICIAL_ROWS[country] ?? {};
  const fuels = {};
  const body = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(table)?.[1] ?? table;
  for (const [row] of body.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    if (cells.length < 2) {
      continue;
    }
    const label = textOf(cells[0]);
    const fuel = rows[fold(label)];
    const price = readPrice(textOf(cells[1]));
    if (!fuel || price === null || fuels[fuel]) {
      continue;
    }
    const next = [];
    headers.slice(1).forEach((header, index) => {
      const cell = cells[index + 2];
      if (cell === undefined || !header.date) {
        return;
      }
      const trend = trendOf(cell);
      const announced = readPrice(textOf(cell));
      next.push({
        date: header.date,
        kind: header.kind,
        // "= Unchanged": the price of the day before stays.
        price: announced ?? (trend === 'same' ? (next.length ? next.at(-1).price : price) : null),
        trend,
      });
    });
    fuels[fuel] = { label, price, next };
  }
  return { date: headers[0].date, fuels };
}

export {
  decodeEntities,
  textOf,
  fold,
  isoDate,
  readPrice,
  parseLocations,
  parseStations,
  parseOfficial,
};
