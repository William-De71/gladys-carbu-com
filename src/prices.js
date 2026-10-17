// -----------------------------------------------------------------------------
// The prices of an area, for one fuel.
//
// A station list of Carbu.com holds every station around the centre of the
// locality (up to 100, some 10 to 25 km away), with the date of each price.
// French prices can be years old (a station nobody updates): a price older
// than `maxAge` days is set aside, and so is a station farther than the
// radius. What is left is ranked by price, then distance.
// -----------------------------------------------------------------------------

import { gradeMatches } from './fuels.js';
import { daysBetween } from './time.js';

/**
 * @description Round a price to the tenth of a cent.
 * @param {number} value - Euros per litre.
 * @returns {number} The price, 3 decimals.
 */
const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * @description The stations of a list that count for a fuel.
 * @param {object[]} stations - parseStations().
 * @param {object} options - Options.
 * @param {string} options.fuel - The fuel key.
 * @param {number} options.radius - Kilometres from the centre of the locality.
 * @param {number} options.maxAge - Days a price stays valid.
 * @param {string} options.today - The local date, `YYYY-MM-DD`.
 * @returns {{ stations: object[], outside: number, stale: number }} The kept
 * stations, cheapest first, and how many were set aside.
 */
function selectStations(stations, { fuel, radius, maxAge, today }) {
  let outside = 0;
  let stale = 0;
  const kept = [];
  for (const station of stations) {
    if (!gradeMatches(fuel, station.fuelName) && station.fuelName) {
      continue;
    }
    if (station.distance !== null && station.distance > radius) {
      outside += 1;
      continue;
    }
    const age = station.date ? daysBetween(station.date, today) : null;
    if (age === null || age > maxAge) {
      stale += 1;
      continue;
    }
    kept.push({ ...station, age: Math.max(0, age) });
  }
  kept.sort(
    (a, b) =>
      a.price - b.price || (a.distance ?? 99) - (b.distance ?? 99) || a.key.localeCompare(b.key),
  );
  return { stations: kept, outside, stale };
}

/**
 * @description The summary of an area for a fuel.
 * @param {object[]} stations - The kept stations (selectStations).
 * @returns {{ count: number, lowest: number|null, average: number|null,
 * highest: number|null, cheapest: object|null }} The figures.
 */
function summarize(stations) {
  if (stations.length === 0) {
    return { count: 0, lowest: null, average: null, highest: null, cheapest: null };
  }
  const prices = stations.map((station) => station.price);
  return {
    count: stations.length,
    lowest: round3(Math.min(...prices)),
    average: round3(prices.reduce((sum, price) => sum + price, 0) / prices.length),
    highest: round3(Math.max(...prices)),
    cheapest: stations[0],
  };
}

/**
 * @description A link to a station on a map.
 * @param {object} station - The station.
 * @returns {string} An https URL, '' without a position.
 */
function mapUrl(station) {
  return station.latitude !== null && station.longitude !== null
    ? `https://www.openstreetmap.org/?mlat=${station.latitude.toFixed(6)}&mlon=${station.longitude.toFixed(6)}#map=17/${station.latitude.toFixed(6)}/${station.longitude.toFixed(6)}`
    : '';
}

/**
 * @description "2,444 €" (the three countries write a decimal comma).
 * @param {number|null} price - Euros per litre.
 * @returns {string} The price, '–' when none.
 */
const priceText = (price) =>
  Number.isFinite(price) ? `${price.toFixed(3).replace('.', ',')} €` : '–';

/**
 * @description "1,3 km".
 * @param {number|null} distance - Kilometres.
 * @returns {string} The distance, '' when unknown.
 */
const distanceText = (distance) =>
  Number.isFinite(distance) ? `${distance.toFixed(1).replace('.', ',')} km` : '';

/**
 * @description The address of a station on one line.
 * @param {object} station - The station.
 * @returns {string} "Bd Carton De Wiart 4, 4000 Liège".
 */
const addressOf = (station) =>
  [station.street, [station.postalCode, station.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

export { round3, selectStations, summarize, mapUrl, priceText, distanceText, addressOf };
