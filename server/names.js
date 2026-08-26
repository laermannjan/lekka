import { newId } from '../app/id.js'

const SCALED = `karpfen pangolin waran natter aal barsch dorsch echse forelle gecko
hecht iguana kaiman leguan makrele molch nattern ottern python rochen salm scholle
stint tilapia unke viper wels zander drache schuppe kobra anaconda`.split(/\s+/)

const TAILED = `fuchs biber dachs eichhorn otter marder luchs wolf hase kater
pfau quokka lemur ozelot panther puma reh serval tiger waschbaer wiesel zobel
gepard koala nerz ratte skunk stinktier wombat yak`.split(/\s+/)

/** A readable label plus four random characters, so names do not collide. */
export function newName() {
  return `${pick(SCALED)}-${pick(TAILED)}-${newId(4)}`
}

function pick(words) {
  const [byte] = crypto.getRandomValues(new Uint32Array(1))
  return words[byte % words.length]
}
