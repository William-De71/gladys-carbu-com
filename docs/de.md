# Carbu.com

## Überblick

Diese Integration bringt die Kraftstoffpreise von **Carbu.com**, dem Preisvergleich für Belgien, Frankreich und Luxemburg, in Gladys: rund um einen Ort Ihrer Wahl (eine Postleitzahl) den **niedrigsten Preis**, den **Durchschnittspreis** und die **günstigste Tankstelle** für bis zu vier Kraftstoffe, die **Tankstellen**, die Sie verfolgen möchten, und die **amtlichen Preise** (belgische Höchstpreise mit angekündigter oder erwarteter Änderung, amtliche Preise Luxemburgs).

Carbu.com hat weder API noch Konto: Die Integration liest die öffentlichen Seiten der Website wie ein Besucher, standardmäßig stündlich. Die Preise werden dort von Autofahrern und Tankstellen aktualisiert; manche sind Tage alt, in Frankreich sogar Jahre: Preise über dem gewählten Alter werden ignoriert.

Es ist eine **Cloud**-Integration: Sie kontaktiert `carbu.com` mit Ihrer Postleitzahl und den Codes der verfolgten Kraftstoffe. Sonst verlässt nichts Ihr Netzwerk.

## Voraussetzungen

- Gladys Assistant **5.1.1** oder neuer.
- Internetzugang. Kein Konto, kein Schlüssel.

## Konfiguration

| Feld                                    | Beschreibung                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Land                                    | Belgien, Frankreich oder Luxemburg.                                                                 |
| Postleitzahl                            | Die Mitte des Gebiets: Entfernungen werden ab der Mitte dieses Orts gemessen.                       |
| Ort (optional)                          | Wenn die Postleitzahl mehrere Orte umfasst (4000: Liège, Glain, Rocourt). Leer: der Hauptort.       |
| Kraftstoffe                             | Höchstens vier. Hinter dem Namen stehen die Länder, in denen Carbu.com ihn führt (E85: Frankreich). |
| Umkreis                                 | 2 bis 30 km, standardmäßig 10 km.                                                                   |
| Preise ignorieren, die älter sind als   | 1 bis 30 Tage, standardmäßig 7 Tage.                                                                |
| In der Erkennung angebotene Tankstellen | Die günstigsten je Kraftstoff, standardmäßig 5; „Keine“, um nur das Gebiet anzubieten.              |
| Leseintervall                           | 30 Minuten, 1 Stunde (Standard), 2 oder 4 Stunden.                                                  |
| Sprache der Gerätenamen                 | Automatisch: die Sprache des Dashboards, Französisch, bis ein Widget angezeigt wird.                |

Die Schaltfläche **Verbindung testen** zeigt den gewählten Ort und die anderen Orte derselben Postleitzahl, dann je Kraftstoff die Anzahl der behaltenen Tankstellen, den niedrigsten Preis und die Zahl der ignorierten veralteten Preise. Die Schaltfläche **Diagnose** schreibt den vollständigen Zustand der Integration in den Tab Protokolle.

## Verwendung

### Geräte

Im Tab **Erkennung** der Integration:

- **Carbu.com \<Ort\> (\<Postleitzahl\>)**: je verfolgtem Kraftstoff der niedrigste Preis, der Durchschnittspreis (in €/L, mit Verlauf) und die günstigste Tankstelle („Shell Express Liège · 2,274 € · 1,3 km“).
- **Die Tankstellen**, die günstigsten je Kraftstoff: Fügen Sie die gewünschten hinzu; sie behalten dann den Preis jedes verfolgten Kraftstoffs, den sie verkaufen, auch wenn sie nicht mehr zu den günstigsten gehören.
- **Carbu.com belgische Höchstpreise** (Belgien): je verfolgtem Kraftstoff der heutige Höchstpreis, der nächste (von der Regierung angekündigt, sonst von Carbu.com erwartet) und die Aussicht in Worten („Senkung ab 22/04 angekündigt: 2,061 €“).
- **Carbu.com luxemburgische Amtspreise** (Luxemburg): der heutige amtliche Preis jedes verfolgten Kraftstoffs.

### Dashboard-Widgets

