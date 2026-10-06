# Bautagebuch einrichten

Dauer: etwa 20 Minuten, einmalig. Danach nutzt ihr die App wie jede andere auf dem Handy.

**So funktioniert es:** Die App (nur der Code, keine Daten) liegt kostenlos auf GitHub Pages. Eure Daten liegen als einzelne Dateien in einem OneDrive-Ordner von dir. Diesen Ordner teilst du mit deiner Freundin. Beide meldet ihr euch in der App mit eurem Microsoft-Konto an.

Ihr braucht dafür:
- deinen GitHub-Account
- das Microsoft-Konto, auf dessen OneDrive die Daten liegen sollen
- ein Microsoft-Konto für deine Freundin (das Konto, mit dem sie OneDrive nutzt)

---

## Teil 1: Die App auf GitHub Pages bereitstellen

1. Auf **github.com** einloggen, oben rechts auf **+** und **New repository**.
2. Name: `bautagebuch`. Sichtbarkeit: **Public**. (Private Repositories können Pages nur in bezahlten Plänen. Das ist unkritisch: Im Repository liegt nur der Programmcode, keine eurer Daten.) **Create repository**.
3. Auf der leeren Repository-Seite den Link **uploading an existing file** anklicken.
4. Die ZIP-Datei entpacken und **alle Dateien und Ordner aus dem entpackten Ordner** (index.html, css, js, icons, …) ins Browserfenster ziehen. Unten **Commit changes**.
5. Oben auf **Settings**, links auf **Pages**. Bei *Build and deployment* als Source **Deploy from a branch** wählen, Branch **main**, Ordner **/ (root)**, **Save**.
6. Nach ein bis zwei Minuten steht oben auf der Pages-Seite die Adresse, z. B. `https://DEIN-NAME.github.io/bautagebuch/`. Diese Adresse brauchst du gleich.

## Teil 2: Die App bei Microsoft registrieren

Das ist nötig, damit sich die App überhaupt bei OneDrive anmelden darf. Es kostet nichts und braucht kein Azure-Abo.

1. **entra.microsoft.com** öffnen (alternativ portal.azure.com) und mit dem Microsoft-Konto anmelden, dessen OneDrive genutzt werden soll. Bei einem rein privaten Konto bittet Microsoft ggf. einmalig um eine kurze Kontoeinrichtung. Ein Abo oder Zahlungsmittel brauchst du nicht.
2. **App-Registrierungen** (Identität, Anwendungen) und dort **Neue Registrierung**.
3. Ausfüllen:
   - **Name:** Bautagebuch
   - **Unterstützte Kontotypen:** *Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten* (die Variante mit „persönliche Microsoft-Konten“ ist wichtig, damit ihr beide euch anmelden könnt)
   - **Umleitungs-URI:** Plattform **Single-Page-Anwendung (SPA)** und deine Adresse aus Teil 1, **mit Schrägstrich am Ende**, z. B. `https://DEIN-NAME.github.io/bautagebuch/`
4. **Registrieren**. Auf der Übersichtsseite die **Anwendungs-ID (Client)** kopieren. Das ist eine Zeichenfolge wie `1a2b3c4d-…`. Sie ist kein Geheimnis.
5. Weitere Berechtigungen müsst ihr nicht eintragen. Beim ersten Anmelden fragt Microsoft, ob die App auf eure Dateien zugreifen darf. Das bestätigt ihr.

## Teil 3: Client-ID eintragen

1. Auf GitHub im Repository die Datei **js/config.js** öffnen, Stift-Symbol (Edit).
2. `HIER-DIE-CLIENT-ID-EINTRAGEN` durch die kopierte ID ersetzen (die Anführungszeichen bleiben).
3. **Commit changes**. Nach ein bis zwei Minuten ist die Änderung online.

## Teil 4: Erste Anmeldung und Ordner anlegen (du)

1. Die Adresse auf dem Handy öffnen.
   - **iPhone:** in Safari öffnen, Teilen-Symbol, **Zum Home-Bildschirm**.
   - **Samsung:** in Chrome öffnen, Menü (drei Punkte), **App installieren** bzw. **Zum Startbildschirm hinzufügen**.
2. In der App unten **Mehr**, **Einstellungen**, **Mit Microsoft anmelden**.
3. Nach der Rückkehr **Eigenen OneDrive-Ordner „Bautagebuch“ verwenden** antippen. Ab jetzt entsteht in deinem OneDrive der Ordner `Bautagebuch`.

## Teil 5: Deine Freundin einladen

