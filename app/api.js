// Die API des Servers. Der Schlüssel geht als Kopfzeile mit, nie in der URL.
const kopf = schlüssel => schlüssel ? { "x-edit-key": schlüssel } : {};

async function auswerten(res) {
  const körper = await res.json().catch(() => ({}));
  if (res.ok) return körper;
  const grund = Array.isArray(körper.fehler) ? körper.fehler.join("; ")
              : körper.fehler ?? `Fehler ${res.status}`;
  throw Object.assign(new Error(grund), { status: res.status });
}

// fetch wirft bei einem unerreichbaren Server dieselbe nichtssagende Meldung
// wie bei fehlendem Netz. Der Unterschied ist für die Fehlersuche der ganze
// Punkt, also wird er hier gemacht und nicht dem Nutzer überlassen.
async function ruf(url, optionen) {
  let res;
  try {
    res = await fetch(url, optionen);
  } catch (ursache) {
    const erreichbar = globalThis.navigator?.onLine ?? true;
    throw Object.assign(new Error(erreichbar
      ? "Server nicht erreichbar. Läuft er? (mise run dev)"
      : "Offline, und die Karte liegt nicht im Zwischenspeicher."),
      { status: 0, ursache });
  }
  return auswerten(res);
}

export const anlegen = karte =>
  ruf("/api/recipes", { method: "POST", body: JSON.stringify(karte) });

export const holen = id =>
  ruf(`/api/recipes/${id}`);

export const ersetzen = (id, schlüssel, karte) =>
  ruf(`/api/recipes/${id}`, { method: "PUT", headers: kopf(schlüssel),
    body: JSON.stringify(karte) });

export const löschen = (id, schlüssel) =>
  ruf(`/api/recipes/${id}`, { method: "DELETE", headers: kopf(schlüssel) });
