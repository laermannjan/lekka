import { newId } from '../app/id.js'

const TASTES = `wuerzig herzhaft suess salzig sauer bitter rauchig nussig fruchtig
cremig knusprig saftig zart deftig frisch mild scharf kraeftig buttrig honigsuess`.split(/\s+/)

const FOODS = `safran anis fenchel kardamom kuemmel lorbeer majoran muskat oregano
paprika pfeffer rosmarin salbei thymian vanille zimt basilikum estragon ingwer koriander
haferflocke walnuss quitte mirabelle holunder rhabarber`.split(/\s+/)

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** A card is named after its title, so the data directory can be read by eye. */
export function cardId(title) {
  return `${slug(title)}-${newId()}`
}

export function collectionId() {
  return `${pick(TASTES)}-${pick(FOODS)}-${newId(4)}`
}

export function slug(title) {
  const plain = (title ?? '')
    .toLowerCase()
    .replace(/[äöüß]/g, (letter) => UMLAUTS[letter])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
  return plain || 'karte'
}

function pick(words) {
  const [number] = crypto.getRandomValues(new Uint32Array(1))
  return words[number % words.length]
}
