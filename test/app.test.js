// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a fake
// Carbu.com serving real (reduced) pages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { fakeCarbu, storePath, silent, NOW, TZ, PREFIX, PAGES } from './helpers/fixtures.js';

const CONFIG = {
  country: 'BE',
  postal_code: '4000',
  fuels: ['diesel_b7', 'sp95_e10'],
  radius: '10',
  max_age: '7',
  stations: '3',
  interval: '60',
  language: 'fr',
};
const AREA = `${PREFIX}:area:be_lg_826`;
const OFFICIAL = `${PREFIX}:official:be`;
const MINUTE = 60 * 1000;

/**
 * @description The integration, connected to a fake Gladys and a fake site.
 * @param {object} [options] - `{ config, site, path }`.
 * @returns {Promise<object>} `{ gladys, app, site, clock, path }`.
 */
async function startApp({ config = CONFIG, site = fakeCarbu(), path = storePath() } = {}) {
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: site,
    storePath: path,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, site, clock, path };
}

const offered = (gladys, externalId) =>
  gladys.fake.discoveredDevices.find((device) => device.external_id === externalId);
const create = async (gladys, externalId) => {
  const device = offered(gladys, externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

/**
 * @description Change the price of a station in a page of the fake site.
 * @param {object} site - The fake site.
 * @param {string} page - The page name.
 * @param {string} id - The station id.
 * @param {string} price - The new price.
 */
function setPrice(site, page, id, price) {
  site.state.pages[page] = site.state.pages[page].replace(
    new RegExp(`(id="item_${id}"[\\s\\S]*?data-price=")[^"]*"`),
    `$1${price}"`,
  );
}

test('Liège: the area, the official prices and the cheapest stations are offered', async (t) => {
  const { gladys, site } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const devices = gladys.fake.discoveredDevices;
  assert.equal(devices[0].external_id, AREA);
  assert.equal(devices[0].name, 'Carbu.com Liège (4000)');
  assert.deepEqual(
    devices[0].features.map((feature) => feature.external_id.split(':').pop()),
    [
      'lowest_diesel_b7',
      'average_diesel_b7',
      'cheapest_diesel_b7',
      'lowest_sp95_e10',
      'average_sp95_e10',
      'cheapest_sp95_e10',
    ],
  );
  assert.equal(devices[1].external_id, OFFICIAL);
  assert.equal(devices[1].name, 'Carbu.com prix maximums belges');
  assert.equal(devices[1].features.length, 6, 'today, next and outlook of both fuels');
  const stations = devices.filter((device) => device.external_id.includes(':station:'));
  assert.ok(stations.length >= 3 && stations.length <= 6, `${stations.length} stations`);
  assert.ok(stations.every((device) => device.features.length >= 1));
  assert.ok(devices.every((device) => device.should_poll === false));
  // One locality search, one list per fuel, one official table.
  assert.deepEqual(
    site.calls.map((call) => call.page),
    ['location-4000', 'be-GO', 'be-E10', 'be-official'],
  );
  assert.match(site.calls[1].headers['user-agent'], /^gladys-carbu-com\/\d+\.\d+\.\d+ \(\+https:/);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(
    gladys.fake.connectionStatus.message.fr,
    /^Liège \(4000\) : 2 carburant\(s\) suivi\(s\), prix lus à 20:00\.$/,
  );
});

test('states go to the created devices only, all of them again on creation', async (t) => {
  const { gladys, app } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.states.length, 0, 'no device created yet');
  await create(gladys, AREA);
  const area = app.currentAreas().diesel_b7.summary;
  assert.equal(gladys.fake.lastState(`${AREA}:lowest_diesel_b7`), area.lowest);
  assert.equal(gladys.fake.lastState(`${AREA}:average_diesel_b7`), area.average);
  assert.match(String(gladys.fake.lastState(`${AREA}:cheapest_diesel_b7`)), / · \d,\d{3} € · /);
  await create(gladys, OFFICIAL);
  assert.equal(gladys.fake.lastState(`${OFFICIAL}:today_diesel_b7`), 2.444);
  assert.equal(gladys.fake.lastState(`${OFFICIAL}:next_diesel_b7`), 2.444);
  assert.equal(gladys.fake.lastState(`${OFFICIAL}:outlook_diesel_b7`), 'Inchangé prévu le 19/10');
  assert.ok(
    gladys.fake.states.every((state) => !state.device_feature_external_id.includes(':station:')),
  );
});

test('a station added: its price change and a new cheapest station fire once', async (t) => {
  const { gladys, app, site, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const cheapest = app.currentAreas().diesel_b7.summary.cheapest;
  const second = app.currentAreas().diesel_b7.stations[1];
  const stationId = `${PREFIX}:station:${second.key}`;
  await create(gladys, stationId);
  assert.equal(gladys.fake.lastState(`${stationId}:price_diesel_b7`), second.price);

  setPrice(site, 'be-GO', second.id, (cheapest.price - 0.05).toFixed(3));
  clock.now += 60 * MINUTE;
  await app.readAll();
  const [changed] = eventsOf(gladys, TRIGGERS.STATION_PRICE_CHANGED);
  assert.equal(changed.data.station, stationId);
  assert.equal(changed.data.fuel, 'diesel_b7');
  assert.equal(changed.data.direction, 'down');
  const [lead] = eventsOf(gladys, TRIGGERS.CHEAPEST_STATION_CHANGED);
  assert.equal(lead.data.station_name, second.name);
  assert.equal(lead.data.previous_station_name, cheapest.name);
  assert.equal(gladys.fake.lastState(`${stationId}:price_diesel_b7`), cheapest.price - 0.05);

  clock.now += 60 * MINUTE;
  await app.readAll();
  assert.equal(eventsOf(gladys, TRIGGERS.STATION_PRICE_CHANGED).length, 1, 'never twice');
  assert.equal(eventsOf(gladys, TRIGGERS.CHEAPEST_STATION_CHANGED).length, 1);
});

test('a restart remembers what fired: no event replays', async (t) => {
  const path = storePath();
  const site = fakeCarbu();
  const first = await startApp({ site, path });
  const [, next] = first.app.currentAreas().diesel_b7.stations;
  setPrice(site, 'be-GO', next.id, '1.500');
  await first.app.readAll();
  assert.equal(eventsOf(first.gladys, TRIGGERS.CHEAPEST_STATION_CHANGED).length, 1);
  await first.gladys.fake.shutdown();
  const second = await startApp({ site, path });
  t.after(() => second.gladys.fake.shutdown());
  assert.equal(second.gladys.fake.sceneEvents.length, 0);
});

test('the government announces a decrease: one event per fuel', async (t) => {
  const { gladys, app, site } = await startApp({
    config: { ...CONFIG, fuels: ['diesel_b7', 'diesel_xtl', 'sp95_e10'] },
  });
  t.after(() => gladys.fake.shutdown());
  site.state.pages['be-official'] = PAGES['be-official-announced'];
  await app.readAll();
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.OFFICIAL_PRICE_ANNOUNCED).map((event) => [
      event.data.fuel,
      event.data.direction,
      event.data.new_price,
    ]),
    [
      ['diesel_b7', 'down', 2.061],
      ['diesel_b10', 'down', 2.052],
      ['diesel_xtl', 'up', 3.557],
    ],
  );
  await app.readAll();
  assert.equal(eventsOf(gladys, TRIGGERS.OFFICIAL_PRICE_ANNOUNCED).length, 3);
});

test('widgets: cheapest stations, the trend once the area exists, official prices', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const get = async (key, settings = {}, language = 'en') => {
    const ack = await gladys.fake.widgetGet(key, { settings, language });
    assert.equal(ack.success, true, ack.error);
    assert.deepEqual(validateWidgetContent(ack.data.content), [], key);
    return ack.data.content;
  };
  const cheapest = await get(WIDGETS.CHEAPEST_STATIONS, { fuel: 'sp95_e10', count: 3 });
  assert.equal(cheapest.components[0].text, 'Super 95 (E10) · Liège');
  assert.equal(cheapest.components.find((c) => c.type === 'card-list').items.length, 3);
  const before = await get(WIDGETS.PRICE_TREND, { fuel: 'diesel_b7' });
  assert.match(before.components[0].text, /Discovery tab/);
  await create(gladys, AREA);
  const trend = await get(WIDGETS.PRICE_TREND, { fuel: 'diesel_b7' }, 'fr');
  assert.ok(trend.components.some((c) => c.type === 'chart'));
  const official = await get(WIDGETS.OFFICIAL_PRICES, {}, 'de');
  assert.equal(official.components[1].items.length, 2, 'the followed fuels');
  const every = await get(WIDGETS.OFFICIAL_PRICES, { fuels: ['lpg', 'diesel_xtl'] });
  assert.deepEqual(
    every.components[1].items.map((item) => item.label),
    ['LPG', 'Diesel XTL / HVO'],
  );
  const notListed = await get(WIDGETS.CHEAPEST_STATIONS, { fuel: 'e85' });
  assert.match(notListed.components[0].text, /does not list E85/);
  assert.ok(gladys.fake.widgetRefreshes.length > 0, 'refreshed after the reading');
});

