// -----------------------------------------------------------------------------
// Dashboard widgets of the Carbu.com integration.
//
//   - `cheapest_stations`  the cheapest stations of the area for a fuel: two
//                          tiles (lowest and average price), then the list
//                          — name, address, distance, price, a tap opens the
//                          station on Carbu.com or on a map;
//   - `price_trend`        the history of the lowest and average prices of a
//                          fuel, drawn by Gladys from the area device (once
//                          the user added it);
//   - `official_prices`    Belgium: today's maximum prices and what comes
//                          next (announced by the government or expected by
//                          Carbu.com); Luxembourg: today's official prices.
// Every content credits Carbu.com and the time of the reading.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, fuelName } from './i18n.js';
import { priceText, distanceText, mapUrl } from './prices.js';
import { nextStep, FEATURE_PREFIXES } from './device.js';
import { formatTime, shortDate } from './time.js';

const WIDGETS = {
  CHEAPEST_STATIONS: 'cheapest_stations',
  PRICE_TREND: 'price_trend',
  OFFICIAL_PRICES: 'official_prices',
};

const TTL_SECONDS = { prices: 600, trend: 1800, official: 1800, message: 300 };
const LIST_COUNT = { min: 1, max: 8, default: 5 };
const TREND_INTERVALS = ['last-week', 'last-month', 'last-three-months', 'last-year'];
const DEFAULT_TREND_INTERVAL = 'last-month';
const MAX_STATUS_ITEMS = 10;
const TREND_COLORS = {
  up: WIDGET_COLORS.DANGER,
  down: WIDGET_COLORS.SUCCESS,
  same: WIDGET_COLORS.PRIMARY,
};

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('Total Énergies Liège Centre', 12); // -> 'Total Énerg…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description Read a bounded integer setting.
 * @param {unknown} raw - The raw setting.
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 */
function readCount(raw, bounds) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return { ttl_seconds: ttl, components: [{ type: 'text', variant: 'body', text: message }] };
}

/**
 * @description A price for a tile, to the tenth of a cent: a number would be
 * rounded to two decimals by the dashboard. A decimal comma in every language,
 * like the prices of the list (the three countries write it so).
 * @param {number|null} price - Euros per litre.
 * @returns {string} "2,266".
 */
const tileValue = (price) => (Number.isFinite(price) ? price.toFixed(3).replace('.', ',') : '–');

/**
 * @description The "cheapest_stations" widget.
 * @param {object} options - Options.
 * @param {string} options.fuel - The fuel key.
 * @param {object} options.location - The locality `{ name, postalCode }`.
 * @param {object[]} options.stations - The kept stations, cheapest first.
 * @param {object} options.summary - summarize().
 * @param {number} options.readAt - When they were read (ms).
 * @param {number} options.count - How many stations to list.
 * @param {number} options.radius - Kilometres.
 * @param {string} options.today - The local date.
 * @param {string} options.language - The user language.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildCheapestWidget({
  fuel,
  location,
  stations,
  summary,
  readAt,
  count,
  radius,
  today,
  language,
  timeZone,
}) {
  const heading = {
    type: 'text',
    variant: 'heading',
    text: clip(`${fuelName(fuel, language)} · ${location.name}`, 40),
  };
  const caption = {
    type: 'text',
    variant: 'caption',
    text: clip(t('pricesCaption', language, { time: formatTime(readAt, timeZone), radius }), 80),
  };
  if (stations.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS.prices,
      // Two texts at most: the body carries the caption.
      components: [
        heading,
        {
          type: 'text',
          variant: 'body',
          text: `${t('noPriceWithin', language, { radius })}. ${caption.text}.`,
        },
      ],
    };
  }
  const components = [
    heading,
    {
      type: 'value',
      value: tileValue(summary.lowest),
      unit: '€/L',
      label: clip(t('tileLowest', language), 24),
      icon: 'trending-down',
      color: WIDGET_COLORS.SUCCESS,
    },
    {
      type: 'value',
      value: tileValue(summary.average),
      unit: '€/L',
      label: clip(t('tileAverage', language, { count: summary.count }), 24),
      icon: 'bar-chart-2',
      color: WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'card-list',
      display: 'list',
      items: stations.slice(0, count).map((station) => {
        const details = [distanceText(station.distance), station.city];
        if (station.date && station.date !== today) {
          details.push(t('priceOf', language, { date: shortDate(station.date) }));
        }
        const links = [];
        if (/^https:\/\//.test(station.url) && station.url.length <= 2048) {
          links.push({ url: station.url, label: clip(t('linkCarbu', language), 24) });
        }
        const map = mapUrl(station);
        if (map) {
          links.push({ url: map, label: clip(t('linkMap', language), 24) });
        }
        const item = {
          title: clip(station.name, 60),
          subtitle: clip(details.filter(Boolean).join(' · '), 60),
          badge: {
            text: clip(priceText(station.price), 16),
            // Every station at the lowest price is green (a common draw in Belgium).
            color: station.price === summary.lowest ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
          },
        };
        const description = [
          station.brand,
          [station.street, `${station.postalCode} ${station.city}`.trim()]
            .filter(Boolean)
            .join(', '),
          station.fuelName,
        ]
          .filter(Boolean)
          .join('\n');
        if (description) {
          item.description = clip(description, 2000);
        }
        if (links.length) {
          item.links = links;
        }
        return item;
      }),
    },
    caption,
  ];
  return { ttl_seconds: TTL_SECONDS.prices, components };
}

/**
 * @description The "price_trend" widget: a chart Gladys draws from the
 * history it keeps of the area device.
 * @param {object} options - Options.
 * @param {string} options.fuel - The fuel key.
 * @param {object} options.ids - The external ids of the area device.
 * @param {object} options.location - The locality.
 * @param {string} options.interval - A chart interval.
 * @param {string} options.language - The user language.
 * @returns {object} The content.
 */
