// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets for Liège (4000) on Saturday 17 October 2026:
//   - cheapest_stations: the real Diesel list of Carbu.com read that evening
//     (test/fixtures/be-liege-GO.html) through the real parser, filters and
//     builder;
//   - price_trend: the builder points at the area device; Gladys would draw
//     the history it keeps. Here the tiles take the prices of that reading
//     and the history is made up (a seeded random walk: the same image at
//     every run);
//   - official_prices: the real maximum prices of that day, with a made-up
//     decrease of the Diesel prices announced for Monday 19 October (a real
//     announcement looks the same: test/fixtures/be-official-announced.nl.html).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildCheapestWidget, buildTrendWidget, buildOfficialWidget } = await load('src/widgets.js');
const { parseStations, parseOfficial } = await load('src/parse.js');
const { selectStations, summarize } = await load('src/prices.js');
const { buildAreaDevice, idsOf, DEVICE_TYPES } = await load('src/device.js');
const { LANGUAGES } = await load('src/i18n.js');
const page = (name) => readFileSync(`${repo}/test/fixtures/${name}`, 'utf8');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Saturday 17 October 2026, 20:00 in Brussels.
const NOW = Date.parse('2026-10-17T18:00:00Z');
const TZ = 'Europe/Brussels';
const TODAY = '2026-10-17';
const LOCATION = { id: 'BE_lg_826', name: 'Liège', postalCode: '4000', country: 'BE' };
const gladys = {
  externalIds: (type, id) => ({
    device: `ext:carbu-com:${type}:${id}`,
    feature: (key) => `ext:carbu-com:${type}:${id}:${key}`,
  }),
};

const selected = selectStations(parseStations(page('be-liege-GO.html'), 'BE'), {
  fuel: 'diesel_b7',
  radius: 10,
  maxAge: 7,
  today: TODAY,
});
const summary = summarize(selected.stations);

const official = parseOfficial(page('be-official.html'), 'BE');
for (const [fuel, price] of [
  ['diesel_b7', 2.401],
  ['diesel_b10', 2.395],
]) {
  official.fuels[fuel].next = [{ date: '2026-10-19', kind: 'official', price, trend: 'down' }];
}

// A seeded random walk around the prices of the reading, one point a day.
let seed = 20261017;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const history = (end, days) => {
  const values = [end];
  for (let day = 1; day < days; day += 1) {
    const step = random() < 0.35 ? (random() - 0.55) * 0.06 : 0;
    values.unshift(Math.round((values[0] - step) * 1000) / 1000);
  }
  return values.map((v, index) => ({
    t: new Date(NOW - (days - 1 - index) * 24 * 3600 * 1000).toISOString(),
    v,
  }));
};
const lowestHistory = history(summary.lowest, 31);
const averageHistory = lowestHistory.map((point, index) => ({
  t: point.t,
  v:
    Math.round(
      (point.v + (summary.average - summary.lowest) + Math.sin(index / 4) * 0.008) * 1000,
    ) / 1000,
}));

/**
 * @description What the Gladys front shows for a device-bound content: the
 * live tiles take the last state, the chart the history.
 * @param {object} content - The content of buildTrendWidget.
 * @param {string} language - The language.
 * @returns {object} The content, with values and inline series.
 */
function resolveDeviceFeatures(content, language) {
  const device = buildAreaDevice(gladys, LOCATION, ['diesel_b7'], language);
  const nameOf = (id) => device.features.find((feature) => feature.external_id === id)?.name;
  const ids = idsOf(gladys, DEVICE_TYPES.AREA, LOCATION.id);
  const values = {
    [ids.feature('lowest_diesel_b7')]: { state: summary.lowest, points: lowestHistory },
    [ids.feature('average_diesel_b7')]: { state: summary.average, points: averageHistory },
  };
  return {
    ...content,
    components: content.components.map((component) => {
      if (component.type === 'value' && component.device_feature) {
        const { device_feature: feature, ...rest } = component;
        return { ...rest, value: values[feature].state, unit: '€' };
      }
      if (component.type === 'chart' && component.device_features) {
        const { device_features: features, ...rest } = component;
        return {
          ...rest,
          series: features.map((feature) => ({
            name: nameOf(feature),
            points: values[feature].points,
          })),
        };
      }
      return component;
    }),
  };
}

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    cheapest_stations: buildCheapestWidget({
      fuel: 'diesel_b7',
      location: LOCATION,
      stations: selected.stations,
      summary,
      readAt: NOW,
      count: 5,
      radius: 10,
      today: TODAY,
      language,
      timeZone: TZ,
    }),
    price_trend: resolveDeviceFeatures(
      buildTrendWidget({
        fuel: 'diesel_b7',
        ids: idsOf(gladys, DEVICE_TYPES.AREA, LOCATION.id),
        location: LOCATION,
        interval: 'last-month',
        language,
      }),
      language,
    ),
    official_prices: buildOfficialWidget({
      country: 'BE',
      table: official,
      fuels: ['diesel_b7', 'diesel_b10', 'sp95_e10', 'sp98_e5', 'lpg'],
      readAt: NOW,
      language,
      timeZone: TZ,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