test('scene actions: the cheapest station, a fuel not followed, the official prices', async (t) => {
  const { gladys, app, site } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const action = async (key, fields) => {
    const ack = await gladys.fake.sceneAction(key, fields);
    assert.equal(ack.success, true, ack.error);
    return ack.data.outputs;
  };
  const cheapest = await action(SCENE_ACTIONS.GET_CHEAPEST_STATION, { fuel: 'diesel_b7' });
  const area = app.currentAreas().diesel_b7.summary;
  assert.equal(cheapest.found, true);
  assert.equal(cheapest.station_name, area.cheapest.name);
  assert.equal(cheapest.price, area.lowest);
  assert.equal(cheapest.station_count, area.count);
  const calls = site.calls.length;
  const lpg = await action(SCENE_ACTIONS.GET_CHEAPEST_STATION, { fuel: 'lpg', max_distance: 5 });
  assert.deepEqual(lpg, { found: false, station_count: 0 }, 'no LPG page in the fixtures');
  await action(SCENE_ACTIONS.GET_CHEAPEST_STATION, { fuel: 'lpg' });
  assert.equal(site.calls.length, calls + 1, 'a fuel read on demand is kept 30 minutes');
  const official = await action(SCENE_ACTIONS.GET_OFFICIAL_PRICES, { fuel: 'diesel_b7' });
  assert.deepEqual(official, {
    available: true,
    today_price: 2.444,
    next_price: 2.444,
    next_date: '2026-10-19',
    trend: 'same',
    announced: false,
  });
  const failed = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_CHEAPEST_STATION, {
    fuel: 'e85',
  });
  assert.equal(failed.success, false);
});

