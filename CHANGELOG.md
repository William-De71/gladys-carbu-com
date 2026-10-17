# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- Fuel prices of Carbu.com around one locality of Belgium, France or Luxembourg (a postal code), for up to four fuels among eleven, in a radius of 2 to 30 km, prices older than 1 to 30 days set aside.
- An area device: the lowest price, the average price and the cheapest station of each followed fuel, with their history in Gladys.
- Station devices: the cheapest stations of each fuel are offered on the Discovery screen, with the price of each followed fuel they sell.
- An official price device: the Belgian maximum prices of the day, the next one (announced by the government, else expected by Carbu.com) and the outlook; the Luxembourg official prices.
- Scene triggers: new cheapest station, price change at an added station, official price changed, maximum price announced, maximum price change expected.
- Scene actions: the cheapest station of a fuel (within a distance), and the official prices of a fuel.
- Dashboard widgets: the cheapest stations of a fuel, the trend of the lowest and average prices, and the official prices.
- Configuration actions: test the connection (localities of the postal code, prices read) and a diagnostic written to the Logs tab.
- Cloud transport: the public pages of carbu.com, read every 30 minutes to 4 hours (every hour by default), no account; the localities are kept in /data.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.
