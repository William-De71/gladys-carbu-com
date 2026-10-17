// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, fuel names, widget contents, messages of
// the Configuration screen. Vocabulary of the Gladys interface (appareil /
// Gerät / dispositivo, scène / Szene / escena) and of the pumps of each
// country (GPL, Autogas, GLP). The names and addresses of stations stay as
// Carbu.com writes them.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const FUEL_NAMES = {
  sp95_e10: {
    en: 'Super 95 (E10)',
    fr: 'Super 95 (E10)',
    de: 'Super E10',
    es: 'Gasolina 95 (E10)',
  },
  sp95_e5: {
    en: 'Super 95 (E5)',
    fr: 'Sans plomb 95 (E5)',
    de: 'Super E5',
    es: 'Gasolina 95 (E5)',
  },
  sp98_e5: {
    en: 'Super 98 (E5)',
    fr: 'Super 98 (E5)',
    de: 'Super Plus 98 (E5)',
    es: 'Gasolina 98 (E5)',
  },
  sp98_e10: {
    en: 'Super 98 (E10)',
    fr: 'Super 98 (E10)',
    de: 'Super Plus 98 (E10)',
    es: 'Gasolina 98 (E10)',
  },
  diesel_b7: {
    en: 'Diesel (B7)',
    fr: 'Diesel (B7)',
    de: 'Diesel (B7)',
    es: 'Diésel (B7)',
  },
  diesel_b10: {
    en: 'Diesel (B10)',
    fr: 'Diesel (B10)',
    de: 'Diesel (B10)',
    es: 'Diésel (B10)',
  },
  diesel_xtl: {
    en: 'Diesel XTL / HVO',
    fr: 'Diesel XTL / HVO',
    de: 'Diesel XTL / HVO',
    es: 'Diésel XTL / HVO',
  },
  diesel_plus: {
    en: 'Premium diesel',
    fr: 'Diesel+',
    de: 'Premium-Diesel',
    es: 'Diésel prémium',
  },
  lpg: {
    en: 'LPG',
    fr: 'GPL',
    de: 'Autogas (LPG)',
    es: 'GLP',
  },
  cng: {
    en: 'CNG',
    fr: 'GNV (CNG)',
    de: 'Erdgas (CNG)',
    es: 'GNC',
  },
  e85: {
    en: 'E85',
    fr: 'Superéthanol E85',
    de: 'E85',
    es: 'E85',
  },
};

