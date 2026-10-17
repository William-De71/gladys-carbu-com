// The scene triggers: one event per transition, a baseline first, never twice;
// the payload limits of the core; the outputs of the scene actions.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRIGGERS,
  detectCheapest,
  cheapestData,
  detectStationPrices,
  stationPriceData,
  detectOfficial,
  pruneFired,
  cheapestStationOutputs,
  officialPricesOutputs,
  pick,
  CHEAPEST_STATION_OUTPUTS,
  OFFICIAL_PRICES_OUTPUTS,
} from '../src/events.js';
import { parseOfficial, parseStations } from '../src/parse.js';
import { selectStations, summarize } from '../src/prices.js';
import { PAGES } from './helpers/fixtures.js';

const station = (key, price, fields = {}) => ({
  key,
  name: `Station ${key}`,
  brand: 'Esso',
  street: 'Rue X 1',
  postalCode: '4000',
  city: 'Liège',
  price,
  distance: 1.24,
  date: '2026-10-17',
  latitude: 50.6,
  longitude: 5.5,
  url: `https://carbu.com/belgique/index.php/station/esso/liege/4000/${key}`,
  ...fields,
});
const area = (stations) => ({ stations, summary: summarize(stations) });

/**
 * @description Check an event payload against the limits of the core.
 * @param {object} data - The payload.
 */
function assertPayload(data) {
  const entries = Object.entries(data);
  assert.ok(entries.length <= 30, `${entries.length} keys`);
  for (const [key, value] of entries) {
    const scalar =
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= 1000);
    assert.ok(scalar, `${key}: ${JSON.stringify(value)}`);
  }
}

