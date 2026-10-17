// -----------------------------------------------------------------------------
// Scene triggers (pure logic) and scene action outputs.
//
// Triggers (one event per transition, never a periodic snapshot):
//   - `cheapest_station_changed`   another station becomes the cheapest of
//                                  the area for a fuel (a tie keeps the
//                                  previous one: no event for a draw);
//   - `station_price_changed`      the price of a fuel changes at a station
//                                  the user added (its device exists);
//   - `official_price_changed`     today's official price of a fuel is not
//                                  yesterday's (Belgian maximum price,
//                                  Luxembourg official price);
//   - `official_price_announced`   Belgium: the government announced a new
//                                  maximum price for the next day;
//   - `official_price_forecast`    Belgium: Carbu.com expects the maximum
//                                  price to go up or down on a coming day.
//
// What was seen is kept in /data (`seen`): a restart never fires the same
// event twice, and the first reading is a baseline (nothing fires for what was
// already there). A scene action or a widget never fires an event.
// -----------------------------------------------------------------------------

import { fuelName } from './i18n.js';
import { round3, mapUrl, addressOf } from './prices.js';
import { nextStep } from './device.js';
import { fullDate } from './time.js';

const TRIGGERS = {
  CHEAPEST_STATION_CHANGED: 'cheapest_station_changed',
  STATION_PRICE_CHANGED: 'station_price_changed',
  OFFICIAL_PRICE_CHANGED: 'official_price_changed',
  OFFICIAL_PRICE_ANNOUNCED: 'official_price_announced',
  OFFICIAL_PRICE_FORECAST: 'official_price_forecast',
};
// Announcements and forecasts already fired are forgotten after this many days.
const KEEP_DAYS = 14;
const TEXT_MAX = 1000;
const CHEAPEST_STATION_OUTPUTS = [
  'found',
  'station_name',
  'brand',
  'address',
  'price',
  'distance_km',
  'price_date',
  'average_price',
  'station_count',
  'map_url',
];
const OFFICIAL_PRICES_OUTPUTS = [
  'available',
  'today_price',
  'next_price',
  'next_date',
  'trend',
  'announced',
];

const clip = (value, max = TEXT_MAX) => String(value ?? '').slice(0, max);
const direction = (from, to) => (to > from ? 'up' : 'down');

/**
 * @description The variables of a station, for an event or an action.
 * @param {object} station - The station.
 * @returns {object} Flat scalars.
 */
const stationVariables = (station) => ({
  station_name: clip(station.name, 200),
  brand: clip(station.brand, 100),
  address: clip(addressOf(station), 300),
  price: station.price,
  distance_km: Number.isFinite(station.distance) ? Math.round(station.distance * 10) / 10 : null,
  price_date: station.date ?? null,
  map_url: clip(mapUrl(station), 500),
});

/**
 * @description Detect a new cheapest station per fuel.
 * @param {object} options - Options.
 * @param {object} options.areas - fuel -> `{ stations, summary }` of the reading.
 * @param {object} [options.seen] - fuel -> `{ key, name, price }` remembered.
 * @param {string} options.areaId - The area code (a new area is a baseline).
 * @returns {{ changes: object[], seen: object }} `changes`: `{ fuel, station,
 * previous }`; `seen` to keep (with `area`).
 */
function detectCheapest({ areas, seen = {}, areaId }) {
  const sameArea = seen.area === areaId;
  const next = { area: areaId };
  const changes = [];
  for (const [fuel, { stations, summary }] of Object.entries(areas)) {
    const previous = sameArea ? seen[fuel] : null;
    let cheapest = summary.cheapest;
    // A draw keeps the station already known as the cheapest.
    const kept = previous && stations.find((station) => station.key === previous.key);
    if (cheapest && kept && kept.price <= cheapest.price) {
      cheapest = kept;
    }
    if (!cheapest) {
      next[fuel] = previous ?? null;
      continue;
    }
    next[fuel] = { key: cheapest.key, name: cheapest.name, price: cheapest.price };
    if (previous && previous.key !== cheapest.key) {
      changes.push({ fuel, station: cheapest, previous, average: summary.average });
    }
  }
  return { changes, seen: next };
}

