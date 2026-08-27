import { newId } from '../app/id.js'

const DEGREES = `incredibly deeply subtly wildly truly gently boldly quietly richly
purely freshly softly warmly briskly utterly madly sweetly keenly hugely nimbly
barely fiercely oddly plainly`.split(/\s+/)

const TASTES = `delicious savoury smoky nutty fruity creamy crispy juicy tender hearty
spicy buttery honeyed tangy zesty salty peppery toasty silky syrupy sharp mellow
crumbly golden`.split(/\s+/)

const FOODS = `oatmeal saffron walnut quince rhubarb cinnamon pepper basil ginger
vanilla elderberry thyme sage fennel cardamom coriander chestnut apricot plum barley
buckwheat hazelnut mustard fig`.split(/\s+/)

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** A card is named after its title, so the data directory can be read by eye. */
export function cardId(title) {
  return `${slug(title)}-${newId()}`
}

export function collectionId() {
  return `${pick(DEGREES)}-${pick(TASTES)}-${pick(FOODS)}-${newId(4)}`
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