1. In **OneDrive** (App oder onedrive.live.com) den Ordner `Bautagebuch` öffnen und **Teilen** wählen.
2. Die E-Mail-Adresse ihres Microsoft-Kontos eingeben, **Bearbeiten erlauben** wählen, senden. Den Link kopieren.
3. Deine Freundin öffnet die App-Adresse auf ihrem Handy, fügt sie zum Startbildschirm hinzu und meldet sich unter **Einstellungen** mit **ihrem** Microsoft-Konto an.
4. Dort den Link in das Feld **Freigabe-Link** einfügen und **Mit geteiltem Ordner verbinden** antippen.

Ab jetzt sehen beide dieselben Einträge. Änderungen kommen innerhalb etwa einer Minute beim anderen an, solange die App offen ist, und sofort beim nächsten Öffnen.

---

## Gut zu wissen

- **Offline:** Alles wird zuerst auf dem Handy gespeichert und danach hochgeladen. Auf der Baustelle ohne Netz funktioniert die App weiter. Oben rechts siehst du, wie viele Änderungen noch warten.
- **Anmeldung nach 24 Stunden:** Microsoft lässt Anmeldungen von Web-Apps nach spätestens 24 Stunden ablaufen. Dann zeigt die App „Anmeldung nötig“, ein Tipp auf **Mit Microsoft anmelden** genügt. Nichts geht verloren, nicht synchronisierte Änderungen bleiben auf dem Gerät.
- **Gleichzeitig denselben Eintrag bearbeiten:** Jeder Eintrag ist eine eigene Datei. Zwei Personen stören sich nur, wenn sie genau denselben Eintrag gleichzeitig ändern. Dann gilt die zuletzt gespeicherte Änderung.
- **Fotos** werden vor dem Hochladen auf 1800 Pixel Kantenlänge verkleinert. Das spart Platz und Datenvolumen.
- **Datenschutz:** Eure Daten liegen nur in eurem OneDrive. Die Anmeldung erfolgt direkt zwischen App und Microsoft, es gibt keinen Server dazwischen. Sperre die Handys mit Code oder Face ID, denn die Anmeldung bleibt auf dem Gerät gespeichert.
- **Dateien im OneDrive:** `daten/` (alle Einträge als Textdateien), `fotos/` (Fotos und Vorschaubilder), `dokumente/<Kategorie>/` (eure PDFs und Bilder). Die Dokumente könnt ihr dort auch direkt öffnen. Löscht oder verschiebt in `daten/` und `fotos/` nichts von Hand.
- **Neue Version der App einspielen:** Dateien im GitHub-Repository ersetzen (Add file, Upload files). Eure Daten bleiben unberührt, weil sie in OneDrive liegen.
- **Sicherung:** Unter Einstellungen gibt es eine Sicherung aller Einträge als JSON-Datei.

## Wenn etwas nicht klappt

| Meldung / Problem | Ursache und Lösung |
|---|---|
| „redirect_uri … does not match“ (AADSTS50011) | Die Umleitungs-URI bei Microsoft weicht von der App-Adresse ab. Sie muss exakt gleich sein, inkl. `https://`, Groß-/Kleinschreibung und Schrägstrich am Ende, und als Plattform **Single-Page-Anwendung** eingetragen sein. |
| „Application … not found“ (AADSTS700016) | Client-ID in js/config.js falsch kopiert, oder die Änderung ist noch nicht online (ein bis zwei Minuten warten, Seite neu laden). |
| Anmeldung funktioniert nur mit meinem Konto, nicht mit dem meiner Freundin | Beim Anlegen der Registrierung wurde ein Kontotyp ohne „persönliche Microsoft-Konten“ gewählt. In der Registrierung unter *Authentifizierung* die Kontotypen anpassen. |
| „Auf diesen Link kann … nicht zugegriffen werden“ | Der Ordner wurde nicht für genau das Konto freigegeben, mit dem sie in der App angemeldet ist, oder nur mit Leserecht. In OneDrive erneut teilen, Bearbeiten erlauben. |
| Anmeldung vom Home-Bildschirm-Symbol auf dem iPhone bricht ab oder landet im Browser | Einmal die Adresse in Safari öffnen und dort anmelden. Falls es danach im Home-Bildschirm-Symbol weiter hakt, melde dich bitte, dann bauen wir eine Alternative. |
| Sync-Fehler mit Meldung | Unter Einstellungen steht der Text der Meldung. Schick sie mir, dann finden wir die Ursache. |
