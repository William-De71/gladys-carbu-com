// Every widget content passes the validator of the SDK (what the core would
// drop) and holds the card budget, in the four languages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildCheapestWidget,
  buildTrendWidget,
  buildOfficialWidget,
  messageContent,
  readCount,
  officialValue,
  LIST_COUNT,
  TREND_COLORS,
} from '../src/widgets.js';
import { parseStations, parseOfficial } from '../src/parse.js';
import { selectStations, summarize } from '../src/prices.js';
import { idsOf, DEVICE_TYPES } from '../src/device.js';
import { LANGUAGES, fuelName } from '../src/i18n.js';
import { PAGES, NOW, TZ, fakeGladys } from './helpers/fixtures.js';

const LOCATION = { id: 'BE_lg_826', name: 'Liège', postalCode: '4000', country: 'BE' };
const MAIN = ['chart', 'card-list', 'image'];

/**
 * @description Check a content: the validator, then the budget of a card.
 * @param {object} content - The widget content.
 * @param {string} label - For the messages.
 */
function assertValid(content, label) {
  assert.deepEqual(validateWidgetContent(content), [], label);
  const { components } = content;
  assert.ok(components.length <= 8, `${label}: ${components.length} components`);
  assert.ok(components.filter((c) => MAIN.includes(c.type)).length <= 1, `${label}: main`);
  assert.ok(components.filter((c) => ['value', 'gauge'].includes(c.type)).length <= 6, label);
  const texts = components.filter((c) => c.type === 'text');
  assert.ok(texts.length <= 2, `${label}: ${texts.length} texts`);
  assert.ok(texts.filter((c) => c.variant === 'body').length <= 1, `${label}: bodies`);
  assert.ok(content.ttl_seconds >= 10 && content.ttl_seconds <= 3600, label);
}

const dieselArea = () => {
  const selected = selectStations(parseStations(PAGES['be-GO'], 'BE'), {
    fuel: 'diesel_b7',
    radius: 10,
    maxAge: 7,
    today: '2026-10-17',
  });
  return { ...selected, summary: summarize(selected.stations) };
};

test('cheapest_stations: tiles, then the list, the cheapest in green', () => {
  const area = dieselArea();
  for (const language of LANGUAGES) {
    const content = buildCheapestWidget({
      fuel: 'diesel_b7',
      location: LOCATION,
      stations: area.stations,
      summary: area.summary,
      readAt: NOW,
      count: 8,
      radius: 10,
      today: '2026-10-17',
      language,
      timeZone: TZ,
    });
    assertValid(content, `cheapest_stations ${language}`);
    const [heading, lowest, average, list] = content.components;
    assert.equal(heading.text, `${fuelName('diesel_b7', language)} · Liège`);
    const decimal = (price) => price.toFixed(3).replace('.', ',');
    assert.equal(lowest.value, decimal(area.summary.lowest));
    assert.equal(average.value, decimal(area.summary.average));
    assert.equal(list.items.length, 8);
    for (const [index, item] of list.items.entries()) {
      const atLowest = area.stations[index].price === area.summary.lowest;
      assert.equal(item.badge.color, atLowest ? 'success' : 'neutral', item.title);
    }
    assert.equal(list.items.at(-1).badge.color, 'neutral');
    assert.ok(list.items.every((item) => item.links.length === 2));
    assert.ok(
      list.items.every((item) => item.date === undefined),
      'a date would hide the subtitle',
    );
    assert.match(content.components.at(-1).text, /^Carbu\.com · /);
  }
});

