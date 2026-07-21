// Leichter Zugangsschutz: ein geteiltes Passwort (APP_PASSWORD, serverseitig).
// Verhindert, dass Fremde die App aufrufen und Credits verbrennen. Das ist kein
// vollwertiges Benutzer-Login — für ein internes Tool aber ausreichend.

export function checkPassword(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("APP_PASSWORD ist serverseitig nicht gesetzt.");
  const given = req.headers["x-app-password"] || "";
  // Längen-unabhängiger, konstantzeit-naher Vergleich.
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
