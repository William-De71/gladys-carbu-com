// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "Carbu.com <locality> (<postal code>)": the area. Read-only features, per
// followed fuel:
//   - `lowest_<fuel>`    currency (€): the lowest price within the radius;
//   - `average_<fuel>`   currency (€): the average price within the radius;
//   - `cheapest_<fuel>`  text: "Shell Express Liège · 2,274 € · 1,3 km".
//
// "<station name>": a station, offered among the cheapest of each fuel (the
// `stations` setting). Read-only features, per followed fuel it sells:
//   - `price_<fuel>`     currency (€): its price.
//
// "Belgian maximum fuel prices" / "Luxembourg official fuel prices": the
// prices the state sets, per followed fuel it covers:
//   - `today_<fuel>`     currency (€): today's price;
//   - `next_<fuel>`      currency (€), Belgium only: the price announced for
//                        the next day, else the one Carbu.com expects;
//   - `outlook_<fuel>`   text, Belgium only: "Decrease announced on 22/04".
//
// External ids: the Carbu.com area code (`area:be_lg_826`), the country and
// id of a station (`station:be-2430`), the country (`official:be`); feature
// keys hold our fuel keys (fuels.js), never a label of Carbu.com.
// `should_poll` stays false: the integration reads on its own timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t, fuelName } from './i18n.js';
import { fuelAvailable, officialFuels } from './fuels.js';
import { priceText, distanceText } from './prices.js';
import { shortDate } from './time.js';

const DEVICE_TYPES = { AREA: 'area', STATION: 'station', OFFICIAL: 'official' };
const FEATURE_PREFIXES = {
  LOWEST: 'lowest',
  AVERAGE: 'average',
  CHEAPEST: 'cheapest',
  PRICE: 'price',
  TODAY: 'today',
  NEXT: 'next',
  OUTLOOK: 'outlook',
};
// Euros per litre: a price above it would be a reading error.
const MAX_PRICE = 10;
const TEXT_MAX = 250;
const MODEL = 'Carbu.com';

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - DEVICE_TYPES.
 * @param {string} key - The area code, the station key or the country.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, type, key) => gladys.externalIds(type, String(key).toLowerCase());

/**
 * @description What a device external id stands for.
 * @param {unknown} externalId - A device (or feature) external id.
 * @returns {{ type: string, key: string }|null} The type and key.
 * @example
 * parseExternalId('ext:carbu-com:station:be-2430'); // -> { type: 'station', key: 'be-2430' }
 */
function parseExternalId(externalId) {
  // A feature id ends with ":<feature key>": the device key stops before it.
  const match = /:(area|station|official):([a-z0-9_-]+)(?::[a-z0-9_]+)?$/.exec(
    String(externalId ?? ''),
  );
  return match ? { type: match[1], key: match[2] } : null;
}

/**
 * @description A read-only feature.
 * @param {object} feature - Its fields.
 * @returns {object} The feature.
 */
const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});

const priceShape = {
  category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
  type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
  unit: DEVICE_FEATURE_UNITS.EURO,
  min: 0,
  max: MAX_PRICE,
};
const textShape = {
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  keep_history: false,
  min: 0,
  max: 0,
};

/**
 * @description A price state, when the price is valid.
 * @param {string} externalId - The feature external id.
 * @param {number|null} price - Euros per litre.
 * @returns {object[]} Zero or one state.
 */
const priceState = (externalId, price) =>
  Number.isFinite(price) && price > 0 && price <= MAX_PRICE
    ? [{ device_feature_external_id: externalId, state: price }]
    : [];

/**
 * @description The name of the area device.
 * @param {object} location - `{ name, postalCode }`.
 * @returns {string} "Carbu.com Liège (4000)".
 */
const areaName = (location) => `${MODEL} ${location.name} (${location.postalCode})`;