test('cheapest_stations: an old price says its date; no station is one body', () => {
  const area = dieselArea();
  const old = [{ ...area.stations[0], date: '2026-10-15' }];
  const content = buildCheapestWidget({
    fuel: 'diesel_b7',
    location: LOCATION,
    stations: old,
    summary: summarize(old),
    readAt: NOW,
    count: 5,
    radius: 10,
    today: '2026-10-17',
    language: 'fr',
    timeZone: TZ,
  });
  assert.match(content.components[3].items[0].subtitle, /prix du 15\/10/);
  for (const language of LANGUAGES) {
    const empty = buildCheapestWidget({
      fuel: 'lpg',
      location: LOCATION,
      stations: [],
      summary: summarize([]),
      readAt: NOW,
      count: 5,
      radius: 2,
      today: '2026-10-17',
      language,
      timeZone: TZ,
    });
    assertValid(empty, `empty ${language}`);
    assert.equal(empty.components.length, 2);
  }
});

test('price_trend: two live tiles and the chart of the area device', () => {
  const ids = idsOf(fakeGladys, DEVICE_TYPES.AREA, LOCATION.id);
  for (const language of LANGUAGES) {
    const content = buildTrendWidget({
      fuel: 'diesel_b7',
      ids,
      location: LOCATION,
      interval: 'last-week',
      language,
    });
    assertValid(content, `price_trend ${language}`);
    const chart = content.components.find((c) => c.type === 'chart');
    assert.deepEqual(chart.device_features, [
      ids.feature('lowest_diesel_b7'),
      ids.feature('average_diesel_b7'),
    ]);
    assert.equal(chart.interval, 'last-week');
  }
  const fallback = buildTrendWidget({
    fuel: 'diesel_b7',
    ids,
    location: LOCATION,
    interval: 'forever',
    language: 'en',
  });
  assert.equal(fallback.components.find((c) => c.type === 'chart').interval, 'last-month');
});

test('official_prices: Belgium with an announcement, Luxembourg today only', () => {
  const april = parseOfficial(PAGES['be-official-announced'], 'BE');
  const october = parseOfficial(PAGES['be-official'], 'BE');
  const luxembourg = parseOfficial(PAGES['lu-official'], 'LU');
  for (const language of LANGUAGES) {
    for (const [country, table, fuels] of [
      ['BE', april, ['diesel_b7', 'diesel_xtl', 'sp95_e10', 'lpg']],
      ['BE', october, ['diesel_b7', 'sp95_e10', 'lpg']],
      ['LU', luxembourg, ['diesel_b7', 'sp95_e5', 'sp98_e5', 'lpg']],
      ['BE', october, ['e85']],
    ]) {
      const content = buildOfficialWidget({
        country,
        table,
        fuels,
        readAt: NOW,
        language,
        timeZone: TZ,
      });
      assertValid(content, `official ${country} ${table.date} ${language}`);
    }
  }
  const content = buildOfficialWidget({
    country: 'BE',
    table: april,
    fuels: ['diesel_b7', 'diesel_xtl'],
    readAt: NOW,
    language: 'fr',
    timeZone: TZ,
  });
  const [diesel, hvo] = content.components[1].items;
  assert.equal(diesel.value, '2,183 € → 2,061 € (22/04)');
  assert.equal(diesel.color, TREND_COLORS.down);
  assert.equal(hvo.color, TREND_COLORS.up);
  assert.match(content.components[2].text, /annoncés par le gouvernement/);
});

test('official values: a forecast is marked ~, an unknown amount is a word', () => {
  const entry = {
    price: 2,
    next: [{ date: '2026-10-19', kind: 'forecast', price: null, trend: 'up' }],
  };
  assert.deepEqual(officialValue(entry, 'BE', 'en'), {
    value: '2,000 € → ~up (19/10)',
    color: 'danger',
  });
  assert.deepEqual(officialValue({ price: 2, next: [] }, 'LU', 'en'), {
    value: '2,000 €',
    color: 'neutral',
  });
});

test('a message content; the bounded count', () => {
  assertValid(messageContent('Hello'), 'message');
  assert.equal(readCount(undefined, LIST_COUNT), LIST_COUNT.default);
  assert.equal(readCount('42', LIST_COUNT), LIST_COUNT.max);
  assert.equal(readCount(0, LIST_COUNT), LIST_COUNT.min);
});
