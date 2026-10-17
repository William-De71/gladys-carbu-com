// What the fake Gladys does not check but the core expects (forum thread 11005):
// `min`, `max`, `read_only` and `has_feedback` on every feature, valid
// category / type pairs, no polling by Gladys, names that tell devices apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  buildAreaDevice,
  buildStationDevice,
  buildOfficialDevice,
  buildAreaStates,
  buildStationStates,
  buildOfficialStates,
  officialDeviceFuels,
  stationName,
  parseExternalId,
  nextStep,
  outlookText,
  MAX_PRICE,
} from '../src/device.js';
import { FUEL_KEYS, fuelAvailable } from '../src/fuels.js';
import { parseOfficial, parseStations } from '../src/parse.js';
import { selectStations, summarize } from '../src/prices.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, PAGES, PREFIX } from './helpers/fixtures.js';

const LOCATION = { id: 'BE_lg_826', name: 'Liège', postalCode: '4000', country: 'BE' };
const [ESSO] = parseStations(PAGES['be-GO'], 'BE');

/**
 * @description Every device of the integration, in a language.
 * @param {string} language - The language.
 * @returns {object[]} The devices.
 */
const allDevices = (language) => [
  buildAreaDevice(fakeGladys, LOCATION, FUEL_KEYS, language),
  buildStationDevice(fakeGladys, ESSO, FUEL_KEYS, language),
  buildOfficialDevice(fakeGladys, 'BE', officialDeviceFuels('BE', FUEL_KEYS), language),
  buildOfficialDevice(fakeGladys, 'LU', officialDeviceFuels('LU', FUEL_KEYS), language),
];

test('every feature has min, max, read_only, has_feedback and a valid category / type', () => {
  const categories = Object.values(DEVICE_FEATURE_CATEGORIES);
  const units = Object.values(DEVICE_FEATURE_UNITS);
  for (const language of LANGUAGES) {
    for (const device of allDevices(language)) {
      assert.equal(device.should_poll, false, device.name);
      assert.equal(device.poll_frequency, undefined, device.name);
      assert.ok(device.external_id.startsWith(`${PREFIX}:`), device.external_id);
      assert.ok(device.name.trim(), 'a name');
      assert.ok(device.features.length > 0, device.name);
      const ids = device.features.map((feature) => feature.external_id);
      assert.equal(new Set(ids).size, ids.length, `${device.name}: unique feature ids`);
      for (const feature of device.features) {
        const label = `${device.name} / ${feature.name}`;
        for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
          assert.notEqual(feature[key], undefined, `${label}: ${key}`);
        }
        assert.ok(feature.external_id.startsWith(`${device.external_id}:`), label);
        assert.ok(categories.includes(feature.category), `${label}: ${feature.category}`);
        const typeKey = Object.keys(DEVICE_FEATURE_CATEGORIES).find(
          (key) => DEVICE_FEATURE_CATEGORIES[key] === feature.category,
        );
        assert.ok(
          Object.values(DEVICE_FEATURE_TYPES[typeKey] ?? {}).includes(feature.type),
          `${label}: ${feature.category} / ${feature.type}`,
        );
        if (feature.unit !== undefined) {
          assert.ok(units.includes(feature.unit), `${label}: ${feature.unit}`);
        }
        assert.equal(feature.read_only, true, label);
        assert.ok(feature.name.length <= 100, label);
      }
    }
  }
});

test('prices are currency / decimal in euros, 0 to 10; texts are text / text, 0 to 0', () => {
  for (const device of allDevices('en')) {
    for (const feature of device.features) {
      if (feature.category === DEVICE_FEATURE_CATEGORIES.CURRENCY) {
        assert.equal(feature.type, DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL);
        assert.equal(feature.unit, DEVICE_FEATURE_UNITS.EURO);
        assert.deepEqual([feature.min, feature.max], [0, MAX_PRICE]);
        assert.equal(feature.keep_history, true);
      } else {
        assert.equal(feature.category, DEVICE_FEATURE_CATEGORIES.TEXT, feature.name);
        assert.equal(feature.type, DEVICE_FEATURE_TYPES.TEXT.TEXT);
        assert.deepEqual([feature.min, feature.max], [0, 0]);
      }
    }
  }
});

