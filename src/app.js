// -----------------------------------------------------------------------------
// The Carbu.com integration: every handler, registered on a Gladys client.
//
// Brings the fuel prices of Carbu.com (Belgium, France, Luxembourg) into
// Gladys, around one locality (a postal code):
//   - devices (device.js): the area — lowest and average price, cheapest
//     station, per followed fuel —, the stations the user picks among the
//     cheapest, and the official prices (Belgian maximum prices with what the
//     government announced and Carbu.com expects; Luxembourg official prices);
//   - scene triggers (events.js): new cheapest station, price change at a
//     station, official price changed, announced, expected;
//   - scene actions: the cheapest station of a fuel, the official prices of
//     a fuel;
//   - dashboard widgets (widgets.js): cheapest stations, price trend,
//     official prices.
//
// Carbu.com has no push and no API: the pages are read on the integration's
// own timer (every hour by default, 30 min to 4 h), never on a Gladys poll;
// one page per followed fuel, plus the official table in Belgium and
// Luxembourg. The locality is resolved once and kept in /data.
// Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  readFuels,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import { createCarbuClient } from './carbu-api.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { FUEL_KEYS, fuelAvailable, gradeMatches, officialFuels } from './fuels.js';
import { fold } from './parse.js';
import { selectStations, summarize, priceText } from './prices.js';
import {
  DEVICE_TYPES,
  idsOf,
  parseExternalId,
  buildAreaDevice,
  buildAreaStates,
  buildStationDevice,
  buildStationStates,
  officialDeviceFuels,
  buildOfficialDevice,
  buildOfficialStates,
} from './device.js';
import {
  TRIGGERS,
  detectCheapest,
  cheapestData,
  detectStationPrices,
  stationPriceData,
  detectOfficial,
  cheapestStationOutputs,
  officialPricesOutputs,
  pick,
  CHEAPEST_STATION_OUTPUTS,
  OFFICIAL_PRICES_OUTPUTS,
} from './events.js';
import {
  WIDGETS,
  LIST_COUNT,
  messageContent,
  readCount,
  buildCheapestWidget,
  buildTrendWidget,
  buildOfficialWidget,
} from './widgets.js';
import { defaultTimeZone, localClock, formatTime, MINUTE_MS, DAY_MS } from './time.js';
import { t, all, fuelName, LANGUAGES } from './i18n.js';

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  DIAGNOSTIC: 'diagnostic',
};
const SCENE_ACTIONS = {
  GET_CHEAPEST_STATION: 'get_cheapest_station',
  GET_OFFICIAL_PRICES: 'get_official_prices',
};
// A locality resolved is asked again after this long (an area code is stable).
const LOCATION_MAX_AGE_MS = 30 * DAY_MS;
// A fuel read for a widget or an action only (not followed) is kept this long.
const EXTRA_MAX_AGE_MS = 30 * MINUTE_MS;
// After a failed reading, try again sooner than the interval.
const RETRY_MS = 10 * MINUTE_MS;
// The most stations the Discovery screen offers at once.
const MAX_OFFERED = 40;
const DIAGNOSTIC_CHUNK = 3000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - HTTP transport (tests).
 * @param {string} [options.baseUrl] - The site root (tests).
 * @param {string} [options.storePath] - The file kept in /data.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {string} [options.timeZone] - IANA timezone (TZ by default).
 * @param {boolean} [options.timers] - Arm the reading timer (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timeZone = defaultTimeZone(),
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`. French
  // until a widget is shown: the language of Carbu.com in the three countries.
  let language = 'fr';
  let createdDevices = new Set();
  let createdFeatures = new Set();
  // The resolved locality, the other ones of the postal code, and why none.
  let location = null;
  let candidates = [];
  let locationError = null;
  let townMissing = false;
  // fuel -> { stations (as read), readAt, error } of the followed fuels.
  let readings = {};
  // fuel -> { stations, readAt } of fuels read for a widget or an action only.
  const extras = new Map();
  // The official table of the country.
  let official = { table: null, readAt: 0, error: null };
  let lastRead = 0;
  let lastStatus = null;
  let lastDiscovery = null;
  let readTimer = null;
  let retryTimer = null;
  let reading = null;
  let stopped = false;

  const api = createCarbuClient({
    now,
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  const store = createStore({ path: storePath, logger });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description The local date of now.
   * @returns {string} `YYYY-MM-DD`.
   */
  const today = () => localClock(now(), timeZone).date;

  /**
   * @description The followed fuels Carbu.com lists in the country.
   * @returns {string[]} Fuel keys.
   */
  const followedFuels = () => config.fuels.filter((fuel) => fuelAvailable(fuel, config.country));

  /**
   * @description The followed fuels Carbu.com does not list in the country.
   * @returns {string[]} Fuel keys.
   */
  const unsupportedFuels = () =>
    config.fuels.filter((fuel) => !fuelAvailable(fuel, config.country));

  /**
   * @description Whether the country has official prices.
   * @returns {boolean} True in Belgium and Luxembourg.
   */
  const hasOfficial = () => officialFuels(config.country).length > 0;

  /**
   * @description The message of an error, for a user.
   * @param {Error} err - The error.
   * @param {string} lang - The language.
   * @returns {string} The message.
   */
  function errorText(err, lang) {
    if (err?.kind === 'blocked') {
      return t('errorBlocked', lang, { detail: err.message });
    }
    if (err?.kind === 'invalid') {
      return t('errorInvalid', lang);
    }
    return t('errorUnreachable', lang, { detail: String(err?.message ?? '').slice(0, 60) });
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Work out the connection status from the last readings.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (!config.postalCode) {
      await reportStatus(false, all('statusNoPostalCode'));
      return;
    }
    if (!location) {
      await reportStatus(
        false,
        locationError && locationError.kind !== 'not_found'
          ? all('statusUnreachable', (l) => ({
              detail: errorText(locationError, l),
              minutes: RETRY_MS / MINUTE_MS,
            }))
          : all('statusUnknownPostalCode', {
              postal: config.postalCode,
              country: config.country,
            }),
      );
      return;
    }
    const fuels = followedFuels();
    const errors = fuels.map((fuel) => readings[fuel]?.error).filter(Boolean);
    if (fuels.length > 0 && errors.length === fuels.length) {
      await reportStatus(
        false,
        all('statusUnreachable', (l) => ({
          detail: errorText(errors[0], l),
          minutes: RETRY_MS / MINUTE_MS,
        })),
      );
      return;
    }
    const notes = (l) =>
      [
        townMissing ? t('statusTownMissing', l, { town: config.town.slice(0, 40) }) : '',
        unsupportedFuels().length
          ? t('statusUnsupported', l, {
              fuels: unsupportedFuels()
                .map((fuel) => fuelName(fuel, l))
                .join(', '),
              country: config.country,
            })
          : '',
        errors.length ? t('statusPartial', l, { count: errors.length }) : '',
      ]
        .filter(Boolean)
        .map((note) => ` ${note}`)
        .join('');
    await reportStatus(
      true,
      Object.fromEntries(
        LANGUAGES.map((l) => [
          l,
          `${t('statusConnected', l, {
            place: `${location.name} (${location.postalCode})`,
            count: fuels.length,
            time: formatTime(lastRead, timeZone),
          })}${notes(l)}`.slice(0, 500),
        ]),
      ),
    );
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
      createdFeatures = new Set(
        devices.flatMap((device) => (device.features ?? []).map((feature) => feature.external_id)),
      );
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widgets to pull their content again.
   * @param {string[]} keys - The widget keys.
   */
  function refreshWidgets(keys) {
    for (const key of keys) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  /**
   * @description Publish scene events, one by one.
   * @param {Array<{ key: string, data: object }>} events - The events.
   * @returns {Promise<void>}
   */
  async function publishEvents(events) {
    for (const { key, data } of events) {
      logger.info(`${key}: ${data.fuel} ${data.station_name ?? data.direction ?? ''}`);
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Unable to fire ${key}: ${err.message}`);
      }
    }
  }

  /**
   * @description Publish states, only for the features the user created.
   * @param {object[]} states - The states.
   * @returns {Promise<void>}
   */
  async function publishStates(states) {
    const known = states.filter((state) => createdFeatures.has(state.device_feature_external_id));
    if (known.length === 0) {
      return;
    }
    await gladys
      .publishChangedStates(known)
      .catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));
  }

  // --- The locality --------------------------------------------------------------------

  /**
   * @description Choose the locality of the postal code.
   * @param {object[]} found - The localities of the postal code.
   * @param {string} town - The town typed, '' when none.
   * @returns {{ location: object|null, missing: boolean }} The locality; `missing`
   * when the town typed is not among them.
   */
  function chooseLocation(found, town) {
    if (found.length === 0) {
      return { location: null, missing: false };
    }
    const wanted = fold(town);
    if (wanted) {
      const match =
        found.find((item) => fold(item.name) === wanted) ??
        found.find((item) => fold(item.name).startsWith(wanted)) ??
        found.find((item) => fold(item.name).includes(wanted));
      if (match) {
        return { location: match, missing: false };
      }
    }
    // The main locality of a postal code shares its name with its area
    // (4000: Liège, not Glain), else the first one.
    const main = found.find((item) => fold(item.name) === fold(item.region)) ?? found[0];
    return { location: main, missing: Boolean(wanted) };
  }

  /**
   * @description Resolve the configured locality (kept in /data).
   * @param {boolean} [force] - Ask Carbu.com even when known.
   * @returns {Promise<void>}
   */
  async function resolveLocation(force = false) {
    if (!config.postalCode) {
      location = null;
      candidates = [];
      locationError = null;
      return;
    }
    const cacheKey = `${config.country}|${config.postalCode}`;
    const cached = store.data.locations[cacheKey];
    let found = cached?.list;
    if (force || !Array.isArray(found) || now() - (cached.at ?? 0) > LOCATION_MAX_AGE_MS) {
      try {
        found = await api.locations(config.postalCode, config.country);
        store.data.locations[cacheKey] = { at: now(), list: found };
        await store.save();
      } catch (err) {
        logger.warn(`Carbu.com locality search (${err.kind ?? 'error'}): ${err.message}`);
        if (!Array.isArray(found)) {
          location = null;
          locationError = err;
          return;
        }
      }
    }
    candidates = found;
    const chosen = chooseLocation(found, config.town);
    location = chosen.location;
    townMissing = chosen.missing;
    locationError = location ? null : { kind: 'not_found', message: 'no locality' };
  }

  // --- Readings ------------------------------------------------------------------------

  /**
   * @description The kept stations of a fuel and its summary, from a reading.
   * @param {string} fuel - The fuel key.
   * @param {object[]} stations - The stations as read.
   * @returns {{ stations: object[], outside: number, stale: number, summary: object }} The area.
   */
  function areaOf(fuel, stations) {
    const selected = selectStations(stations, {
      fuel,
      radius: config.radius,
      maxAge: config.maxAge,
      today: today(),
    });
    return { ...selected, summary: summarize(selected.stations) };
  }

  /**
   * @description The areas of the followed fuels read without error.
   * @returns {object} fuel -> areaOf().
   */
  function currentAreas() {
    return Object.fromEntries(
      followedFuels()
        .filter((fuel) => readings[fuel] && !readings[fuel].error)
        .map((fuel) => [fuel, areaOf(fuel, readings[fuel].stations)]),
    );
  }

  /**
   * @description The stations as read of a fuel, the grade checked.
   * @param {string} fuel - The fuel key.
   * @returns {object[]} The stations.
   */
  const stationsOf = (fuel) =>
    (readings[fuel]?.stations ?? []).filter(
      (station) => !station.fuelName || gradeMatches(fuel, station.fuelName),
    );

  /**
   * @description The stations the Discovery screen offers: the cheapest of each
   * followed fuel, with the followed fuels each sells.
   * @param {object} areas - currentAreas().
   * @returns {Array<{ station: object, fuels: string[] }>} The stations.
   */
  function offeredStations(areas) {
    if (config.stationCount === 0) {
      return [];
    }
    const offered = new Map();
    for (const [, area] of Object.entries(areas)) {
      for (const station of area.stations.slice(0, config.stationCount)) {
        if (!offered.has(station.key) && offered.size < MAX_OFFERED) {
          offered.set(station.key, station);
        }
      }
    }
    return [...offered.values()].map((station) => ({
      station,
      fuels: followedFuels().filter((fuel) =>
        stationsOf(fuel).some((item) => item.key === station.key),
      ),
    }));
  }

  /**
   * @description Offer the area, the cheapest stations and the official prices
   * on the Discovery screen, when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const fuels = followedFuels();
    const devices = [];
    if (location && fuels.length > 0) {
      devices.push(buildAreaDevice(gladys, location, fuels, lang));
    }
    const officialList = officialDeviceFuels(config.country, fuels);
    if (officialList.length > 0) {
      devices.push(buildOfficialDevice(gladys, config.country, officialList, lang));
    }
    const stations = offeredStations(currentAreas())
      .filter(({ fuels: sold }) => sold.length > 0)
      .map(({ station, fuels: sold }) => ({
        station,
        device: buildStationDevice(gladys, station, sold, lang),
      }));
    // Two stations of the same name (two "Shell Express Schaerbeek"): their
    // street tells them apart.
    for (const { station, device } of stations) {
      const twins = stations.filter((other) => other.device.name === device.name).length;
      devices.push(
        twins > 1 && station.street
          ? { ...device, name: `${device.name} – ${station.street}` }
          : device,
      );
    }
    const signature = JSON.stringify(devices);
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  /**
   * @description The prices of the stations the user added, from the last readings.
   * @returns {object} station key -> fuel -> price.
   */
  function addedStationPrices() {
    const prices = {};
    for (const externalId of createdDevices) {
      const parsed = parseExternalId(externalId);
      if (parsed?.type !== DEVICE_TYPES.STATION) {
        continue;
      }
      for (const fuel of followedFuels()) {
        if (readings[fuel]?.error || !readings[fuel]) {
          continue;
        }
        const station = stationsOf(fuel).find((item) => item.key === parsed.key);
        if (station) {
          prices[parsed.key] = { ...(prices[parsed.key] ?? {}), [fuel]: station.price };
        }
      }
    }
    return prices;
  }

  /**
   * @description The last reading of a station, whatever the fuel.
   * @param {string} key - The station key.
   * @returns {object|null} The station.
   */
  function stationByKey(key) {
    for (const fuel of followedFuels()) {
      const station = stationsOf(fuel).find((item) => item.key === key);
      if (station) {
        return station;
      }
    }
    return null;
  }

  /**
   * @description Publish the states of every device the user created.
   * @returns {Promise<void>}
   */
  async function publishAllStates() {
    const lang = textLanguage();
    const states = [];
    if (location) {
      states.push(
        ...buildAreaStates(gladys, location, currentAreas(), {
          language: lang,
          radius: config.radius,
        }),
      );
    }
    for (const [key, prices] of Object.entries(addedStationPrices())) {
      states.push(...buildStationStates(gladys, key, prices));
    }
    if (official.table) {
      states.push(
        ...buildOfficialStates(
          gladys,
          config.country,
          official.table,
          officialDeviceFuels(config.country, followedFuels()),
          lang,
        ),
      );
    }
    await publishStates(states);
  }

  /**
   * @description What follows a reading: events, states, devices, widgets.
   * @returns {Promise<void>}
   */
  async function digest() {
    const events = [];
    // Disconnected, an event would be lost while remembered as fired.
    if (gladys.connected !== false && location) {
      const areas = currentAreas();
      const cheapest = detectCheapest({
        areas,
        seen: store.data.seen.cheapest,
        areaId: location.id,
      });
      store.data.seen.cheapest = cheapest.seen;
      events.push(
        ...cheapest.changes.map((change) => ({
          key: TRIGGERS.CHEAPEST_STATION_CHANGED,
          data: cheapestData(change),
        })),
      );
      const stations = detectStationPrices({
        prices: addedStationPrices(),
        seen: store.data.seen.stations,
      });
      store.data.seen.stations = stations.seen;
      events.push(
        ...stations.changes.map((change) => ({
          key: TRIGGERS.STATION_PRICE_CHANGED,
          data: stationPriceData(
            change,
            stationByKey(change.key) ?? { name: change.key },
            idsOf(gladys, DEVICE_TYPES.STATION, change.key).device,
          ),
        })),
      );
      if (official.table && !official.error) {
        const result = detectOfficial({
          country: config.country,
          table: official.table,
          fuels: officialFuels(config.country),
          seen: store.data.seen.official,
        });
        store.data.seen.official = result.seen;
        events.push(...result.events);
      }
      await store.save();
    }
    await publishEvents(events);
    await publishAllStates();
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
    refreshWidgets(Object.values(WIDGETS));
  }

  /**
   * @description Read every followed fuel and the official table (one reading
   * round at a time).
   * @returns {Promise<void>}
   */
  function readAll() {
    if (!reading) {
      reading = (async () => {
        clearTimeout(retryTimer);
        if (!location) {
          await resolveLocation();
        }
        let failed = Boolean(locationError && locationError.kind !== 'not_found');
        if (location) {
          for (const fuel of followedFuels()) {
            try {
              readings[fuel] = { stations: await api.stations(location, fuel), readAt: now() };
            } catch (err) {
              failed = true;
              logger.warn(`Carbu.com ${fuel} (${err.kind ?? 'error'}): ${err.message}`);
              readings[fuel] = { ...(readings[fuel] ?? { stations: [] }), error: err };
            }
          }
          if (hasOfficial()) {
            try {
              official = { table: await api.official(config.country), readAt: now(), error: null };
            } catch (err) {
              failed = true;
              logger.warn(`Carbu.com official prices (${err.kind ?? 'error'}): ${err.message}`);
              official = { ...official, error: err };
            }
          }
          lastRead = now();
          await digest();
        }
        await refreshStatus();
        if (failed && timers && !stopped) {
          retryTimer = setTimeout(() => {
            readAll().catch((err) => logger.error('Reading', err));
          }, RETRY_MS);
          retryTimer.unref?.();
        }
      })().finally(() => {
        reading = null;
      });
    }
    return reading;
  }

  /**
   * @description The stations of a fuel for a widget or an action: the last
   * reading of a followed fuel, else a fresh one kept 30 minutes.
   * @param {string} fuel - The fuel key.
   * @returns {Promise<{ stations: object[], readAt: number }>} The stations as read.
   */
  async function stationsFor(fuel) {
    if (followedFuels().includes(fuel) && readings[fuel] && !readings[fuel].error) {
      return readings[fuel];
    }
    const kept = extras.get(fuel);
    if (kept && now() - kept.readAt <= EXTRA_MAX_AGE_MS) {
      return kept;
    }
    const fresh = { stations: await api.stations(location, fuel), readAt: now() };
    extras.set(fuel, fresh);
    return fresh;
  }

  /**
   * @description The official table for a widget or an action.
   * @returns {Promise<object>} `{ table, readAt }`.
   */
  async function officialFor() {
    if (official.table && now() - official.readAt <= config.interval * MINUTE_MS) {
      return official;
    }
    official = { table: await api.official(config.country), readAt: now(), error: null };
    return official;
  }

  // --- Timers --------------------------------------------------------------------------

  /**
   * @description (Re)arm the reading timer.
   */
  function schedule() {
    clearInterval(readTimer);
    if (!timers || stopped) {
      return;
    }
    readTimer = setInterval(() => {
      readAll().catch((err) => logger.error('Reading', err));
    }, config.interval * MINUTE_MS);
    readTimer.unref?.();
  }

  /**
   * @description Resolve the locality, read everything, offer the devices.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    location = null;
    readings = {};
    extras.clear();
    official = { table: null, readAt: 0, error: null };
    await resolveLocation();
    logger.info(
      `Locality: ${location ? `${location.name} (${location.postalCode}, ${location.id})` : 'none'}; ` +
        `fuels: ${followedFuels().join(', ') || 'none'}` +
        (unsupportedFuels().length ? `; not listed: ${unsupportedFuels().join(', ')}` : ''),
    );
    await readAll();
    schedule();
  }

  // --- Dashboard widgets ---------------------------------------------------------------

  /**
   * @description The fuel a widget or an action asks for.
   * @param {unknown} raw - The setting or field.
   * @returns {string|null} A fuel listed in the country: the one asked, else the
   * first followed one.
   */
  function fuelFor(raw) {
    const asked = typeof raw === 'string' && FUEL_KEYS.includes(raw) ? raw : null;
    if (asked) {
      return fuelAvailable(asked, config.country) ? asked : null;
    }
    return followedFuels()[0] ?? null;
  }

  gladys.onWidgetGet(WIDGETS.CHEAPEST_STATIONS, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!location) {
      return messageContent(t(config.postalCode ? 'widgetNoLocality' : 'widgetNoPostalCode', lang));
    }
    const fuel = fuelFor(settings.fuel);
    if (!fuel) {
      return messageContent(
        t('widgetFuelNotListed', lang, {
          fuel: fuelName(settings.fuel, lang),
          country: config.country,
        }),
      );
    }
    try {
      const read = await stationsFor(fuel);
      const area = areaOf(fuel, read.stations);
      return buildCheapestWidget({
        fuel,
        location,
        stations: area.stations,
        summary: area.summary,
        readAt: read.readAt,
        count: readCount(settings.count, LIST_COUNT),
        radius: config.radius,
        today: today(),
        language: lang,
        timeZone,
      });
    } catch (err) {
      logger.warn(`Widget: unable to read the prices: ${err.message}`);
      return messageContent(errorText(err, lang), 60);
    }
  });

  gladys.onWidgetGet(WIDGETS.PRICE_TREND, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!location) {
      return messageContent(t(config.postalCode ? 'widgetNoLocality' : 'widgetNoPostalCode', lang));
    }
    const fuel = fuelFor(settings.fuel);
    const ids = idsOf(gladys, DEVICE_TYPES.AREA, location.id);
    if (!fuel || !followedFuels().includes(fuel)) {
      return messageContent(t('widgetFuelNotFollowed', lang));
    }
    if (!createdFeatures.has(ids.feature(`lowest_${fuel}`))) {
      return messageContent(t('widgetAddArea', lang, { name: `${location.name}` }));
    }
    return buildTrendWidget({ fuel, ids, location, interval: settings.interval, language: lang });
  });

  gladys.onWidgetGet(WIDGETS.OFFICIAL_PRICES, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!hasOfficial()) {
      return messageContent(t('officialNotInCountry', lang));
    }
    try {
      const current = await officialFor();
      const followed = officialDeviceFuels(config.country, config.fuels);
      const wanted = readFuels(settings.fuels ?? []);
      const fromSettings =
        Array.isArray(settings.fuels) && settings.fuels.length
          ? wanted.filter((fuel) => officialFuels(config.country).includes(fuel))
          : [];
      const fuels = fromSettings.length
        ? fromSettings
        : followed.length
          ? followed
          : officialFuels(config.country);
      return buildOfficialWidget({
        country: config.country,
        table: current.table,
        fuels,
        readAt: current.readAt,
        language: lang,
        timeZone,
      });
    } catch (err) {
      logger.warn(`Widget: unable to read the official prices: ${err.message}`);
      return messageContent(errorText(err, lang), 60);
    }
  });

  // --- Scene actions -------------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_CHEAPEST_STATION, async (fields = {}) => {
    if (!location) {
      throw new Error('No Carbu.com locality: set the postal code');
    }
    const fuel = fuelFor(fields.fuel);
    if (!fuel) {
      throw new Error(`Carbu.com does not list ${fields.fuel} in ${config.country}`);
    }
    const read = await stationsFor(fuel);
    const distance = Number(fields.max_distance);
    const maxDistance =
      fields.max_distance === undefined ||
      fields.max_distance === null ||
      fields.max_distance === ''
        ? null
        : Number.isFinite(distance) && distance > 0
          ? distance
          : null;
    return pick(
      cheapestStationOutputs(areaOf(fuel, read.stations).stations, maxDistance),
      CHEAPEST_STATION_OUTPUTS,
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_OFFICIAL_PRICES, async (fields = {}) => {
    if (!hasOfficial()) {
      return pick({ available: false }, OFFICIAL_PRICES_OUTPUTS);
    }
    const fuel = typeof fields.fuel === 'string' ? fields.fuel : '';
    const current = await officialFor();
    return pick(officialPricesOutputs(current.table.fuels[fuel] ?? null), OFFICIAL_PRICES_OUTPUTS);
  });

  // --- Configuration screen actions ----------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!config.postalCode) {
      return all('statusNoPostalCode');
    }
    await resolveLocation(true);
    if (!location) {
      await refreshStatus();
      return locationError?.kind === 'not_found'
        ? all('statusUnknownPostalCode', { postal: config.postalCode, country: config.country })
        : all('testError', (l) => ({ error: errorText(locationError, l) }));
    }
    const messages = [
      all('testLocality', {
        place: `${location.name} (${location.postalCode})`,
        others:
          candidates
            .filter((item) => item.id !== location.id)
            .map((item) => item.name)
            .join(', ') || '–',
      }),
    ];
    readings = {};
    await readAll();
    for (const fuel of followedFuels()) {
      const read = readings[fuel];
      if (!read || read.error) {
        messages.push(
          all('testFuelError', (l) => ({
            fuel: fuelName(fuel, l),
            error: errorText(read?.error, l),
          })),
        );
        continue;
      }
      const area = areaOf(fuel, read.stations);
      messages.push(
        all('testFuel', (l) => ({
          fuel: fuelName(fuel, l),
          count: area.summary.count,
          lowest: priceText(area.summary.lowest),
          station: area.summary.cheapest?.name ?? '–',
          stale: area.stale,
        })),
      );
    }
    if (unsupportedFuels().length) {
      messages.push(
        all('statusUnsupported', (l) => ({
          fuels: unsupportedFuels()
            .map((fuel) => fuelName(fuel, l))
            .join(', '),
          country: config.country,
        })),
      );
    }
    if (hasOfficial()) {
      messages.push(
        official.error
          ? all('testOfficialError', (l) => ({ error: errorText(official.error, l) }))
          : all('testOfficial', { count: Object.keys(official.table?.fuels ?? {}).length }),
      );
    }
    return Object.fromEntries(
      LANGUAGES.map((l) => [
        l,
        messages
          .map((entry) => entry[l])
          .join(' · ')
          .slice(0, 1000),
      ]),
    );
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const report = {
      version: VERSION,
      timeZone: timeZone ?? null,
      config: { ...config },
      location,
      candidates: candidates.map((item) => `${item.id} ${item.name}`),
      locationError: locationError?.message ?? null,
      lastRead: lastRead ? new Date(lastRead).toISOString() : null,
      fuels: Object.fromEntries(
        Object.entries(readings).map(([fuel, read]) => {
          const area = areaOf(fuel, read.stations ?? []);
          return [
            fuel,
            {
              readAt: read.readAt ? new Date(read.readAt).toISOString() : null,
              read: read.stations?.length ?? 0,
              kept: area.summary.count,
              outside: area.outside,
              stale: area.stale,
              lowest: area.summary.lowest,
              average: area.summary.average,
              cheapest: area.summary.cheapest?.key ?? null,
              error: read.error?.message ?? null,
            },
          ];
        }),
      ),
      official: {
        date: official.table?.date ?? null,
        fuels: official.table ? Object.keys(official.table.fuels) : [],
        error: official.error?.message ?? null,
      },
      created: [...createdDevices],
      seen: store.data.seen,
      requests: api.requests,
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `Carbu.com diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -------------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    if (!location || now() - lastRead > config.interval * MINUTE_MS) {
      await readAll();
    }
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // The prices of a station just added are its baseline: a change fires from
    // the next reading on.
    store.data.seen.stations = detectStationPrices({
      prices: addedStationPrices(),
      seen: store.data.seen.stations,
    }).seen;
    await store.save();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishAllStates();
    refreshWidgets(Object.values(WIDGETS));
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -------------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    await loadConfig(rawConfig);
    lastDiscovery = null;
    logger.info('Configuration updated');
    await applyConfig();
  });

  // --- Connection lifecycle ------------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown ---------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(readTimer);
    clearTimeout(retryTimer);
    await store.save();
  });

  return {
    store,
    api,
    readAll,
    applyConfig,
    getConfig: () => config,
    getLocation: () => location,
    getReadings: () => readings,
    getOfficial: () => official,
    currentAreas,
    whenReady: () => startup,
  };
}

export { createApp, ACTIONS, SCENE_ACTIONS, LOCATION_MAX_AGE_MS, RETRY_MS, MAX_OFFERED };