/**
 * @description The data of a `cheapest_station_changed` event.
 * @param {object} change - `{ fuel, station, previous, average }`.
 * @returns {object} The event data.
 */
function cheapestData({ fuel, station, previous, average }) {
  return {
    fuel,
    fuel_name: fuelName(fuel, 'en'),
    ...stationVariables(station),
    station_url: clip(station.url, 500),
    average_price: average ?? null,
    previous_station_name: clip(previous.name, 200),
    previous_price: Number.isFinite(previous.price) ? previous.price : null,
  };
}

/**
 * @description Detect the price changes at the added stations.
 * @param {object} options - Options.
 * @param {object} options.prices - station key -> fuel -> price, of the reading.
 * @param {object} [options.seen] - station key -> fuel -> price remembered.
 * @returns {{ changes: object[], seen: object }} `changes`: `{ key, fuel,
 * price, previous }`.
 */
function detectStationPrices({ prices, seen = {} }) {
  const next = { ...seen };
  const changes = [];
  for (const [key, byFuel] of Object.entries(prices)) {
    next[key] = { ...(seen[key] ?? {}) };
    for (const [fuel, price] of Object.entries(byFuel)) {
      const previous = seen[key]?.[fuel];
      if (Number.isFinite(previous) && Number.isFinite(price) && previous !== price) {
        changes.push({ key, fuel, price, previous });
      }
      if (Number.isFinite(price)) {
        next[key][fuel] = price;
      }
    }
  }
  return { changes, seen: next };
}

/**
 * @description The data of a `station_price_changed` event.
 * @param {object} change - `{ key, fuel, price, previous }`.
 * @param {object} station - The station (its last reading).
 * @param {string} deviceExternalId - The external id of its device.
 * @returns {object} The event data.
 */
function stationPriceData({ fuel, price, previous }, station, deviceExternalId) {
  return {
    station: deviceExternalId,
    fuel,
    fuel_name: fuelName(fuel, 'en'),
    direction: direction(previous, price),
    ...stationVariables({ ...station, price }),
    previous_price: previous,
    difference: round3(price - previous),
  };
}

/**
 * @description Forget the announcements and forecasts of past days.
 * @param {object} fired - `<fuel>|<date>|<kind>` -> trend.
 * @param {string} today - `YYYY-MM-DD`.
 * @returns {object} The ones still to come (or of the last KEEP_DAYS days).
 */
function pruneFired(fired, today) {
  const limit = Date.parse(`${today}T00:00:00Z`) - KEEP_DAYS * 24 * 3600 * 1000;
  return Object.fromEntries(
    Object.entries(fired ?? {}).filter(([key]) => {
      const date = key.split('|')[1];
      return Date.parse(`${date}T00:00:00Z`) >= limit;
    }),
  );
}

/**
 * @description Detect what the official table changed.
 * @param {object} options - Options.
 * @param {string} options.country - BE or LU.
 * @param {object} options.table - parseOfficial().
 * @param {string[]} options.fuels - The followed fuels with an official price.
 * @param {object} [options.seen] - `{ country, prices: { fuel: { date, price } }, fired }`.
 * @returns {{ events: Array<{ key: string, data: object }>, seen: object }} The events.
 */
