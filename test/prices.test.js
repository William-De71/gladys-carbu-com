import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectStations,
  summarize,
  mapUrl,
  priceText,
  distanceText,
  addressOf,
} from '../src/prices.js';
import { fuelAvailable, gradeMatches, officialFuels, FUEL_KEYS, FUELS } from '../src/fuels.js';
import { parseStations } from '../src/parse.js';
import { PAGES } from './helpers/fixtures.js';

const station = (fields) => ({
  key: 'be-1',
  name: 'Station',
  fuelName: 'Diesel (B7)',
  price: 2,
  distance: 1,
  date: '2026-10-17',
  latitude: 50.5,
  longitude: 5.5,
  ...fields,
});
const options = { fuel: 'diesel_b7', radius: 10, maxAge: 7, today: '2026-10-17' };

test('the fuels: codes per country, grades', () => {
  assert.equal(fuelAvailable('e85', 'FR'), true);
  assert.equal(fuelAvailable('e85', 'BE'), false);
  assert.equal(fuelAvailable('sp95_e5', 'BE'), false, 'Belgium sells E10 only');
  assert.equal(gradeMatches('sp95_e10', 'Sans Plomb 95 (E10)'), true);
  assert.equal(gradeMatches('sp95_e10', 'Sans Plomb 95 (E5)'), false);
  assert.equal(gradeMatches('sp95_e5', 'Sans Plomb 95 (E10)'), false);
  assert.equal(gradeMatches('sp98_e5', 'Super 98 (E5)'), true);
  assert.equal(gradeMatches('nope', 'x'), false);
  assert.deepEqual(officialFuels('FR'), []);
  assert.deepEqual(officialFuels('LU').sort(), ['diesel_b7', 'lpg', 'sp95_e5', 'sp98_e5']);
  for (const fuel of FUEL_KEYS) {
    assert.ok(Object.keys(FUELS[fuel].codes).length > 0, fuel);
  }
});

test('the radius and the age of the prices set stations aside', () => {
  const result = selectStations(
    [
      station({ key: 'be-1', price: 2.1 }),
      station({ key: 'be-2', price: 1.9, distance: 12 }),
      station({ key: 'be-3', price: 1.8, date: '2026-10-01' }),
      station({ key: 'be-4', price: 1.95, date: null }),
      station({ key: 'be-5', price: 2.0, distance: null }),
    ],
    options,
  );
  assert.deepEqual(
    result.stations.map((item) => item.key),
    ['be-5', 'be-1'],
  );
  assert.equal(result.outside, 1);
  assert.equal(result.stale, 2);
});

test('ranked by price, then distance, then key', () => {
  const { stations } = selectStations(
    [
      station({ key: 'be-9', price: 2, distance: 3 }),
      station({ key: 'be-8', price: 2, distance: 1 }),
      station({ key: 'be-7', price: 2, distance: 1 }),
      station({ key: 'be-6', price: 1.99, distance: 9 }),
    ],
    options,
  );
  assert.deepEqual(
    stations.map((item) => item.key),
    ['be-6', 'be-7', 'be-8', 'be-9'],
  );
});

test('the other grade of a French list is left out', () => {
  const all = parseStations(PAGES['fr-E10'], 'FR');
  const e10 = selectStations(all, { ...options, fuel: 'sp95_e10', maxAge: 3650 });
  assert.ok(e10.stations.length > 0);
  assert.ok(e10.stations.every((item) => /E10/.test(item.fuelName)));
  const recent = selectStations(all, { ...options, fuel: 'sp95_e10', radius: 30, maxAge: 7 });
  assert.ok(recent.stale > 0, 'old French prices are set aside');
});

test('the summary of an area', () => {
  assert.deepEqual(summarize([]), {
    count: 0,
    lowest: null,
    average: null,
    highest: null,
    cheapest: null,
  });
  const summary = summarize([
    station({ price: 1.9 }),
    station({ price: 2.0 }),
    station({ price: 2.15 }),
  ]);
  assert.equal(summary.count, 3);
  assert.equal(summary.lowest, 1.9);
  assert.equal(summary.average, 2.017);
  assert.equal(summary.highest, 2.15);
  assert.equal(summary.cheapest.price, 1.9);
});

test('texts and links', () => {
  assert.equal(priceText(2.274), '2,274 €');
  assert.equal(priceText(null), '–');
  assert.equal(distanceText(1.27), '1,3 km');
  assert.equal(distanceText(null), '');
  assert.equal(
    addressOf({ street: 'Rue X 1', postalCode: '4000', city: 'Liège' }),
    'Rue X 1, 4000 Liège',
  );
  assert.match(
    mapUrl(station({})),
    /^https:\/\/www\.openstreetmap\.org\/\?mlat=50\.500000&mlon=5\.500000/,
  );
  assert.equal(mapUrl(station({ latitude: null })), '');
});
