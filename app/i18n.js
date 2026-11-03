/**
 * What the screens say, in the language the phone is set to: German where it asks for
 * German, English otherwise. A recipe is shown in its own words whatever this is; only
 * what lekka says around it changes.
 *
 * The English is the key, so a line with no translation reads as it was written and
 * nothing ever shows a key. `{name}` is filled from `values`. Outside a browser - the
 * tests, the server - it is always English, whatever the machine is set to.
 */
export const language =
  globalThis.document && /^de\b/i.test(globalThis.navigator?.language ?? '') ? 'de' : 'en'

export function t(text, values = {}) {
  const said = (language === 'de' && GERMAN[text]) || text
  return said.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''))
}

/** Exported for the test that every line the screens say has its German. */
export const GERMAN = {
  // The library, search and adding
  Recipes: 'Rezepte',
  'The library did not load. {reason}': 'Die Rezepte wurden nicht geladen. {reason}',
  'Add a recipe': 'Rezept hinzufügen',
  '{name}: devices and sign out': '{name}: Geräte und Abmelden',
  'Search recipes, ingredients': 'Rezepte, Zutaten suchen',
  'Clear search': 'Suche leeren',
  'Close search': 'Suche schließen',
  'Write one': 'Selbst schreiben',
  'Paste one': 'Einfügen',
  'From the web: share the page to lekka with the Add to lekka shortcut.':
    'Aus dem Netz: die Seite mit dem Kurzbefehl „Add to lekka“ an lekka teilen.',
  Recipe: 'Rezept',
  Add: 'Hinzufügen',
  Cancel: 'Abbrechen',
  'Paste a recipe': 'Rezept einfügen',
  'No recipes yet.': 'Noch keine Rezepte.',
  'Share a recipe page to lekka with the Add to lekka shortcut, or write one with +.':
    'Teile eine Rezeptseite mit dem Kurzbefehl „Add to lekka“ an lekka, oder schreib eins mit +.',
  'Names, other names, ingredients and steps.': 'Namen, andere Namen, Zutaten und Schritte.',
  'Nothing for “{query}”.': 'Nichts für „{query}“.',
  '1 recipe': '1 Rezept',
  '{n} recipes': '{n} Rezepte',
  'This recipe does not read.': 'Dieses Rezept lässt sich nicht lesen.',
  'Also known as': 'Auch bekannt als',
  Ingredient: 'Zutat',

  // A recipe
  'No recipe under this link.': 'Unter diesem Link gibt es kein Rezept.',
  'Line {line}: {message}': 'Zeile {line}: {message}',
  'Back to recipes': 'Zurück zu den Rezepten',
  'Table, edit, share or delete': 'Tabelle, bearbeiten, teilen oder löschen',
  '1 step': '1 Schritt',
  '{n} steps': '{n} Schritte',
  for: 'für',
  Less: 'Weniger',
  More: 'Mehr',
  Steps: 'Schritte',
  '{name}, in {unit}': '{name}, in {unit}',
  'Change any amount, and the whole recipe follows.': 'Ändere eine Menge, und das ganze Rezept passt sich an.',
  'Back to the recipe’s amounts': 'Zurück zu den Mengen des Rezepts',
  'Start cooking': 'Kochen starten',
  'Shopping list': 'Einkaufsliste',
  'Show as a list': 'Als Liste zeigen',
  'Show as a table': 'Als Tabelle zeigen',
  Edit: 'Bearbeiten',
  Share: 'Teilen',
  Delete: 'Löschen',
  'Delete {title} for everyone who can open it?': '{title} für alle löschen, die es öffnen können?',
  'The recipe was not deleted.': 'Das Rezept wurde nicht gelöscht.',
  'New recipe': 'Neues Rezept',
  'Not saved. {reason}': 'Nicht gespeichert. {reason}',

  // Cooking
  'You are cooking {title}. Stop it and cook {next}?': 'Du kochst gerade {title}. Aufhören und {next} kochen?',
  'You are cooking {title}, with a timer running. Stop it and cook {next}?':
    'Du kochst gerade {title}, und ein Timer läuft. Aufhören und {next} kochen?',
  'You are cooking {title}, with {n} timers running. Stop it and cook {next}?':
    'Du kochst gerade {title}, und {n} Timer laufen. Aufhören und {next} kochen?',
  'Stop cooking? Its timer stops too.': 'Kochen beenden? Der Timer wird auch gestoppt.',
  'Stop cooking? Its {n} timers stop too.': 'Kochen beenden? Die {n} Timer werden auch gestoppt.',
  'Next: {step}': 'Weiter: {step}',
  'Done cooking': 'Fertig gekocht',
  'Previous step': 'Vorheriger Schritt',
  'Back to the recipe': 'Zurück zum Rezept',
  'Step {n} of {count}': 'Schritt {n} von {count}',
  'Step {n}': 'Schritt {n}',
  'All ingredients, or end cooking': 'Alle Zutaten, oder Kochen beenden',
  'Start {time} timer': 'Timer für {time} starten',
  'Stop the timer': 'Timer stoppen',
  '{title} · step {n}': '{title} · Schritt {n}',
  '{title} timer, step {n}: back to it': 'Timer {title}, Schritt {n}: dorthin',
  'All ingredients': 'Alle Zutaten',
  'End cooking': 'Kochen beenden',
  'Cooking {title}, step {n}': 'Am Kochen: {title}, Schritt {n}',
  Done: 'Fertig',

  // Shopping
  'Share 1 item': '1 Zutat teilen',
  'Share {n} items': '{n} Zutaten teilen',
  '{title}, for {made}': '{title}, für {made}',
  'Shopping list: {title}': 'Einkaufsliste: {title}',
  Copied: 'Kopiert',
  'Everything is at home.': 'Alles ist schon da.',
  'At home': 'Zu Hause',
  'Enter what you already have. Tap what you do not need to cross it out.': 'Trag ein, was du schon hast. Was du nicht brauchst, tipp an: es wird gestrichen.',
  '{name}: not needed, cross it out': '{name}: brauche ich nicht, streichen',
  '{amount} to buy': '{amount} kaufen',
  '{amount} still to buy': 'noch {amount} kaufen',
  '{name} at home': '{name}, schon da',
  '{name} at home, in {unit}': '{name}, schon da, in {unit}',
  '{name}: put back on the list': '{name}: zurück auf die Liste',

  // Sharing, signing in, devices
  'Who holds this did not load. {reason}': 'Wer es hat, wurde nicht geladen. {reason}',
  'This recipe is not yours to share.': 'Dieses Rezept kannst du nicht teilen.',
  'Not shared. {reason}': 'Nicht geteilt. {reason}',
  'It was not revoked.': 'Es wurde nicht zurückgezogen.',
  'Nobody has signed in here yet. The link that makes the first person is in the server’s log.':
    'Hier hat sich noch niemand angemeldet. Der Link für die erste Person steht im Log des Servers.',
  'Sign in': 'Anmelden',
  'That name and password do not match.': 'Name und Passwort passen nicht zusammen.',
  Join: 'Beitreten',
  'This link has been used already, or it has expired. Ask for another.':
    'Dieser Link wurde schon benutzt oder ist abgelaufen. Frag nach einem neuen.',
  'The list did not load.': 'Die Liste wurde nicht geladen.',
  Devices: 'Geräte',
  'No link was made.': 'Es wurde kein Link erstellt.',
  'Signed out.': 'Abgemeldet.',
  People: 'Personen',
  'Remove {name}? They are signed out everywhere, and any recipe they own becomes yours.':
    '{name} entfernen? Die Person wird überall abgemeldet, und ihre Rezepte gehören dann dir.',
  'They were not removed.': 'Die Person wurde nicht entfernt.',
  'You were signed out.': 'Du wurdest abgemeldet.',
  'The link is gone.': 'Den Link gibt es nicht mehr.',
  'The server said {status}.': 'Der Server antwortete mit {status}.',
  'No connection.': 'Keine Verbindung.',
  Name: 'Name',
  Password: 'Passwort',
  'what to call you': 'wie wir dich nennen',
  'at least 12 characters': 'mindestens 12 Zeichen',
  'Nobody has signed in here yet. This link makes the first person, and then stops working.':
    'Hier hat sich noch niemand angemeldet. Dieser Link legt die erste Person an und funktioniert danach nicht mehr.',
  '{who} invited you. Pick a name and a password, and they are yours from now on.':
    '{who} hat dich eingeladen. Wähl einen Namen und ein Passwort, sie gehören ab jetzt dir.',
  '{label} · this one': '{label} · dieses hier',
  'last seen {when}': 'zuletzt {when}',
  'Sign out': 'Abmelden',
  Revoke: 'Zurückziehen',
  'Invite someone': 'Jemanden einladen',
  '{name} · you': '{name} · du',
  'keeps this instance': 'betreut diese Instanz',
  Remove: 'Entfernen',
  'Send this to one person. It makes one account, then stops working, and expires in an hour.':
    'Schick das an eine Person. Es legt ein Konto an, funktioniert danach nicht mehr und läuft nach einer Stunde ab.',
  never: 'nie',
  'at some point': 'irgendwann',
  today: 'heute',
  yesterday: 'gestern',
  '{n} days ago': 'vor {n} Tagen',
  'Share {title}': '{title} teilen',
  'They may': 'Darf',
  'Read it': 'Lesen',
  'Read and change it': 'Lesen und ändern',
  Expires: 'Läuft ab',
  'days, or leave empty for never': 'Tage, oder leer für nie',
  'Choose somebody to share it with.': 'Wähl jemanden, mit dem du es teilst.',
  'Everyone who holds this recipe, and what they may do with it.':
    'Alle, die dieses Rezept haben, und was sie damit dürfen.',
  'Nobody yet.': 'Noch niemand.',
  'owns it': 'gehört es',
  'may read and change it': 'darf es lesen und ändern',
  'may read it': 'darf es lesen',
  '{what} · until {date}': '{what} · bis {date}',
  'Share with': 'Teilen mit',
  'Nobody else here yet. Invite somebody first.': 'Sonst ist hier noch niemand. Lad erst jemanden ein.',
  'holds nothing': 'hat nichts',
  Copy: 'Kopieren',
  'Press ⌘C': '⌘C drücken',

  // Writing a recipe
  Yield: 'Ergibt',
  Note: 'Notiz',
  'Note {n}': 'Notiz {n}',
  Before: 'Vorher',
  'Before {n}': 'Vorher {n}',
  Notes: 'Notizen',
  Step: 'Schritt',
  'Before it': 'Davor',
  Amount: 'Menge',
  Unit: 'Einheit',
  Qualifier: 'Zusatz',
  Takes: 'Nimmt',
  'Nothing is free to go into this step.': 'Nichts ist frei, um in diesen Schritt zu gehen.',
  Apply: 'Übernehmen',
  'A step has to take something. Tick what goes into it.': 'Ein Schritt muss etwas nehmen. Hak an, was hineingeht.',
  Close: 'Schließen',
  '{n} ingredients': '{n} Zutaten',
  '+ Ingredient': '+ Zutat',
  '+ Step': '+ Schritt',
  Now: 'Jetzt',
  Next: 'Danach',
  'column {n}': 'Spalte {n}',
  'Deleting {label} leaves {names} with nothing, so it goes too. Delete anyway?':
    'Ohne {label} bleibt {names} leer und fällt mit weg. Trotzdem löschen?',
  'Deleting {label} leaves {names} with nothing, so they go too. Delete anyway?':
    'Ohne {label} bleiben {names} leer und fallen mit weg. Trotzdem löschen?',
  Save: 'Speichern',
  'Saved.': 'Gespeichert.',
  'Saved. What you changed while it was sending is not - save again.':
    'Gespeichert. Was du beim Senden geändert hast, noch nicht - nochmal speichern.',
  'Leave without saving? The changes are lost.': 'Ohne Speichern verlassen? Die Änderungen gehen verloren.',
  'Add an ingredient first.': 'Füg zuerst eine Zutat hinzu.',
  'This card does not come back the same when stored. Nothing was saved.':
    'Dieses Rezept käme gespeichert nicht gleich zurück. Nichts wurde gespeichert.',
  'Give the recipe a name, then add the first ingredient.': 'Gib dem Rezept einen Namen und füg dann die erste Zutat hinzu.',
  'Add an ingredient, then a step that takes it.': 'Füg eine Zutat hinzu, dann einen Schritt, der sie nimmt.',
  'The recipe needs a name': 'Das Rezept braucht einen Namen',
  '{label} goes into no step': '{label} geht in keinen Schritt',
  'The recipe has no steps': 'Das Rezept hat keine Schritte',
  '{labels} never meet. Add a step that takes them all': '{labels} treffen sich nie. Füg einen Schritt hinzu, der alle nimmt',
  ' and ': ' und ',
  'Brackets cannot be part of a {what}. Put it in the note instead':
    'Klammern gehören nicht ins Feld „{what}“. Schreib es in die Notiz',
  'A colon cannot be part of a {what}. Put it in the amount instead':
    'Ein Doppelpunkt gehört nicht ins Feld „{what}“. Schreib es in die Menge',
  title: 'Titel',
  yield: 'Ergibt',
  name: 'Name',
  note: 'Notiz',
  preparation: 'Vorbereitung',
  instruction: 'Anweisung',
  'An ingredient needs a name': 'Eine Zutat braucht einen Namen',
  'A preparation needs something to do': 'Eine Vorbereitung braucht etwas zu tun',
  'A step needs a verb': 'Ein Schritt braucht ein Verb',
  '{label} has nothing going into it': 'In {label} geht nichts hinein',
  'A step with no verb': 'Ein Schritt ohne Verb',
  'an ingredient with no name': 'eine Zutat ohne Namen',
}