/**
 * @description Build the area device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} location - The resolved locality `{ id, name, postalCode, country }`.
 * @param {string[]} fuels - The followed fuels, available in the country.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildAreaDevice(gladys, location, fuels, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.AREA, location.id);
  return {
    name: areaName(location),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [
      { name: 'CARBU_COUNTRY', value: location.country },
      { name: 'CARBU_LOCALITY', value: `${location.postalCode} ${location.name}` },
    ],
    features: fuels.flatMap((fuel) => {
      const name = fuelName(fuel, language);
      return [
        sensor({
          name: t('featureLowest', language, { fuel: name }),
          external_id: ids.feature(`${FEATURE_PREFIXES.LOWEST}_${fuel}`),
          ...priceShape,
        }),
        sensor({
          name: t('featureAverage', language, { fuel: name }),
          external_id: ids.feature(`${FEATURE_PREFIXES.AVERAGE}_${fuel}`),
          ...priceShape,
        }),
        sensor({
          name: t('featureCheapest', language, { fuel: name }),
          external_id: ids.feature(`${FEATURE_PREFIXES.CHEAPEST}_${fuel}`),
          ...textShape,
        }),
      ];
    }),
  };
}

/**
 * @description The cheapest station in one line.
 * @param {object|null} station - The station.
 * @param {object} options - `{ language, radius }`.
 * @returns {string} "Shell Express Liège · 2,274 € · 1,3 km".
 */