const TEXTS = {
  // devices
  featureLowest: {
    en: 'Lowest price {fuel}',
    fr: 'Prix le plus bas {fuel}',
    de: 'Niedrigster Preis {fuel}',
    es: 'Precio más bajo {fuel}',
  },
  featureAverage: {
    en: 'Average price {fuel}',
    fr: 'Prix moyen {fuel}',
    de: 'Durchschnittspreis {fuel}',
    es: 'Precio medio {fuel}',
  },
  featureCheapest: {
    en: 'Cheapest station {fuel}',
    fr: 'Station la moins chère {fuel}',
    de: 'Günstigste Tankstelle {fuel}',
    es: 'Gasolinera más barata {fuel}',
  },
  featurePrice: {
    en: 'Price {fuel}',
    fr: 'Prix {fuel}',
    de: 'Preis {fuel}',
    es: 'Precio {fuel}',
  },
  officialDeviceNameBE: {
    en: 'Carbu.com Belgian maximum prices',
    fr: 'Carbu.com prix maximums belges',
    de: 'Carbu.com belgische Höchstpreise',
    es: 'Carbu.com precios máximos belgas',
  },
  officialDeviceNameLU: {
    en: 'Carbu.com Luxembourg official prices',
    fr: 'Carbu.com prix officiels luxembourgeois',
    de: 'Carbu.com luxemburgische Amtspreise',
    es: 'Carbu.com precios oficiales de Luxemburgo',
  },
  featureMaxToday: {
    en: 'Maximum price {fuel}',
    fr: 'Prix maximum {fuel}',
    de: 'Höchstpreis {fuel}',
    es: 'Precio máximo {fuel}',
  },
  featureOfficialToday: {
    en: 'Official price {fuel}',
    fr: 'Prix officiel {fuel}',
    de: 'Amtlicher Preis {fuel}',
    es: 'Precio oficial {fuel}',
  },
  featureMaxNext: {
    en: 'Next maximum price {fuel}',
    fr: 'Prochain prix maximum {fuel}',
    de: 'Nächster Höchstpreis {fuel}',
    es: 'Próximo precio máximo {fuel}',
  },
  featureOutlook: {
    en: 'Outlook {fuel}',
    fr: 'Tendance {fuel}',
    de: 'Aussicht {fuel}',
    es: 'Tendencia {fuel}',
  },
  noPriceWithin: {
    en: 'No recent price within {radius} km',
    fr: 'Aucun prix récent dans un rayon de {radius} km',
    de: 'Kein aktueller Preis im Umkreis von {radius} km',
    es: 'Ningún precio reciente en {radius} km a la redonda',
  },
  outlookUnknown: {
    en: 'No forecast',
    fr: 'Pas de prévision',
    de: 'Keine Prognose',
    es: 'Sin previsión',
  },
  outlook_official_up: {
    en: 'Increase announced on {date}: {price}',
    fr: 'Hausse annoncée le {date} : {price}',
    de: 'Erhöhung ab {date} angekündigt: {price}',
    es: 'Subida anunciada el {date}: {price}',
  },
  outlook_official_down: {
    en: 'Decrease announced on {date}: {price}',
    fr: 'Baisse annoncée le {date} : {price}',
    de: 'Senkung ab {date} angekündigt: {price}',
    es: 'Bajada anunciada el {date}: {price}',
  },
  outlook_official_same: {
    en: 'Unchanged on {date}',
    fr: 'Inchangé le {date}',
    de: 'Unverändert am {date}',
    es: 'Sin cambios el {date}',
  },
  outlook_forecast_up: {
    en: 'Increase expected on {date}',
    fr: 'Hausse prévue le {date}',
    de: 'Erhöhung erwartet am {date}',
    es: 'Subida prevista el {date}',
  },
  outlook_forecast_down: {
    en: 'Decrease expected on {date}',
    fr: 'Baisse prévue le {date}',
    de: 'Senkung erwartet am {date}',
    es: 'Bajada prevista el {date}',
  },
  outlook_forecast_same: {
    en: 'Unchanged expected on {date}',
    fr: 'Inchangé prévu le {date}',
    de: 'Unverändert erwartet am {date}',
    es: 'Sin cambios previstos el {date}',
  },

  // widgets
  pricesCaption: {
    en: 'Carbu.com · read at {time} · within {radius} km',
    fr: 'Carbu.com · lu à {time} · rayon de {radius} km',
    de: 'Carbu.com · gelesen um {time} · Umkreis {radius} km',
    es: 'Carbu.com · leído a las {time} · radio de {radius} km',
  },
  tileLowest: {
    en: 'Lowest',
    fr: 'Le plus bas',
    de: 'Niedrigster',
    es: 'Más bajo',
  },
  tileAverage: {
    en: 'Average · {count} stations',
    fr: 'Moyenne · {count} stations',
    de: 'Mittel · {count} Tankstellen',
    es: 'Media · {count} gasolineras',
  },
  tileAverageShort: {
    en: 'Average',
    fr: 'Moyenne',
    de: 'Mittel',
    es: 'Media',
  },
  priceOf: {
    en: 'price of {date}',
    fr: 'prix du {date}',
    de: 'Preis vom {date}',
    es: 'precio del {date}',
  },
  linkCarbu: {
    en: 'Carbu.com',
    fr: 'Carbu.com',
    de: 'Carbu.com',
    es: 'Carbu.com',
  },
  linkMap: {
    en: 'Map',
    fr: 'Carte',
    de: 'Karte',
    es: 'Mapa',
  },
  trendCaption: {
    en: 'Carbu.com · history kept by Gladys',
    fr: 'Carbu.com · historique conservé par Gladys',
    de: 'Carbu.com · Verlauf von Gladys gespeichert',
    es: 'Carbu.com · historial guardado por Gladys',
  },
  arrow_up: {
    en: 'up',
    fr: 'hausse',
    de: 'steigt',
    es: 'sube',
  },
  arrow_down: {
    en: 'down',
    fr: 'baisse',
    de: 'sinkt',
    es: 'baja',
  },
  unchanged: {
    en: 'unchanged',
    fr: 'inchangé',
    de: 'unverändert',
    es: 'sin cambios',
  },
  officialTitleBE: {
    en: 'Maximum prices · {date}',
    fr: 'Prix maximums · {date}',
    de: 'Höchstpreise · {date}',
    es: 'Precios máximos · {date}',
  },
  officialTitleLU: {
    en: 'Official prices · {date}',
    fr: 'Prix officiels · {date}',
    de: 'Amtliche Preise · {date}',
    es: 'Precios oficiales · {date}',
  },
  officialNone: {
    en: 'No official price for these fuels.',
    fr: 'Aucun prix officiel pour ces carburants.',
    de: 'Kein amtlicher Preis für diese Kraftstoffe.',
    es: 'Ningún precio oficial para estos carburantes.',
  },
  officialNoChange: {
    en: 'No change announced.',
    fr: 'Aucun changement annoncé.',
    de: 'Keine Änderung angekündigt.',
    es: 'Ningún cambio anunciado.',
  },
  officialAnnounced: {
    en: 'New maximum prices announced by the government.',
    fr: 'Nouveaux prix maximums annoncés par le gouvernement.',
    de: 'Neue Höchstpreise von der Regierung angekündigt.',
    es: 'Nuevos precios máximos anunciados por el Gobierno.',
  },
  officialForecast: {
    en: 'Change expected by Carbu.com (~), not yet official.',
    fr: 'Changement prévu par Carbu.com (~), pas encore officiel.',
    de: 'Änderung von Carbu.com erwartet (~), noch nicht amtlich.',
    es: 'Cambio previsto por Carbu.com (~), aún no oficial.',
  },
  officialCaption: {
    en: 'Carbu.com · read at {time}.',
    fr: 'Carbu.com · lu à {time}.',
    de: 'Carbu.com · gelesen um {time}.',
    es: 'Carbu.com · leído a las {time}.',
  },
  officialNotInCountry: {
    en: 'Carbu.com publishes official prices for Belgium and Luxembourg only.',
    fr: 'Carbu.com ne publie des prix officiels que pour la Belgique et le Luxembourg.',
    de: 'Carbu.com veröffentlicht amtliche Preise nur für Belgien und Luxemburg.',
    es: 'Carbu.com solo publica precios oficiales para Bélgica y Luxemburgo.',
  },
  widgetNoPostalCode: {
    en: 'Enter your postal code in the configuration of the Carbu.com integration.',
    fr: 'Saisissez votre code postal dans la configuration de l’intégration Carbu.com.',
    de: 'Geben Sie Ihre Postleitzahl in der Konfiguration der Carbu.com-Integration ein.',
    es: 'Introduzca su código postal en la configuración de la integración Carbu.com.',
  },
  widgetNoLocality: {
    en: 'Carbu.com does not know this postal code: check the country and the code.',
    fr: 'Carbu.com ne connaît pas ce code postal : vérifiez le pays et le code.',
    de: 'Carbu.com kennt diese Postleitzahl nicht: Land und Postleitzahl prüfen.',
    es: 'Carbu.com no conoce este código postal: compruebe el país y el código.',
  },
  widgetFuelNotListed: {
    en: 'Carbu.com does not list {fuel} in this country ({country}).',
    fr: 'Carbu.com ne référence pas {fuel} dans ce pays ({country}).',
    de: 'Carbu.com führt {fuel} in diesem Land ({country}) nicht.',
    es: 'Carbu.com no ofrece {fuel} en este país ({country}).',
  },
  widgetFuelNotFollowed: {
    en: 'Choose a fuel followed in the configuration of the integration.',
    fr: 'Choisissez un carburant suivi dans la configuration de l’intégration.',
    de: 'Wählen Sie einen in der Integration konfigurierten Kraftstoff.',
    es: 'Elija un carburante seguido en la configuración de la integración.',
  },
  widgetAddArea: {
    en: 'Add the device “Carbu.com {name}” from the Discovery tab to keep a price history.',
    fr: 'Ajoutez l’appareil « Carbu.com {name} » depuis l’onglet Découverte pour garder un historique.',
    de: 'Fügen Sie das Gerät „Carbu.com {name}“ im Tab Erkennung hinzu, um einen Verlauf zu speichern.',
    es: 'Añada el dispositivo «Carbu.com {name}» desde la pestaña Descubrimiento para guardar un historial.',
  },

  // connection status
  statusNoPostalCode: {
    en: 'Enter the postal code of the area to follow.',
    fr: 'Saisissez le code postal de la zone à suivre.',
    de: 'Geben Sie die Postleitzahl des Gebiets ein.',
    es: 'Introduzca el código postal de la zona que desea seguir.',
  },
  statusUnknownPostalCode: {
    en: 'Carbu.com knows no locality with the postal code {postal} ({country}).',
    fr: 'Carbu.com ne connaît aucune localité au code postal {postal} ({country}).',
    de: 'Carbu.com kennt keinen Ort mit der Postleitzahl {postal} ({country}).',
    es: 'Carbu.com no conoce ninguna localidad con el código postal {postal} ({country}).',
  },
  statusUnreachable: {
    en: '{detail} New attempt in {minutes} min.',
    fr: '{detail} Nouvel essai dans {minutes} min.',
    de: '{detail} Neuer Versuch in {minutes} Min.',
    es: '{detail} Nuevo intento en {minutes} min.',
  },
  statusConnected: {
    en: '{place}: {count} fuel(s) followed, prices read at {time}.',
    fr: '{place} : {count} carburant(s) suivi(s), prix lus à {time}.',
    de: '{place}: {count} Kraftstoff(e), Preise gelesen um {time}.',
    es: '{place}: {count} carburante(s) seguido(s), precios leídos a las {time}.',
  },
  statusTownMissing: {
    en: '“{town}” is not among the localities of this postal code: the main one is used.',
    fr: '« {town} » ne fait pas partie des localités de ce code postal : la principale est utilisée.',
    de: '„{town}“ gehört nicht zu dieser Postleitzahl: der Hauptort wird verwendet.',
    es: '«{town}» no pertenece a este código postal: se usa la localidad principal.',
  },
  statusUnsupported: {
    en: 'Not listed in this country ({country}): {fuels}.',
    fr: 'Non référencé dans ce pays ({country}) : {fuels}.',
    de: 'In diesem Land ({country}) nicht geführt: {fuels}.',
    es: 'No disponible en este país ({country}): {fuels}.',
  },
  statusPartial: {
    en: '{count} fuel(s) could not be read this time.',
    fr: '{count} carburant(s) n’ont pas pu être lus cette fois.',
    de: '{count} Kraftstoff(e) konnten diesmal nicht gelesen werden.',
    es: '{count} carburante(s) no se pudieron leer esta vez.',
  },
  errorUnreachable: {
    en: 'Carbu.com cannot be reached ({detail}).',
    fr: 'Carbu.com est injoignable ({detail}).',
    de: 'Carbu.com ist nicht erreichbar ({detail}).',
    es: 'No se puede acceder a Carbu.com ({detail}).',
  },
  errorBlocked: {
    en: 'Carbu.com refused the request ({detail}): read less often.',
    fr: 'Carbu.com a refusé la requête ({detail}) : espacez les lectures.',
    de: 'Carbu.com hat die Anfrage abgelehnt ({detail}): seltener lesen.',
    es: 'Carbu.com rechazó la solicitud ({detail}): lea con menos frecuencia.',
  },
  errorInvalid: {
    en: 'The page of Carbu.com could not be read: its layout may have changed.',
    fr: 'La page de Carbu.com n’a pas pu être lue : sa mise en page a peut-être changé.',
    de: 'Die Seite von Carbu.com konnte nicht gelesen werden: ihr Aufbau hat sich vielleicht geändert.',
    es: 'No se pudo leer la página de Carbu.com: puede que su diseño haya cambiado.',
  },

  // Configuration screen
  testLocality: {
    en: 'Locality: {place} (others: {others})',
    fr: 'Localité : {place} (autres : {others})',
    de: 'Ort: {place} (weitere: {others})',
    es: 'Localidad: {place} (otras: {others})',
  },
  testFuel: {
    en: '{fuel}: {count} station(s), from {lowest} at {station} ({stale} outdated price(s) set aside)',
    fr: '{fuel} : {count} station(s), dès {lowest} chez {station} ({stale} prix trop ancien(s) écarté(s))',
    de: '{fuel}: {count} Tankstelle(n), ab {lowest} bei {station} ({stale} veraltete(r) Preis(e) ignoriert)',
    es: '{fuel}: {count} gasolinera(s), desde {lowest} en {station} ({stale} precio(s) antiguo(s) descartado(s))',
  },
  testFuelError: {
    en: '{fuel}: {error}',
    fr: '{fuel} : {error}',
    de: '{fuel}: {error}',
    es: '{fuel}: {error}',
  },
  testOfficial: {
    en: 'Official prices: {count} fuel(s)',
    fr: 'Prix officiels : {count} carburant(s)',
    de: 'Amtliche Preise: {count} Kraftstoff(e)',
    es: 'Precios oficiales: {count} carburante(s)',
  },
  testOfficialError: {
    en: 'Official prices: {error}',
    fr: 'Prix officiels : {error}',
    de: 'Amtliche Preise: {error}',
    es: 'Precios oficiales: {error}',
  },
  testError: {
    en: 'Locality search failed: {error}',
    fr: 'Échec de la recherche de localité : {error}',
    de: 'Ortssuche fehlgeschlagen: {error}',
    es: 'Error al buscar la localidad: {error}',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the integration logs ({count} line(s) “Carbu.com diagnostic”).',
    fr: 'Diagnostic écrit dans les journaux de l’intégration ({count} ligne(s) « Carbu.com diagnostic »).',
    de: 'Diagnose in die Protokolle der Integration geschrieben ({count} Zeile(n) „Carbu.com diagnostic“).',
    es: 'Diagnóstico escrito en los registros de la integración ({count} línea(s) «Carbu.com diagnostic»).',
  },
};

/**
 * @description Whether a value is a supported language.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
const isLanguage = (value) => LANGUAGES.includes(value);

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 * @example
 * t('featurePrice', 'fr', { fuel: 'GPL' }); // -> 'Prix GPL'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description The name of a fuel.
 * @param {string} fuel - A fuel key.
 * @param {string} language - The language.
 * @returns {string} "Diesel (B7)", "GPL".
 */
function fuelName(fuel, language) {
  const entry = FUEL_NAMES[fuel];
  if (!entry) {
    return String(fuel ?? '');
  }
  return entry[isLanguage(language) ? language : 'en'] ?? entry.en;
}

export { LANGUAGES, FUEL_NAMES, TEXTS, isLanguage, t, all, fuelName };
