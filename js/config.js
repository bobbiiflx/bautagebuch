// Einstellungen der App. Nur die clientId muss nach der Microsoft-Einrichtung eingetragen werden
// (siehe SETUP.md, Schritt 1). Die Client-ID ist kein Geheimnis.
export const CONFIG = {
  clientId: 'HIER-DIE-CLIENT-ID-EINTRAGEN',

  // "common" erlaubt private Microsoft-Konten (outlook.com, hotmail.com, live.com ...) und Arbeitskonten.
  authority: 'https://login.microsoftonline.com/common',

  // Files.ReadWrite.All wird gebraucht, damit auch ein von dir geteilter Ordner beschrieben werden kann.
  scopes: ['User.Read', 'Files.ReadWrite.All', 'offline_access'],

  // Name des Ordners im eigenen OneDrive, in dem alle Daten liegen.
  rootFolder: 'Bautagebuch',

  // Wie oft (Sekunden) nach Änderungen der anderen Person gefragt wird, solange die App offen ist.
  pollSeconds: 60,

  version: '0.1.0',
};