![Die Widgets Günstigster Kraftstoff (Diesel in Liège), Kraftstoffpreis-Verlauf und Amtliche Kraftstoffpreise (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-carbu-com/main/docs/assets/widgets.de.png)

- **Günstigster Kraftstoff**: niedrigster und durchschnittlicher Preis, dann die günstigsten Tankstellen (grün: die zum niedrigsten Preis), ihre Entfernung und das Datum alter Preise. Ein Tippen öffnet die Tankstelle auf Carbu.com oder auf der Karte. Einstellungen: Kraftstoff (auch ein nicht verfolgter), Anzahl der Tankstellen.
- **Kraftstoffpreis-Verlauf**: die Kurven des niedrigsten und des durchschnittlichen Preises eines Kraftstoffs über eine Woche bis ein Jahr, von Gladys aus dem Gebiets-Gerät gezeichnet (zuerst hinzufügen).
- **Amtliche Kraftstoffpreise**: die heutigen belgischen Höchstpreise und was folgt (grün eine Senkung, rot eine Erhöhung, „~“ eine Prognose von Carbu.com) oder die amtlichen Preise Luxemburgs.

### Szenen

Auslöser (einmal pro Änderung; die erste Lesung ist die Referenz):

| Auslöser                          | Wann                                                                            | Filter                           |
| --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| Neue günstigste Tankstelle        | Eine andere Tankstelle wird im Gebiet die günstigste für einen Kraftstoff       | Kraftstoff                       |
| Preisänderung an einer Tankstelle | Der Preis eines Kraftstoffs ändert sich an einer hinzugefügten Tankstelle       | Tankstelle, Kraftstoff, Richtung |
| Amtlicher Preis geändert          | Der heutige amtliche Preis weicht von gestern ab (Belgien, Luxemburg)           | Kraftstoff, Richtung             |
| Höchstpreis angekündigt           | Die belgische Regierung kündigt einen neuen Höchstpreis für den nächsten Tag an | Kraftstoff, Richtung             |
| Höchstpreisänderung erwartet      | Carbu.com erwartet eine Erhöhung oder Senkung vor der amtlichen Ankündigung     | Kraftstoff, Richtung             |

Aktionen: **Günstigste Tankstelle** (Kraftstoff, maximale Entfernung; liefert Name, Marke, Adresse, Preis, Entfernung, Datum des Preises, Durchschnittspreis, Anzahl der Tankstellen, Kartenlink) und **Amtliche Preise** (Kraftstoff; liefert den heutigen Preis, den nächsten, sein Datum, die Tendenz und ob er angekündigt ist).

Beispiele:

- Wenn **eine Erhöhung des Diesel-Höchstpreises angekündigt wird** → mir „Heute tanken, morgen {{triggerEvent.data.new_price}} €“ senden.
- Wenn **die günstigste Super-E10-Tankstelle wechselt** → `{{triggerEvent.data.station_name}}` zu `{{triggerEvent.data.price}}` € melden.
- Jeden Freitag um 17 Uhr → **Günstigste Tankstelle** im Umkreis von 5 km, dann über den Lautsprecher ansagen.

### Transport

**Cloud**-Abzeichen im Katalog: Carbu.com wird über das Internet kontaktiert. Es gibt keinen lokalen Weg und keine Schaltfläche „Lokale Verbindung bevorzugen“.

## Fehlerbehebung

- **„Carbu.com kennt keinen Ort mit der Postleitzahl …“**: Land und Postleitzahl prüfen (in Luxemburg ohne „L-“; Carbu.com kennt nicht immer jede Postleitzahl einer Stadt: die Hauptpostleitzahl versuchen). „Verbindung testen“ listet die gefundenen Orte.
- **„Kein aktueller Preis im Umkreis von … km“**: Umkreis oder zulässiges Alter der Preise vergrößern oder prüfen, ob der Kraftstoff in Ihrer Nähe verkauft wird (Erdgas und Diesel XTL sind selten).
- **Ein Kraftstoff wird in Ihrem Land nicht geführt**: Der Status der Integration meldet es; eine Entsprechung wählen (Belgien: Super E10; Frankreich und Luxemburg: Super E5).
- **„Carbu.com hat die Anfrage abgelehnt“**: Die Website begrenzt zu häufige Lesungen; alle 2 oder 4 Stunden lesen.
- **„Die Seite von Carbu.com konnte nicht gelesen werden“**: Die Website hat wohl ihr Layout geändert; mit der Schaltfläche **Diagnose** auf GitHub melden.
- **Die Preise weichen leicht von der Zapfsäule ab**: Es sind die auf Carbu.com eingetragenen Preise, mit dem im Widget angezeigten Datum.
- Für eine Fehlermeldung: Versionen von Gladys und der Integration, Land, Postleitzahl, Kraftstoffe und die Zeilen „Carbu.com diagnostic“ aus dem Tab Protokolle (im Entwicklermodus fügt `DEBUG=gladys-integration-sdk` die SDK-Protokolle hinzu).
