# Carbu.com

## Présentation

Cette intégration amène les prix des carburants de **Carbu.com**, le comparateur de Belgique, de France et du Luxembourg, dans Gladys : autour d’une localité de votre choix (un code postal), le **prix le plus bas**, le **prix moyen** et la **station la moins chère** de quatre carburants au plus, les **stations** que vous voulez suivre, et les **prix officiels** (prix maximums belges avec leur évolution annoncée ou prévue, prix officiels luxembourgeois).

Carbu.com n’a ni API ni compte : l’intégration lit les pages publiques du site, comme un visiteur, toutes les heures par défaut. Les prix y sont mis à jour par les automobilistes et les stations ; certains datent de plusieurs jours, voire de plusieurs années en France : ceux qui dépassent l’âge choisi sont écartés.

C’est une intégration **cloud** : elle contacte `carbu.com` avec votre code postal et les codes des carburants suivis. Rien d’autre ne quitte votre réseau.

## Prérequis

- Gladys Assistant **5.3.0** ou plus récent.
- Un accès à internet. Aucun compte, aucune clé.

## Configuration

| Champ                                 | Description                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Pays                                  | Belgique, France ou Luxembourg.                                                                       |
| Code postal                           | Le centre de la zone : les distances sont comptées depuis le centre de cette localité.                |
| Localité (facultatif)                 | Quand le code postal couvre plusieurs localités (4000 : Liège, Glain, Rocourt). Vide : la principale. |
| Carburants                            | Quatre au plus. Les pays où Carbu.com référence chaque carburant suivent son nom (E85 : France).      |
| Rayon                                 | 2 à 30 km, 10 km par défaut.                                                                          |
| Ignorer les prix plus anciens que     | 1 à 30 jours, 7 jours par défaut.                                                                     |
| Stations proposées dans la découverte | Les moins chères de chaque carburant, 5 par défaut ; « Aucune » pour ne proposer que la zone.         |
| Fréquence de lecture                  | 30 minutes, 1 heure (par défaut), 2 ou 4 heures.                                                      |
| Langue des noms d’appareils           | Automatique : la langue du tableau de bord, le français tant qu’aucun widget n’est affiché.           |

Le bouton **Tester la connexion** affiche la localité retenue et les autres du même code postal, puis, pour chaque carburant, le nombre de stations gardées, le prix le plus bas et le nombre de prix trop anciens écartés. Le bouton **Diagnostic** écrit l’état complet de l’intégration dans l’onglet Journaux.

## Utilisation

### Appareils

Dans l’onglet **Découvrir** de l’intégration :

- **Carbu.com \<localité\> (\<code postal\>)** : pour chaque carburant suivi, le prix le plus bas, le prix moyen (en €/L, avec historique) et la station la moins chère (« Shell Express Liège · 2,274 € · 1,3 km »).
- **Les stations** les moins chères de chaque carburant : ajoutez celles qui vous intéressent, elles gardent ensuite le prix de chaque carburant suivi qu’elles vendent, même si elles ne sont plus parmi les moins chères.
- **Carbu.com prix maximums belges** (Belgique) : pour chaque carburant suivi, le prix maximum du jour, le prochain (annoncé par le gouvernement, sinon prévu par Carbu.com) et la tendance en mots (« Baisse annoncée le 22/04 : 2,061 € »).
- **Carbu.com prix officiels luxembourgeois** (Luxembourg) : le prix officiel du jour de chaque carburant suivi.

### Widgets du tableau de bord

![Les widgets Carburant moins cher (Diesel à Liège), Évolution du prix et Prix officiels carburants (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-carbu-com/main/docs/assets/widgets.fr.png)

- **Carburant moins cher** : le prix le plus bas et le prix moyen, puis les stations les moins chères (en vert : celles au prix le plus bas), leur distance et la date des prix anciens. Un appui ouvre la station sur Carbu.com ou sur la carte. Réglages : carburant (même non suivi), nombre de stations.
- **Évolution du prix** : les courbes du prix le plus bas et du prix moyen d’un carburant sur une semaine à un an, tracées par Gladys depuis l’appareil zone (à ajouter d’abord).
- **Prix officiels carburants** : les prix maximums belges du jour et la suite (en vert une baisse, en rouge une hausse, « ~ » une prévision de Carbu.com), ou les prix officiels luxembourgeois.

### Scènes

Déclencheurs (une fois par changement ; la première lecture sert de référence) :

| Déclencheur                      | Quand                                                                   | Filtres                  |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| Nouvelle station la moins chère  | Une autre station devient la moins chère de la zone pour un carburant   | carburant                |
| Prix modifié dans une station    | Le prix d’un carburant change dans une station ajoutée                  | station, carburant, sens |
| Prix officiel modifié            | Le prix officiel du jour diffère de la veille (Belgique, Luxembourg)    | carburant, sens          |
| Prix maximum annoncé             | Le gouvernement belge annonce un nouveau prix maximum pour le lendemain | carburant, sens          |
| Changement de prix maximum prévu | Carbu.com prévoit une hausse ou une baisse avant l’annonce officielle   | carburant, sens          |

Actions : **Station la moins chère** (carburant, distance maximale ; renvoie nom, enseigne, adresse, prix, distance, date du prix, prix moyen, nombre de stations, lien vers la carte) et **Prix officiels** (carburant ; renvoie le prix du jour, le suivant, sa date, la tendance et s’il est annoncé).

Exemples :

- Quand **une hausse du prix maximum du Diesel est annoncée** → m’envoyer « Faites le plein aujourd’hui, demain {{triggerEvent.data.new_price}} € ».
- Quand **la station la moins chère change pour le Super 95** → notifier `{{triggerEvent.data.station_name}}` à `{{triggerEvent.data.price}}` €.
- Chaque vendredi à 17 h → **Station la moins chère** à 5 km, puis l’annoncer sur l’enceinte.

### Transport

Badge **cloud** dans le catalogue : Carbu.com est contacté par internet. Il n’y a pas de voie locale ni de bouton « Préférer la connexion locale ».

## Dépannage

- **« Carbu.com ne connaît aucune localité au code postal … »** : vérifiez le pays et le code (au Luxembourg, sans le « L- » ; Carbu.com ne connaît pas toujours chaque code d’une ville : essayez le code principal). « Tester la connexion » liste les localités trouvées.
- **« Aucun prix récent dans un rayon de … km »** : agrandissez le rayon ou l’âge accepté des prix, ou vérifiez que le carburant est vendu près de chez vous (le GNV et le Diesel XTL sont rares).
- **Un carburant n’est pas référencé dans votre pays** : le statut de l’intégration le dit ; choisissez un équivalent (Belgique : Super 95 E10 ; France et Luxembourg : Sans plomb 95 E5).
- **« Carbu.com a refusé la requête »** : le site limite les lectures trop fréquentes ; passez à une lecture toutes les 2 ou 4 heures.
- **« La page de Carbu.com n’a pas pu être lue »** : le site a sans doute changé sa mise en page ; signalez-le avec le bouton **Diagnostic** sur GitHub.
- **Les prix diffèrent légèrement de ceux de la pompe** : ce sont ceux saisis sur Carbu.com, avec la date affichée dans le widget.
- Pour un rapport de bug : versions de Gladys et de l’intégration, pays, code postal, carburants et les lignes « Carbu.com diagnostic » de l’onglet Journaux (en mode développeur, `DEBUG=gladys-integration-sdk` ajoute les journaux du SDK).
