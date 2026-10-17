// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/carbu.json (the only
// writable place of the container):
//   - `locations`   the localities of each postal code asked (country|code ->
//                   `{ at, list }`), so a restart asks Carbu.com nothing but
//                   the prices;
//   - `seen`        what the scene triggers already know: the cheapest
//                   station of each fuel, the prices of the added stations,
//                   the official prices and the announcements fired. A
//                   restart never fires the same event twice.
// The prices themselves are not kept: they are read again at start.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/carbu.json';
const EMPTY = () => ({
  locations: {},
  seen: { cheapest: {}, stations: {}, official: {} },
});

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const base = EMPTY();
        const value = raw && typeof raw === 'object' ? raw : {};
        const part = (object, name) =>
          object?.[name] && typeof object[name] === 'object' ? object[name] : {};
        store.data = {
          locations: part(value, 'locations'),
          seen: {
            cheapest: part(part(value, 'seen'), 'cheapest'),
            stations: part(part(value, 'seen'), 'stations'),
            official: part(part(value, 'seen'), 'official'),
          },
        };
        // Older or partial files: keep every part an object.
        store.data = { ...base, ...store.data, seen: { ...base.seen, ...store.data.seen } };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        store.data = EMPTY();
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, createStore };
