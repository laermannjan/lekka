// „Meine Karten“ gibt es nur auf diesem Gerät. Der Server kennt keine Nutzer
// und kann seine Karten nicht auflisten - wer keinen Link hat, findet nichts.
// Diese Liste ist die Sammlung der Links, die hier angelegt oder geöffnet wurden.
const SCHLÜSSEL = "lekka.karten";

const speicher = () => globalThis.localStorage;

export function alle(ablage = speicher()) {
  try {
    const roh = JSON.parse(ablage?.getItem(SCHLÜSSEL) ?? "[]");
    return Array.isArray(roh) ? roh.filter(e => e && typeof e.id === "string") : [];
  } catch {
    return [];
  }
}

const sichern = (einträge, ablage) =>
  ablage?.setItem(SCHLÜSSEL, JSON.stringify(einträge));

export const finden = (id, ablage = speicher()) => alle(ablage).find(e => e.id === id) ?? null;

// Legt an oder aktualisiert. Ein einmal bekannter Schlüssel geht nie verloren,
// nur weil die Karte später über den Nur-Lesen-Link geöffnet wurde.
export function merken(eintrag, ablage = speicher()) {
  const einträge = alle(ablage);
  const alt = einträge.find(e => e.id === eintrag.id);
  const neu = { ...alt, ...eintrag, schlüssel: eintrag.schlüssel ?? alt?.schlüssel,
                gesehen: new Date().toISOString() };
  if (!neu.schlüssel) delete neu.schlüssel;
  sichern([neu, ...einträge.filter(e => e.id !== eintrag.id)], ablage);
  return neu;
}

export function vergessen(id, ablage = speicher()) {
  sichern(alle(ablage).filter(e => e.id !== id), ablage);
}

export const darfÄndern = (eintrag) => Boolean(eintrag?.schlüssel);