function detectOfficial({ country, table, fuels, seen = {} }) {
  const baseline = seen.country !== country || !seen.prices;
  const prices = { ...(baseline ? {} : seen.prices) };
  let fired = pruneFired(baseline ? {} : seen.fired, table.date);
  const events = [];
  for (const fuel of fuels) {
    const entry = table.fuels[fuel];
    if (!entry) {
      continue;
    }
    const before = prices[fuel];
    if (before && before.date < table.date && before.price !== entry.price) {
      events.push({
        key: TRIGGERS.OFFICIAL_PRICE_CHANGED,
        data: {
          fuel,
          fuel_name: fuelName(fuel, 'en'),
          country,
          direction: direction(before.price, entry.price),
          price: entry.price,
          previous_price: before.price,
          difference: round3(entry.price - before.price),
          date: table.date,
        },
      });
    }
    prices[fuel] = { date: table.date, price: entry.price };
    for (const step of entry.next ?? []) {
      if (step.trend !== 'up' && step.trend !== 'down') {
        continue;
      }
      const mark = `${fuel}|${step.date}|${step.kind}`;
      if (fired[mark] === step.trend) {
        continue;
      }
      fired = { ...fired, [mark]: step.trend };
      if (baseline) {
        continue;
      }
      const common = {
        fuel,
        fuel_name: fuelName(fuel, 'en'),
        direction: step.trend,
        current_price: entry.price,
        date: step.date,
        date_text: fullDate(step.date),
      };
      events.push(
        step.kind === 'official'
          ? {
              key: TRIGGERS.OFFICIAL_PRICE_ANNOUNCED,
              data: {
                ...common,
                new_price: step.price,
                difference: Number.isFinite(step.price) ? round3(step.price - entry.price) : null,
              },
            }
          : {
              key: TRIGGERS.OFFICIAL_PRICE_FORECAST,
              data: { ...common, expected_price: step.price ?? null },
            },
      );
    }
  }
  return { events, seen: { country, prices, fired } };
}

/**
 * @description The outputs of the `get_cheapest_station` action.
 * @param {object[]} stations - The kept stations of the fuel, cheapest first.
 * @param {number|null} maxDistance - Kilometres, null for the whole radius.
 * @returns {object} The outputs.
 */
function cheapestStationOutputs(stations, maxDistance) {
  const within =
    maxDistance === null
      ? stations
      : stations.filter((station) => station.distance === null || station.distance <= maxDistance);
  const [station] = within;
  const average = within.length
    ? round3(within.reduce((sum, item) => sum + item.price, 0) / within.length)
    : null;
  if (!station) {
    return { found: false, station_count: 0, average_price: null };
  }
  return {
    found: true,
    ...stationVariables(station),
    price_date: station.date ?? '',
    average_price: average,
    station_count: within.length,
  };
}

/**
 * @description The outputs of the `get_official_prices` action.
 * @param {object|null} entry - The fuel in parseOfficial(), null when none.
 * @returns {object} The outputs.
 */
function officialPricesOutputs(entry) {
  if (!entry) {
    return { available: false };
  }
  const step = nextStep(entry);
  const changing = step.trend === 'up' || step.trend === 'down';
  return {
    available: true,
    today_price: entry.price,
    next_price: step.price ?? (changing ? null : entry.price),
    next_date: step.date ?? '',
    trend: step.trend ?? 'unknown',
    announced: step.kind === 'official',
  };
}

/**
 * @description Keep only the declared outputs.
 * @param {object} outputs - The computed outputs.
 * @param {string[]} declared - The output keys of the manifest.
 * @returns {object} The outputs, strings bounded.
 */
function pick(outputs, declared) {
  return Object.fromEntries(
    declared
      // An unknown value is left out rather than sent as null.
      .filter((key) => outputs[key] !== undefined && outputs[key] !== null)
      .map((key) => [
        key,
        typeof outputs[key] === 'string' ? outputs[key].slice(0, 10000) : outputs[key],
      ]),
  );
}

export {
  TRIGGERS,
  KEEP_DAYS,
  CHEAPEST_STATION_OUTPUTS,
  OFFICIAL_PRICES_OUTPUTS,
  stationVariables,
  detectCheapest,
  cheapestData,
  detectStationPrices,
  stationPriceData,
  pruneFired,
  detectOfficial,
  cheapestStationOutputs,
  officialPricesOutputs,
  pick,
};