test('names tell the devices apart, in every language', () => {
  for (const language of LANGUAGES) {
    const names = allDevices(language).map((device) => device.name);
    assert.equal(new Set(names).size, names.length, language);
    const features = allDevices(language)[0].features.map((feature) => feature.name);
    assert.equal(new Set(features).size, features.length, `area features ${language}`);
  }
  assert.equal(stationName(ESSO), 'Esso Liège');
  assert.equal(stationName({ name: 'Aral E25/A3', city: 'Berchem' }), 'Aral E25/A3 (Berchem)');
});

test('external ids: area code, country and station id, country; parsed back', () => {
  const [area, station, official] = allDevices('en');
  assert.equal(area.external_id, `${PREFIX}:area:be_lg_826`);
  assert.equal(station.external_id, `${PREFIX}:station:be-2430`);
  assert.equal(official.external_id, `${PREFIX}:official:be`);
  assert.deepEqual(parseExternalId(station.features[0].external_id), {
    type: 'station',
    key: 'be-2430',
  });
  assert.deepEqual(parseExternalId(`${PREFIX}:area:be_lg_826`), {
    type: 'area',
    key: 'be_lg_826',
  });
  assert.equal(parseExternalId('ext:other:thing:1'), null);
});

test('the official device covers the followed fuels the country sets a price for', () => {
  assert.deepEqual(officialDeviceFuels('BE', ['lpg', 'cng', 'e85', 'diesel_xtl']), [
    'lpg',
    'diesel_xtl',
  ]);
  assert.deepEqual(officialDeviceFuels('FR', FUEL_KEYS), []);
  assert.deepEqual(officialDeviceFuels('LU', ['sp95_e10', 'sp95_e5']), ['sp95_e5']);
  const luxembourg = buildOfficialDevice(fakeGladys, 'LU', ['diesel_b7'], 'fr');
  assert.equal(luxembourg.features.length, 1, 'today only');
  for (const fuel of FUEL_KEYS) {
    assert.ok(
      ['BE', 'FR', 'LU'].some((country) => fuelAvailable(fuel, country)),
      fuel,
    );
  }
});

test('states: valid prices only, the text of the cheapest station, the outlook', () => {
  const selected = selectStations(parseStations(PAGES['be-GO'], 'BE'), {
    fuel: 'diesel_b7',
    radius: 10,
    maxAge: 7,
    today: '2026-10-17',
  });
  const states = buildAreaStates(
    fakeGladys,
    LOCATION,
    {
      diesel_b7: { summary: summarize(selected.stations) },
      lpg: { summary: summarize([]) },
    },
    { language: 'en', radius: 10 },
  );
  assert.deepEqual(
    states.map((state) => state.device_feature_external_id.split(':').pop()),
    ['lowest_diesel_b7', 'average_diesel_b7', 'cheapest_diesel_b7', 'cheapest_lpg'],
  );
  assert.equal(states[3].text, 'No recent price within 10 km');
  assert.deepEqual(buildStationStates(fakeGladys, 'be-1', { lpg: 0, cng: 11, e85: 1.2 }), [
    { device_feature_external_id: `${PREFIX}:station:be-1:price_e85`, state: 1.2 },
  ]);
  const april = parseOfficial(PAGES['be-official-announced'], 'BE');
  const official = buildOfficialStates(fakeGladys, 'BE', april, ['diesel_b7'], 'fr');
  assert.deepEqual(
    official.map((state) => [
      state.device_feature_external_id.split(':').pop(),
      state.state ?? state.text,
    ]),
    [
      ['today_diesel_b7', 2.183],
      ['next_diesel_b7', 2.061],
      ['outlook_diesel_b7', 'Baisse annoncée le 22/04 : 2,061 €'],
    ],
  );
  const rising = {
    price: 2,
    next: [{ date: '2026-10-19', kind: 'forecast', price: null, trend: 'up' }],
  };
  const unknown = buildOfficialStates(fakeGladys, 'BE', { fuels: { lpg: rising } }, ['lpg'], 'en');
  assert.deepEqual(
    unknown.map((state) => state.device_feature_external_id.split(':').pop()),
    ['today_lpg', 'outlook_lpg'],
    'a change of unknown amount leaves the next price as it was',
  );
  assert.equal(outlookText(nextStep(rising), 'en'), 'Increase expected on 19/10');
  assert.equal(outlookText(nextStep({ price: 2, next: [] }), 'de'), 'Keine Prognose');
});