test('Configuration screen: test the connection, diagnostic', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const test = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(test.success, true);
  assert.match(test.data.message.fr, /^Localité : Liège \(4000\) \(autres : Glain, Rocourt\)/);
  assert.match(test.data.message.fr, /Diesel \(B7\) : \d+ station\(s\), dès \d,\d{3} €/);
  assert.match(test.data.message.en, /Official prices: 7 fuel\(s\)/);
  for (const text of Object.values(test.data.message)) {
    assert.ok(text.length <= 1000);
  }
  const diagnostic = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.match(diagnostic.data.message.en, /Diagnostic written/);
});

test('a town of the postal code; a town that is not one keeps the main locality', async (t) => {
  const rocourt = await startApp({ config: { ...CONFIG, town: 'rocourt' } });
  t.after(() => rocourt.gladys.fake.shutdown());
  assert.equal(rocourt.app.getLocation().id, 'BE_lg_827');
  const wrong = await startApp({ config: { ...CONFIG, town: 'Namur' } });
  t.after(() => wrong.gladys.fake.shutdown());
  assert.equal(wrong.app.getLocation().name, 'Liège');
  assert.match(
    wrong.gladys.fake.connectionStatus.message.en,
    /“Namur” is not among the localities/,
  );
});

test('France: no official prices, E85 listed, old prices set aside', async (t) => {
  const { gladys, app } = await startApp({
    config: { country: 'FR', postal_code: '71100', fuels: ['sp95_e10', 'sp95_e5', 'diesel_xtl'] },
  });
  t.after(() => gladys.fake.shutdown());
  assert.equal(app.getLocation().name, 'Chalon-sur-Saône');
  assert.equal(offered(gladys, `${PREFIX}:official:fr`), undefined);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /Not listed in this country \(FR\): Diesel XTL/,
  );
  const e5 = app.currentAreas().sp95_e5;
  assert.ok(e5.stations.every((station) => /E5/.test(station.fuelName)));
  const ack = await gladys.fake.widgetGet(WIDGETS.OFFICIAL_PRICES, { language: 'fr' });
  assert.match(ack.data.content.components[0].text, /Belgique et le Luxembourg/);
});

