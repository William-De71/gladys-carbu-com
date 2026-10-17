// -----------------------------------------------------------------------------
// Entry point of the Carbu.com external integration.
//
// Brings the fuel prices of Carbu.com (Belgium, France, Luxembourg) into
// Gladys, around one locality:
//   - devices: the area (lowest and average price, cheapest station, per
//     followed fuel), the stations picked among the cheapest, and the
//     official prices (Belgian maximum prices, Luxembourg official prices)
//     (src/device.js);
//   - scene triggers: new cheapest station, price change at a station,
//     official price changed, announced, expected;
//   - scene actions: the cheapest station of a fuel, the official prices of a
//     fuel;
//   - dashboard widgets: cheapest stations, price trend, official prices.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Carbu.com integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
