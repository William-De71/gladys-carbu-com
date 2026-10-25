// The manifest against the code: the keys it declares are the ones the code
// handles, the store limits hold, the transport and permissions are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { TRIGGERS, CHEAPEST_STATION_OUTPUTS, OFFICIAL_PRICES_OUTPUTS } from '../src/events.js';
import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, LIST_COUNT, TREND_INTERVALS, DEFAULT_TREND_INTERVAL } from '../src/widgets.js';
import {
  AUTO_LANGUAGE,
  INTERVALS,
  DEFAULT_INTERVAL,
  RADII,
  DEFAULT_RADIUS,
  MAX_AGES,
  DEFAULT_MAX_AGE,
  STATION_COUNTS,
  DEFAULT_STATION_COUNT,
  DEFAULT_FUELS,
  INTERNAL_KEYS,
} from '../src/config.js';
import { FUEL_KEYS, COUNTRIES, officialFuels } from '../src/fuels.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const OFFICIAL = [...new Set([...officialFuels('BE'), ...officialFuels('LU')])];

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'Carbu.com');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-carbu-com:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-carbu-com/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-carbu-com');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('declares the cloud transport only: the pages of carbu.com', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  assert.match(source('../src/carbu-api.js'), /'https:\/\/carbu\.com'/);
});

test('requires the Gladys of widgets and scenes; no permission', () => {
  assert.equal(manifest.gladys_version, '>=5.1.1');
  assert.deepEqual(manifest.categories, ['transport', 'energy']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  // A widget button form would need 5.2.0; a houses source too.
  assert.doesNotMatch(source('../src/widgets.js'), /type: 'button'/);
  assert.doesNotMatch(JSON.stringify(manifest), /"source": ?"houses"/);
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
});

test('the configuration of the code: country, postal code, fuels, choices and defaults', () => {
  const config = byKey(manifest.config_schema);
  assert.deepEqual(values(config.get('country')), COUNTRIES);
  assert.equal(config.get('postal_code').type, 'string');
  assert.equal(config.get('postal_code').required, true);
  assert.equal(config.get('town').type, 'string');
  const fuels = config.get('fuels');
  assert.equal(fuels.type, 'multi_select');
  assert.deepEqual(values(fuels), FUEL_KEYS);
  assert.deepEqual(fuels.default, DEFAULT_FUELS);
  for (const [key, choices, fallback] of [
    ['radius', RADII, DEFAULT_RADIUS],
    ['max_age', MAX_AGES, DEFAULT_MAX_AGE],
    ['stations', STATION_COUNTS, DEFAULT_STATION_COUNT],
    ['interval', INTERVALS, DEFAULT_INTERVAL],
  ]) {
    assert.deepEqual(values(config.get(key)), choices.map(String), key);
    assert.equal(config.get(key).default, String(fallback), key);
  }
  assert.equal(config.get(INTERNAL_KEYS.language), undefined, 'internal key, never shown');
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password', 'secret'].includes(field.type), `${field.key}: ${field.type}`);
    assert.equal(field.display_if, undefined, field.key);
    if (field.placeholder) {
      assert.deepEqual(Object.keys(field.placeholder).sort(), [...LANGUAGES].sort(), field.key);
    }
  }
});

test('the fuel and direction filters are the values the events and actions carry', () => {
  const directions = ['up', 'down'];
  for (const trigger of manifest.scene_triggers) {
    const fields = byKey(trigger.fields);
    const fuels = values(fields.get('fuel'));
    const official = trigger.key.startsWith('official_');
    assert.deepEqual(fuels, official ? FUEL_KEYS.filter((f) => OFFICIAL.includes(f)) : FUEL_KEYS);
    if (fields.has('direction')) {
      assert.deepEqual(values(fields.get('direction')), directions, trigger.key);
    }
    for (const key of fields.keys()) {
      assert.ok(
        byKey(trigger.variables).has(key) || key === 'station',
        `${trigger.key}: the filter ${key} is a key of the event`,
      );
    }
  }
  const station = byKey(byKey(manifest.scene_triggers).get(TRIGGERS.STATION_PRICE_CHANGED).fields);
  assert.equal(station.get('station').source, 'devices');
  const actions = byKey(manifest.scene_actions);
  assert.deepEqual(
    actions.get(SCENE_ACTIONS.GET_CHEAPEST_STATION).outputs.map((output) => output.key),
    CHEAPEST_STATION_OUTPUTS,
  );
  assert.deepEqual(
    actions.get(SCENE_ACTIONS.GET_OFFICIAL_PRICES).outputs.map((output) => output.key),
    OFFICIAL_PRICES_OUTPUTS,
  );
  const widgets = byKey(manifest.widgets);
  const count = byKey(widgets.get(WIDGETS.CHEAPEST_STATIONS).settings).get('count');
  assert.deepEqual(
    [count.min, count.max, count.default],
    [LIST_COUNT.min, LIST_COUNT.max, LIST_COUNT.default],
  );
  const interval = byKey(widgets.get(WIDGETS.PRICE_TREND).settings).get('interval');
  assert.deepEqual(values(interval), TREND_INTERVALS);
  assert.equal(interval.default, DEFAULT_TREND_INTERVAL);
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok(
      (action.fields ?? []).length <= 10 && (action.outputs ?? []).length <= 20,
      action.key,
    );
  }
  for (const widget of manifest.widgets) {
    assert.ok((widget.settings ?? []).length <= 10);
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});