test('Luxembourg: official prices of today, an empty list is no error', async (t) => {
  const { gladys } = await startApp({
    config: { country: 'LU', postal_code: '1009', fuels: ['diesel_b7', 'diesel_b10'] },
  });
  t.after(() => gladys.fake.shutdown());
  const official = offered(gladys, `${PREFIX}:official:lu`);
  assert.deepEqual(
    official.features.map((feature) => feature.external_id.split(':').pop()),
    ['today_diesel_b7'],
  );
  await create(gladys, `${PREFIX}:official:lu`);
  assert.equal(gladys.fake.lastState(`${PREFIX}:official:lu:today_diesel_b7`), 2.081);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  await create(gladys, `${PREFIX}:area:lu_lx_2879`);
  assert.equal(
    gladys.fake.lastState(`${PREFIX}:area:lu_lx_2879:cheapest_diesel_b10`),
    'Aucun prix récent dans un rayon de 10 km',
  );
});

test('no postal code, an unknown one, Carbu.com down or refusing', async (t) => {
  const empty = await startApp({ config: { country: 'BE' } });
  t.after(() => empty.gladys.fake.shutdown());
  assert.equal(empty.gladys.fake.connectionStatus.connected, false);
  assert.match(empty.gladys.fake.connectionStatus.message.en, /Enter the postal code/);
  assert.equal(empty.site.calls.length, 0);

  const unknown = await startApp({ config: { ...CONFIG, postal_code: '9999' } });
  t.after(() => unknown.gladys.fake.shutdown());
  assert.match(
    unknown.gladys.fake.connectionStatus.message.fr,
    /aucune localité au code postal 9999/,
  );

  const down = fakeCarbu();
  down.state.fail = 'network';
  const offline = await startApp({ site: down });
  t.after(() => offline.gladys.fake.shutdown());
  assert.equal(offline.gladys.fake.connectionStatus.connected, false);
  assert.match(
    offline.gladys.fake.connectionStatus.message.en,
    /cannot be reached \(ECONNREFUSED\)/,
  );

  const site = fakeCarbu();
  const refusing = await startApp({ site });
  t.after(() => refusing.gladys.fake.shutdown());
  site.state.fail = 429;
  await refusing.app.readAll();
  assert.equal(refusing.gladys.fake.connectionStatus.connected, false);
  assert.match(
    refusing.gladys.fake.connectionStatus.message.en,
    /refused the request \(HTTP 429\)/,
  );
  site.state.fail = null;
  await refusing.app.readAll();
  assert.equal(refusing.gladys.fake.connectionStatus.connected, true);
});

test('a configuration change reads again and offers the new devices', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await gladys.fake.configUpdated({ ...CONFIG, fuels: ['diesel_b7'], stations: '0' });
  const devices = gladys.fake.discoveredDevices.map((device) => device.external_id);
  assert.deepEqual(devices, [AREA, OFFICIAL]);
});

test('two stations of the same name are told apart by their street', async (t) => {
  const site = fakeCarbu();
  // Every station of the list takes the same name.
  site.state.pages['be-GO'] = PAGES['be-GO'].replace(/data-name="[^"]*"/g, 'data-name="Station"');
  const { gladys } = await startApp({
    site,
    config: { ...CONFIG, fuels: ['diesel_b7'], stations: '5' },
  });
  t.after(() => gladys.fake.shutdown());
  const names = gladys.fake.discoveredDevices
    .filter((device) => device.external_id.includes(':station:'))
    .map((device) => device.name);
  assert.equal(names.length, 5);
  assert.equal(new Set(names).size, 5, names.join(' | '));
  // Only the true twins (same name and town) get their street.
  assert.ok(names.includes('Station (Angleur)'), names.join(' | '));
  assert.equal(names.filter((name) => name.includes(' – ')).length, 3, names.join(' | '));
});