test('cheapest station: a baseline, then one event when another station takes the lead', () => {
  const first = detectCheapest({
    areas: { diesel_b7: area([station('be-1', 2), station('be-2', 2.1)]) },
    areaId: 'BE_lg_826',
  });
  assert.deepEqual(first.changes, [], 'the first reading is a baseline');
  const same = detectCheapest({
    areas: { diesel_b7: area([station('be-1', 1.99), station('be-2', 2.1)]) },
    seen: first.seen,
    areaId: 'BE_lg_826',
  });
  assert.deepEqual(same.changes, [], 'a price change of the same station');
  const next = detectCheapest({
    areas: { diesel_b7: area([station('be-2', 1.95), station('be-1', 1.99)]) },
    seen: same.seen,
    areaId: 'BE_lg_826',
  });
  assert.equal(next.changes.length, 1);
  const data = cheapestData(next.changes[0]);
  assertPayload(data);
  assert.equal(data.fuel, 'diesel_b7');
  assert.equal(data.fuel_name, 'Diesel (B7)');
  assert.equal(data.station_name, 'Station be-2');
  assert.equal(data.price, 1.95);
  assert.equal(data.previous_station_name, 'Station be-1');
  assert.equal(data.previous_price, 1.99);
  assert.equal(data.distance_km, 1.2);
  assert.match(data.map_url, /^https:\/\/www\.openstreetmap\.org\//);
});

test('cheapest station: a draw keeps the known one; another area is a baseline', () => {
  const seen = { area: 'BE_lg_826', diesel_b7: { key: 'be-2', name: 'B', price: 2 } };
  const draw = detectCheapest({
    areas: { diesel_b7: area([station('be-1', 2), station('be-2', 2)]) },
    seen,
    areaId: 'BE_lg_826',
  });
  assert.deepEqual(draw.changes, []);
  assert.equal(draw.seen.diesel_b7.key, 'be-2');
  const moved = detectCheapest({
    areas: { diesel_b7: area([station('be-1', 1.5)]) },
    seen,
    areaId: 'BE_lg_825',
  });
  assert.deepEqual(moved.changes, []);
  const empty = detectCheapest({ areas: { diesel_b7: area([]) }, seen, areaId: 'BE_lg_826' });
  assert.deepEqual(empty.changes, []);
  assert.equal(empty.seen.diesel_b7.key, 'be-2', 'an empty reading forgets nothing');
});

test('station prices: a baseline per station and fuel, then each change', () => {
  const first = detectStationPrices({ prices: { 'be-1': { diesel_b7: 2 } } });
  assert.deepEqual(first.changes, []);
  const next = detectStationPrices({
    prices: { 'be-1': { diesel_b7: 1.95, sp95_e10: 1.8 } },
    seen: first.seen,
  });
  assert.deepEqual(next.changes, [{ key: 'be-1', fuel: 'diesel_b7', price: 1.95, previous: 2 }]);
  const data = stationPriceData(
    next.changes[0],
    station('be-1', 1.95),
    'ext:test-integration:station:be-1',
  );
  assertPayload(data);
  assert.equal(data.station, 'ext:test-integration:station:be-1');
  assert.equal(data.direction, 'down');
  assert.equal(data.difference, -0.05);
  assert.equal(data.previous_price, 2);
  const again = detectStationPrices({
    prices: { 'be-1': { diesel_b7: 1.95, sp95_e10: 1.8 } },
    seen: next.seen,
  });
  assert.deepEqual(again.changes, []);
});

test('official prices: an announced decrease fires once, a baseline first', () => {
  const april = parseOfficial(PAGES['be-official-announced'], 'BE');
  const fuels = ['diesel_b7', 'diesel_xtl', 'sp95_e10'];
  const baseline = detectOfficial({ country: 'BE', table: april, fuels });
  assert.deepEqual(baseline.events, [], 'what is already announced fires nothing at start');
  // The day before, nothing was announced yet.
  const quiet = structuredClone(april);
  for (const entry of Object.values(quiet.fuels)) {
    entry.next = entry.next.map((step) => ({ ...step, trend: 'same', price: entry.price }));
  }
  const start = detectOfficial({ country: 'BE', table: quiet, fuels });
  const announced = detectOfficial({ country: 'BE', table: april, fuels, seen: start.seen });
  assert.deepEqual(
    announced.events.map((event) => [event.key, event.data.fuel, event.data.direction]),
    [
      [TRIGGERS.OFFICIAL_PRICE_ANNOUNCED, 'diesel_b7', 'down'],
      [TRIGGERS.OFFICIAL_PRICE_ANNOUNCED, 'diesel_xtl', 'up'],
    ],
  );
  const [diesel] = announced.events;
  assertPayload(diesel.data);
  assert.deepEqual(
    {
      current: diesel.data.current_price,
      next: diesel.data.new_price,
      difference: diesel.data.difference,
      date: diesel.data.date,
      text: diesel.data.date_text,
    },
    { current: 2.183, next: 2.061, difference: -0.122, date: '2026-04-22', text: '22/04/2026' },
  );
  const again = detectOfficial({ country: 'BE', table: april, fuels, seen: announced.seen });
  assert.deepEqual(again.events, [], 'never twice');
});

test('official prices: a forecast, then the price of the new day', () => {
  const table = parseOfficial(PAGES['be-official'], 'BE');
  const fuels = ['diesel_b7'];
  const start = detectOfficial({ country: 'BE', table, fuels });
  const rising = structuredClone(table);
  rising.fuels.diesel_b7.next = [
    { date: '2026-10-19', kind: 'forecast', price: null, trend: 'up' },
  ];
  const forecast = detectOfficial({ country: 'BE', table: rising, fuels, seen: start.seen });
  assert.deepEqual(
    forecast.events.map((event) => [event.key, event.data.direction, event.data.expected_price]),
    [[TRIGGERS.OFFICIAL_PRICE_FORECAST, 'up', null]],
  );
  assertPayload(forecast.events[0].data);
  const monday = structuredClone(table);
  monday.date = '2026-10-19';
  monday.fuels.diesel_b7.price = 2.5;
  monday.fuels.diesel_b7.next = [];
  const changed = detectOfficial({ country: 'BE', table: monday, fuels, seen: forecast.seen });
  assert.deepEqual(
    changed.events.map((event) => [event.key, event.data.direction, event.data.difference]),
    [[TRIGGERS.OFFICIAL_PRICE_CHANGED, 'up', 0.056]],
  );
  assertPayload(changed.events[0].data);
  const sameDay = detectOfficial({ country: 'BE', table: monday, fuels, seen: changed.seen });
  assert.deepEqual(sameDay.events, []);
});

test('official prices: the marks of past days are forgotten', () => {
  const fired = { 'diesel_b7|2026-09-01|official': 'up', 'diesel_b7|2026-10-19|forecast': 'up' };
  assert.deepEqual(Object.keys(pruneFired(fired, '2026-10-17')), ['diesel_b7|2026-10-19|forecast']);
});

test('get_cheapest_station: the cheapest within a distance, only declared outputs', () => {
  const stations = selectStations(parseStations(PAGES['be-GO'], 'BE'), {
    fuel: 'diesel_b7',
    radius: 10,
    maxAge: 7,
    today: '2026-10-17',
  }).stations;
  const outputs = pick(cheapestStationOutputs(stations, null), CHEAPEST_STATION_OUTPUTS);
  assert.equal(outputs.found, true);
  assert.equal(outputs.price, stations[0].price);
  assert.ok(Object.keys(outputs).every((key) => CHEAPEST_STATION_OUTPUTS.includes(key)));
  const near = pick(cheapestStationOutputs(stations, 1), CHEAPEST_STATION_OUTPUTS);
  assert.ok(near.distance_km <= 1);
  assert.ok(near.station_count < outputs.station_count);
  assert.deepEqual(pick(cheapestStationOutputs([], null), CHEAPEST_STATION_OUTPUTS), {
    found: false,
    station_count: 0,
  });
});

test('get_official_prices: today, next and the trend', () => {
  const april = parseOfficial(PAGES['be-official-announced'], 'BE');
  assert.deepEqual(pick(officialPricesOutputs(april.fuels.diesel_b7), OFFICIAL_PRICES_OUTPUTS), {
    available: true,
    today_price: 2.183,
    next_price: 2.061,
    next_date: '2026-04-22',
    trend: 'down',
    announced: true,
  });
  const october = parseOfficial(PAGES['be-official'], 'BE');
  assert.deepEqual(pick(officialPricesOutputs(october.fuels.lpg), OFFICIAL_PRICES_OUTPUTS), {
    available: true,
    today_price: 1.079,
    next_price: 1.079,
    next_date: '2026-10-19',
    trend: 'unknown',
    announced: false,
  });
  assert.deepEqual(pick(officialPricesOutputs(null), OFFICIAL_PRICES_OUTPUTS), {
    available: false,
  });
});