function buildTrendWidget({ fuel, ids, location, interval, language }) {
  const lowest = ids.feature(`${FEATURE_PREFIXES.LOWEST}_${fuel}`);
  const average = ids.feature(`${FEATURE_PREFIXES.AVERAGE}_${fuel}`);
  return {
    ttl_seconds: TTL_SECONDS.trend,
    components: [
      {
        type: 'text',
        variant: 'heading',
        text: clip(`${fuelName(fuel, language)} · ${location.name}`, 40),
      },
      {
        type: 'value',
        device_feature: lowest,
        label: clip(t('tileLowest', language), 24),
        icon: 'trending-down',
        color: WIDGET_COLORS.SUCCESS,
      },
      {
        type: 'value',
        device_feature: average,
        label: clip(t('tileAverageShort', language), 24),
        icon: 'bar-chart-2',
        color: WIDGET_COLORS.NEUTRAL,
      },
      {
        type: 'chart',
        device_features: [lowest, average],
        interval: TREND_INTERVALS.includes(interval) ? interval : DEFAULT_TREND_INTERVAL,
        chart_type: 'line',
        unit: '€/L',
      },
      { type: 'text', variant: 'caption', text: t('trendCaption', language) },
    ],
  };
}

/**
 * @description The value of a fuel in the official widget.
 * @param {object} entry - The fuel in parseOfficial().
 * @param {string} country - BE or LU.
 * @param {string} language - The language.
 * @returns {{ value: string, color: string }} "2,064 € → 2,061 € (22/04)".
 */
function officialValue(entry, country, language) {
  const today = priceText(entry.price);
  if (country !== 'BE') {
    return { value: today, color: WIDGET_COLORS.NEUTRAL };
  }
  const step = nextStep(entry);
  if (step.trend === 'up' || step.trend === 'down') {
    const target = Number.isFinite(step.price)
      ? priceText(step.price)
      : t(`arrow_${step.trend}`, language);
    const mark = step.kind === 'forecast' ? '~' : '';
    return {
      value: clip(`${today} → ${mark}${target} (${shortDate(step.date)})`, 40),
      color: TREND_COLORS[step.trend],
    };
  }
  return {
    value: clip(step.trend === 'same' ? `${today} · ${t('unchanged', language)}` : today, 40),
    color: step.trend === 'same' ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
  };
}

/**
 * @description The "official_prices" widget.
 * @param {object} options - Options.
 * @param {string} options.country - BE or LU.
 * @param {object} options.table - parseOfficial().
 * @param {string[]} options.fuels - The fuels to show.
 * @param {number} options.readAt - When the table was read (ms).
 * @param {string} options.language - The user language.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildOfficialWidget({ country, table, fuels, readAt, language, timeZone }) {
  const shown = fuels.filter((fuel) => table.fuels[fuel]).slice(0, MAX_STATUS_ITEMS);
  const heading = {
    type: 'text',
    variant: 'heading',
    text: clip(
      t(country === 'BE' ? 'officialTitleBE' : 'officialTitleLU', language, {
        date: shortDate(table.date),
      }),
      40,
    ),
  };
  if (shown.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS.official,
      components: [heading, { type: 'text', variant: 'body', text: t('officialNone', language) }],
    };
  }
  const components = [
    heading,
    {
      type: 'status',
      items: shown.map((fuel) => ({
        label: clip(fuelName(fuel, language), 40),
        ...officialValue(table.fuels[fuel], country, language),
      })),
    },
  ];
  const changing = shown
    .map((fuel) => nextStep(table.fuels[fuel]))
    .filter((step) => step.trend === 'up' || step.trend === 'down');
  const body = [];
  if (country === 'BE') {
    body.push(
      changing.length === 0
        ? t('officialNoChange', language)
        : t(
            changing.some((step) => step.kind === 'official')
              ? 'officialAnnounced'
              : 'officialForecast',
            language,
          ),
    );
  }
  body.push(t('officialCaption', language, { time: formatTime(readAt, timeZone) }));
  components.push({ type: 'text', variant: 'body', text: clip(body.join(' '), 300) });
  return { ttl_seconds: TTL_SECONDS.official, components };
}

export {
  WIDGETS,
  TTL_SECONDS,
  LIST_COUNT,
  TREND_INTERVALS,
  DEFAULT_TREND_INTERVAL,
  TREND_COLORS,
  clip,
  readCount,
  messageContent,
  buildCheapestWidget,
  buildTrendWidget,
  officialValue,
  buildOfficialWidget,
};
