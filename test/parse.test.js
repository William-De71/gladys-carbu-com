// The pages of Carbu.com, read on 2026-10-17 (test/fixtures).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeEntities,
  isoDate,
  readPrice,
  parseLocations,
  parseStations,
  parseOfficial,
} from '../src/parse.js';
import { PAGES } from './helpers/fixtures.js';

test('entities, dates and prices as Carbu.com writes them', () => {
  assert.equal(
    decodeEntities('Li&egrave;ge &amp; Total &Eacute;nergies &#39;x&#x27;'),
    "Liège & Total Énergies 'x'",
  );
  assert.equal(decodeEntities('&unknown; &euro;'), '&unknown; €');
  assert.equal(isoDate('17/10/26'), '2026-10-17');
  assert.equal(isoDate('17/10/2026'), '2026-10-17');
  assert.equal(isoDate('31/02/26'), null, 'not a day');
  assert.equal(isoDate('n.d.'), null);
  assert.equal(readPrice('2,0640 &euro;/l'), 2.064);
  assert.equal(readPrice('2.444'), 2.444);
  assert.equal(readPrice(''), null);
});

test('the localities of a postal code, provinces left out', () => {
  const liege = parseLocations(PAGES['location-4000']);
  assert.deepEqual(
    liege.map((item) => [item.id, item.name, item.country, item.postalCode]),
    [
      ['BE_lg_825', 'Glain', 'BE', '4000'],
      ['BE_lg_826', 'Liège', 'BE', '4000'],
      ['BE_lg_827', 'Rocourt', 'BE', '4000'],
      ['FR_72_40_402_4098_40192', 'Mont-de-Marsan', 'FR', '40000'],
    ],
  );
  assert.deepEqual(
    parseLocations('[{"id":"BE_lu","n":"Luxembourg","pn":"Belgique","c":"BE","pc":"0"}]'),
    [],
  );
  assert.deepEqual(parseLocations(''), []);
  assert.throws(() => parseLocations('<html>'), /not JSON/);
});

test('a Belgian station list: price, grade, distance, address, date, brand', () => {
  const stations = parseStations(PAGES['be-GO'], 'BE');
  assert.equal(stations.length, 28, 'two items have no price');
  const [esso] = stations;
  assert.deepEqual(
    {
      key: esso.key,
      name: esso.name,
      brand: esso.brand,
      fuelName: esso.fuelName,
      price: esso.price,
      street: esso.street,
      postalCode: esso.postalCode,
      city: esso.city,
      date: esso.date,
    },
    {
      key: 'be-2430',
      name: 'Esso Liège',
      brand: 'Esso',
      fuelName: 'Diesel (B7)',
      price: 2.444,
      street: 'Bd Carton De Wiart 4',
      postalCode: '4000',
      city: 'Liège',
      date: '2026-10-17',
    },
  );
  assert.ok(esso.distance > 2.9 && esso.distance < 3);
  assert.ok(esso.latitude > 50 && esso.longitude > 5);
  assert.match(esso.url, /^https:\/\/carbu\.com\/belgique\/index\.php\/station\/esso\//);
  assert.equal(new Set(stations.map((s) => s.key)).size, stations.length);
  assert.ok(stations.every((station) => station.fuelName === 'Diesel (B7)'));
});

test('a French list mixes E5 and E10 and holds prices of every age', () => {
  const stations = parseStations(PAGES['fr-E10'], 'FR');
  const grades = new Set(stations.map((station) => station.fuelName));
  assert.deepEqual([...grades].sort(), ['Sans Plomb 95 (E10)', 'Sans Plomb 95 (E5)']);
  assert.ok(
    stations.some((station) => station.date < '2020-01-01'),
    'years-old prices',
  );
  assert.ok(stations.every((station) => station.key.startsWith('fr-')));
});

test('a Luxembourg list; an empty list is no station', () => {
  const stations = parseStations(PAGES['lu-GO'], 'LU');
  assert.ok(stations.length > 10);
  assert.ok(stations.every((station) => station.key.startsWith('lu-')));
  assert.deepEqual(parseStations(PAGES['lu-empty'], 'LU'), []);
});

test('the Belgian maximum prices of the day: unchanged forecast, not available', () => {
  const table = parseOfficial(PAGES['be-official'], 'BE');
  assert.equal(table.date, '2026-10-17');
  assert.deepEqual(Object.keys(table.fuels), [
    'sp95_e10',
    'sp98_e5',
    'sp98_e10',
    'diesel_b7',
    'diesel_b10',
    'diesel_xtl',
    'lpg',
  ]);
  assert.deepEqual(table.fuels.diesel_b7, {
    label: 'Diesel (B7)',
    price: 2.444,
    next: [{ date: '2026-10-19', kind: 'forecast', price: 2.444, trend: 'same' }],
  });
  assert.deepEqual(table.fuels.lpg.next, [
    { date: '2026-10-19', kind: 'forecast', price: null, trend: null },
  ]);
});

test('an announced decrease and increase (2026-04-21, Dutch page)', () => {
  const table = parseOfficial(PAGES['be-official-announced'], 'BE');
  assert.equal(table.date, '2026-04-21');
  assert.deepEqual(table.fuels.diesel_b7.next, [
    { date: '2026-04-22', kind: 'official', price: 2.061, trend: 'down' },
    { date: '2026-04-23', kind: 'forecast', price: 2.061, trend: 'same' },
  ]);
  assert.equal(table.fuels.diesel_xtl.next[0].trend, 'up');
  assert.equal(table.fuels.diesel_xtl.next[0].price, 3.557);
  assert.deepEqual(table.fuels.sp95_e10.next[0], {
    date: '2026-04-22',
    kind: 'official',
    price: 1.864,
    trend: 'same',
  });
});

test('the Luxembourg official prices: today only', () => {
  const table = parseOfficial(PAGES['lu-official'], 'LU');
  assert.equal(table.date, '2026-10-17');
  assert.deepEqual(
    Object.fromEntries(Object.entries(table.fuels).map(([fuel, entry]) => [fuel, entry.price])),
    { diesel_b7: 2.081, sp95_e5: 1.788, sp98_e5: 1.984, lpg: 0.953 },
  );
  assert.ok(Object.values(table.fuels).every((entry) => entry.next.length === 0));
  assert.equal(parseOfficial('<html>no table</html>', 'BE'), null);
});