function cheapestText(station, { language, radius }) {
  if (!station) {
    return t('noPriceWithin', language, { radius });
  }
  return [station.name, priceText(station.price), distanceText(station.distance)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * @description The states of the area device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} location - The resolved locality.
 * @param {object} areas - fuel -> `{ summary }` of the last reading (fuels
 * read with an error are absent: their states stay).
 * @param {object} options - `{ language, radius }`.
 * @returns {object[]} The states.
 */
function buildAreaStates(gladys, location, areas, { language, radius }) {
  const ids = idsOf(gladys, DEVICE_TYPES.AREA, location.id);
  return Object.entries(areas).flatMap(([fuel, { summary }]) => [
    ...priceState(ids.feature(`${FEATURE_PREFIXES.LOWEST}_${fuel}`), summary.lowest),
    ...priceState(ids.feature(`${FEATURE_PREFIXES.AVERAGE}_${fuel}`), summary.average),
    {
      device_feature_external_id: ids.feature(`${FEATURE_PREFIXES.CHEAPEST}_${fuel}`),
      text: cheapestText(summary.cheapest, { language, radius }).slice(0, TEXT_MAX),
    },
  ]);
}

/**
 * @description The name of a station device: its Carbu.com name, with its
 * town when the name does not hold it.
 * @param {object} station - The station.
 * @returns {string} "Esso Liège", "Aral Berchem".
 */
function stationName(station) {
  const fold = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  return station.city && !fold(station.name).includes(fold(station.city))
    ? `${station.name} (${station.city})`
    : station.name;
}

/**
 * @description Build a station device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} station - The station (parseStations).
 * @param {string[]} fuels - The followed fuels it sells.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildStationDevice(gladys, station, fuels, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.STATION, station.key);
  const params = [
    { name: 'CARBU_COUNTRY', value: station.country },
    { name: 'CARBU_STATION_ID', value: station.id },
  ];
  if (station.brand) {
    params.push({ name: 'CARBU_BRAND', value: station.brand });
  }
  const address = [station.street, `${station.postalCode} ${station.city}`.trim()]
    .filter(Boolean)
    .join(', ');
  if (address) {
    params.push({ name: 'CARBU_ADDRESS', value: address.slice(0, 200) });
  }
  return {
    name: stationName(station),
    external_id: ids.device,
    model: station.brand ? `${MODEL} · ${station.brand}` : MODEL,
    should_poll: false,
    params,
    features: fuels.map((fuel) =>
      sensor({
        name: t('featurePrice', language, { fuel: fuelName(fuel, language) }),
        external_id: ids.feature(`${FEATURE_PREFIXES.PRICE}_${fuel}`),
        ...priceShape,
      }),
    ),
  };
}

/**
 * @description The states of a station device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} key - The station key ("be-2430").
 * @param {object} prices - fuel -> its price at the station.
 * @returns {object[]} The states.
 */
function buildStationStates(gladys, key, prices) {
  const ids = idsOf(gladys, DEVICE_TYPES.STATION, key);
  return Object.entries(prices).flatMap(([fuel, price]) =>
    priceState(ids.feature(`${FEATURE_PREFIXES.PRICE}_${fuel}`), price),
  );
}

/**
 * @description The fuels of the official device: the followed ones the
 * country sets a price for.
 * @param {string} country - BE, FR or LU.
 * @param {string[]} fuels - The followed fuels.
 * @returns {string[]} The fuels (none in France).
 */
const officialDeviceFuels = (country, fuels) =>
  fuels.filter((fuel) => officialFuels(country).includes(fuel) && fuelAvailable(fuel, country));

/**
 * @description Build the official price device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} country - BE or LU.
 * @param {string[]} fuels - officialDeviceFuels().
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildOfficialDevice(gladys, country, fuels, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.OFFICIAL, country);
  const announces = country === 'BE';
  return {
    name: t(announces ? 'officialDeviceNameBE' : 'officialDeviceNameLU', language),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [{ name: 'CARBU_COUNTRY', value: country }],
    features: fuels.flatMap((fuel) => {
      const name = fuelName(fuel, language);
      const features = [
        sensor({
          name: t(announces ? 'featureMaxToday' : 'featureOfficialToday', language, {
            fuel: name,
          }),
          external_id: ids.feature(`${FEATURE_PREFIXES.TODAY}_${fuel}`),
          ...priceShape,
        }),
      ];
      if (announces) {
        features.push(
          sensor({
            name: t('featureMaxNext', language, { fuel: name }),
            external_id: ids.feature(`${FEATURE_PREFIXES.NEXT}_${fuel}`),
            ...priceShape,
          }),
          sensor({
            name: t('featureOutlook', language, { fuel: name }),
            external_id: ids.feature(`${FEATURE_PREFIXES.OUTLOOK}_${fuel}`),
            ...textShape,
          }),
        );
      }
      return features;
    }),
  };
}

/**
 * @description What the official table says of the next days, for a fuel:
 * the price the government announced if any, else Carbu.com's forecast.
 * @param {object} entry - `{ price, next }` of parseOfficial().
 * @returns {{ date: string|null, kind: string|null, price: number|null, trend: string|null }}
 * The next step; `trend` is `up`, `down`, `same` or null (unknown).
 */
function nextStep(entry) {
  const official = (entry?.next ?? []).filter((step) => step.kind === 'official');
  const changed = official.find((step) => step.trend === 'up' || step.trend === 'down');
  const forecast = (entry?.next ?? []).find((step) => step.kind === 'forecast');
  const step = changed ?? official.at(-1) ?? forecast ?? null;
  if (!step) {
    return { date: null, kind: null, price: null, trend: null };
  }
  return { date: step.date, kind: step.kind, price: step.price, trend: step.trend };
}

/**
 * @description The outlook of a fuel in words.
 * @param {object} step - nextStep().
 * @param {string} language - The language.
 * @returns {string} "Decrease announced on 22/04: 2,061 €".
 */
function outlookText(step, language) {
  if (!step.trend) {
    return t('outlookUnknown', language);
  }
  const key = `outlook_${step.kind}_${step.trend}`;
  return t(key, language, { date: shortDate(step.date), price: priceText(step.price) });
}

/**
 * @description The states of the official price device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} country - BE or LU.
 * @param {object} table - parseOfficial().
 * @param {string[]} fuels - officialDeviceFuels().
 * @param {string} language - Language of the texts.
 * @returns {object[]} The states.
 */
function buildOfficialStates(gladys, country, table, fuels, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.OFFICIAL, country);
  return fuels.flatMap((fuel) => {
    const entry = table?.fuels?.[fuel];
    if (!entry) {
      return [];
    }
    const states = [...priceState(ids.feature(`${FEATURE_PREFIXES.TODAY}_${fuel}`), entry.price)];
    if (country === 'BE') {
      const step = nextStep(entry);
      // Nothing announced: today's price stays. A change of unknown amount
      // leaves the feature as it was.
      const next =
        step.price ?? (step.trend === 'up' || step.trend === 'down' ? null : entry.price);
      states.push(...priceState(ids.feature(`${FEATURE_PREFIXES.NEXT}_${fuel}`), next), {
        device_feature_external_id: ids.feature(`${FEATURE_PREFIXES.OUTLOOK}_${fuel}`),
        text: outlookText(step, language).slice(0, TEXT_MAX),
      });
    }
    return states;
  });
}

export {
  DEVICE_TYPES,
  FEATURE_PREFIXES,
  MAX_PRICE,
  MODEL,
  idsOf,
  parseExternalId,
  areaName,
  buildAreaDevice,
  cheapestText,
  buildAreaStates,
  stationName,
  buildStationDevice,
  buildStationStates,
  officialDeviceFuels,
  buildOfficialDevice,
  nextStep,
  outlookText,
  buildOfficialStates,
};
