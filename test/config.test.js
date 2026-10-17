import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  readFuels,
  readLanguage,
  DEFAULT_RADIUS,
  DEFAULT_MAX_AGE,
  DEFAULT_INTERVAL,
  DEFAULT_STATION_COUNT,
  MAX_FUELS,
} from '../src/config.js';

test('defaults: Belgium, Diesel, 10 km, 7 days, 5 stations, every hour', () => {
  assert.deepEqual(normalizeConfig(), {
    country: 'BE',
    postalCode: '',
    town: '',
    fuels: ['diesel_b7'],
    radius: DEFAULT_RADIUS,
    maxAge: DEFAULT_MAX_AGE,
    stationCount: DEFAULT_STATION_COUNT,
    interval: DEFAULT_INTERVAL,
    language: 'auto',
  });
});

test('reads every field as the Configuration screen stores it', () => {
  assert.deepEqual(
    normalizeConfig({
      country: 'lu',
      postal_code: ' L-1009 ',
      town: ' Luxembourg ',
      fuels: ['sp95_e5', 'lpg'],
      radius: '20',
      max_age: '3',
      stations: '0',
      interval: '240',
      language: 'de',
    }),
    {
      country: 'LU',
      postalCode: '1009',
      town: 'Luxembourg',
      fuels: ['sp95_e5', 'lpg'],
      radius: 20,
      maxAge: 3,
      stationCount: 0,
      interval: 240,
      language: 'de',
    },
  );
});

test('values outside the choices fall back to the defaults', () => {
  const config = normalizeConfig({ country: 'DE', radius: '7', max_age: '', interval: 1 });
  assert.equal(config.country, 'BE');
  assert.equal(config.radius, DEFAULT_RADIUS);
  assert.equal(config.maxAge, DEFAULT_MAX_AGE);
  assert.equal(config.interval, DEFAULT_INTERVAL);
});

test('the fuels: an array, a JSON array or a list; known ones, four at most', () => {
  assert.deepEqual(readFuels(['lpg', 'nope', 'lpg']), ['lpg']);
  assert.deepEqual(readFuels('["e85","cng"]'), ['e85', 'cng']);
  assert.deepEqual(readFuels('lpg, cng'), ['lpg', 'cng']);
  assert.deepEqual(readFuels([]), ['diesel_b7']);
  assert.deepEqual(readFuels(null), ['diesel_b7']);
  assert.equal(readFuels(['lpg', 'cng', 'e85', 'diesel_b7', 'sp98_e5']).length, MAX_FUELS);
});

test('the language of the last widget request', () => {
  assert.equal(readLanguage({ last_language: 'es' }, 'fr'), 'es');
  assert.equal(readLanguage({ last_language: 'french' }, 'fr'), 'fr');
  assert.equal(readLanguage(null, 'en'), 'en');
});
