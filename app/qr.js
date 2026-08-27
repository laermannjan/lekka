/**
 * A QR code, drawn from nothing but the bytes of a link.
 *
 * Only what a link needs: byte mode, error correction M, versions 1 to 10,
 * which hold 213 characters. Longer than that is not a link one shares.
 */

const ALIGNMENT = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
]

/** Per version: error codewords per block, and the size of each data block. */
const VERSIONS = [
  null,
  { ec: 10, blocks: [16] },
  { ec: 16, blocks: [28] },
  { ec: 26, blocks: [44] },
  { ec: 18, blocks: [32, 32] },
  { ec: 24, blocks: [43, 43] },
  { ec: 16, blocks: [27, 27, 27, 27] },
  { ec: 18, blocks: [31, 31, 31, 31] },
  { ec: 22, blocks: [38, 38, 39, 39] },
  { ec: 22, blocks: [36, 36, 36, 37, 37] },
  { ec: 26, blocks: [43, 43, 43, 43, 44] },
]

/** Bits left over after the interleaved codewords, per version. */
const REMAINDER = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0]

export class TooLong extends Error {}

/**
 * The modules of the code for `text`, as rows of booleans, dark is true.
 * The quiet zone is not included; the drawing adds it.
 */
export function encode(text) {
  const bytes = new TextEncoder().encode(text)
  const version = smallest(bytes.length)
  const codewords = interleave(payload(bytes, version), version)

  const size = 17 + version * 4
  const modules = empty(size)
  const fixed = empty(size)
  patterns(modules, fixed, version)
  place(modules, fixed, codewords, REMAINDER[version])

  return finished(modules, fixed, version, best(modules, fixed, version))
}

function smallest(length) {
  for (let version = 1; version <= 10; version++) {
    if (length <= capacity(version)) return version
  }
  throw new TooLong(`${length} bytes is more than a code of this size holds`)
}

function capacity(version) {
  const data = VERSIONS[version].blocks.reduce((sum, block) => sum + block, 0)
  return data - (countBits(version) === 8 ? 2 : 3)
}

function countBits(version) {
  return version < 10 ? 8 : 16
}

/** Mode, length, the bytes themselves, then the padding the standard prescribes. */
function payload(bytes, version) {
  const { blocks } = VERSIONS[version]
  const total = blocks.reduce((sum, block) => sum + block, 0)
  const bits = []
  const push = (value, width) => {
    for (let shift = width - 1; shift >= 0; shift--) bits.push((value >> shift) & 1)
  }

  push(0b0100, 4)
  push(bytes.length, countBits(version))
  for (const byte of bytes) push(byte, 8)

  const room = total * 8
  for (let i = 0; i < 4 && bits.length < room; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const data = []
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0))
  }
  for (let i = 0; data.length < total; i++) data.push(i % 2 === 0 ? 0xec : 0x11)
  return data
}

/** Data blocks column by column, then the error blocks the same way. */
function interleave(data, version) {
  const { ec, blocks } = VERSIONS[version]
  const pieces = []
  let taken = 0
  for (const size of blocks) {
    const piece = data.slice(taken, taken + size)
    taken += size
    pieces.push({ data: piece, ec: remainder(piece, ec) })
  }

  const out = []
  const widest = Math.max(...blocks)
  for (let i = 0; i < widest; i++) {
    for (const piece of pieces) if (i < piece.data.length) out.push(piece.data[i])
  }
  for (let i = 0; i < ec; i++) {
    for (const piece of pieces) out.push(piece.ec[i])
  }
  return out
}

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
for (let i = 0, value = 1; i < 255; i++) {
  EXP[i] = value
  LOG[value] = i
  value <<= 1
  if (value & 0x100) value ^= 0x11d
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]

function multiply(a, b) {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]
}

function generator(degree) {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= multiply(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

/** Reed-Solomon: what is left of the data after dividing by the generator. */
function remainder(data, degree) {
  const poly = generator(degree)
  const rest = new Array(degree).fill(0)
  for (const byte of data) {
    const factor = byte ^ rest[0]
    rest.shift()
    rest.push(0)
    for (let i = 0; i < degree; i++) rest[i] ^= multiply(poly[i + 1], factor)
  }
  return rest
}

function empty(size) {
  return Array.from({ length: size }, () => new Array(size).fill(false))
}

/** Finders, separators, timing, alignment, and the places the format words take. */
function patterns(modules, fixed, version) {
  const size = modules.length
  const set = (row, column, dark) => {
    if (row < 0 || column < 0 || row >= size || column >= size) return
    modules[row][column] = dark
    fixed[row][column] = true
  }

  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let row = -1; row <= 7; row++) {
      for (let column = -1; column <= 7; column++) {
        const edge = Math.max(Math.abs(row - 3), Math.abs(column - 3))
        set(top + row, left + column, edge !== 2 && edge <= 3)
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }

  const centres = ALIGNMENT[version]
  const last = centres[centres.length - 1]
  for (const row of centres) {
    for (const column of centres) {
      // The three that would sit on a finder are left out; the rest cross the timing line.
      const onFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === last) ||
        (row === last && column === 6)
      if (onFinder) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(row + dy, column + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1)
        }
      }
    }
  }

  set(size - 8, 8, true)
  for (const [row, column] of formatPlaces(size)) {
    modules[row][column] = false
    fixed[row][column] = true
  }
  if (version >= 7) {
    for (const [row, column] of versionPlaces(size)) fixed[row][column] = true
  }
}

/** The 15 places of the format word, in the order its bits are read. */
function formatPlaces(size) {
  const places = []
  for (let i = 0; i <= 5; i++) places.push([8, i])
  places.push([8, 7], [8, 8], [7, 8])
  for (let i = 9; i <= 14; i++) places.push([14 - i, 8])
  for (let i = 0; i <= 6; i++) places.push([size - 1 - i, 8])
  for (let i = 7; i <= 14; i++) places.push([8, size - 15 + i])
  return places
}

/** The 18 bits of the version word, each in two places, least significant first. */
function versionPlaces(size) {
  const places = []
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 3)
    const column = size - 11 + (i % 3)
    places.push([row, column], [column, row])
  }
  return places
}

/** Two columns at a time, upwards then downwards, skipping the timing column. */
function place(modules, fixed, codewords, remainderBits) {
  const size = modules.length
  const bits = []
  for (const byte of codewords) {
    for (let shift = 7; shift >= 0; shift--) bits.push((byte >> shift) & 1)
  }
  for (let i = 0; i < remainderBits; i++) bits.push(0)

  let taken = 0
  let upward = true
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step
      for (const column of [right, right - 1]) {
        if (fixed[row][column]) continue
        modules[row][column] = (bits[taken++] ?? 0) === 1
      }
    }
    upward = !upward
  }
}

const MASKS = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0,
]

function best(modules, fixed, version) {
  let chosen = 0
  let lowest = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const score = penalty(finished(modules, fixed, version, mask))
    if (score < lowest) {
      lowest = score
      chosen = mask
    }
  }
  return chosen
}

function finished(modules, fixed, version, mask) {
  const size = modules.length
  const out = modules.map((row, y) =>
    row.map((dark, x) => (fixed[y][x] ? dark : dark !== MASKS[mask](y, x))),
  )

  const bits = format(mask)
  formatPlaces(size).forEach(([row, column], i) => {
    out[row][column] = bits[i % 15] === 1
  })
  if (version >= 7) {
    const word = versionWord(version)
    versionPlaces(size).forEach(([row, column], i) => {
      out[row][column] = word[17 - Math.floor(i / 2)] === 1
    })
  }
  return out
}

/** 15 bits: error level M and the mask, protected by BCH and a fixed pattern. */
function format(mask) {
  const data = (0b00 << 3) | mask
  let value = data << 10
  for (let i = 14; i >= 10; i--) {
    if ((value >> i) & 1) value ^= 0b10100110111 << (i - 10)
  }
  const word = ((data << 10) | value) ^ 0b101010000010010
  return bitsOf(word, 15)
}

/** 18 bits: the version number and its BCH remainder. */
function versionWord(version) {
  let value = version << 12
  for (let i = 17; i >= 12; i--) {
    if ((value >> i) & 1) value ^= 0b1111100100101 << (i - 12)
  }
  return bitsOf((version << 12) | value, 18)
}

function bitsOf(value, width) {
  const bits = []
  for (let shift = width - 1; shift >= 0; shift--) bits.push((value >> shift) & 1)
  return bits
}

/** The four rules that keep a code readable: runs, blocks, false finders, balance. */
function penalty(modules) {
  const size = modules.length
  let score = 0

  const runs = (get) => {
    for (let a = 0; a < size; a++) {
      let run = 1
      for (let b = 1; b < size; b++) {
        if (get(a, b) === get(a, b - 1)) {
          run++
          continue
        }
        if (run >= 5) score += run - 2
        run = 1
      }
      if (run >= 5) score += run - 2
    }
  }
  runs((row, column) => modules[row][column])
  runs((column, row) => modules[row][column])

  for (let row = 0; row < size - 1; row++) {
    for (let column = 0; column < size - 1; column++) {
      const first = modules[row][column]
      if (
        first === modules[row][column + 1] &&
        first === modules[row + 1][column] &&
        first === modules[row + 1][column + 1]
      )
        score += 3
    }
  }

  const FINDER = [true, false, true, true, true, false, true, false, false, false, false]
  const REVERSED = [...FINDER].reverse()
  const matches = (get, a, b) =>
    FINDER.every((want, i) => get(a, b + i) === want) ||
    REVERSED.every((want, i) => get(a, b + i) === want)
  for (let a = 0; a < size; a++) {
    for (let b = 0; b + FINDER.length <= size; b++) {
      if (matches((row, column) => modules[row][column], a, b)) score += 40
      if (matches((column, row) => modules[row][column], a, b)) score += 40
    }
  }

  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10
  return score
}

/** The code as an SVG string: one path of squares, sized by whatever holds it. */
export function svg(text, { quiet = 4 } = {}) {
  const modules = encode(text)
  const size = modules.length + quiet * 2
  const parts = []
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
    })
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    'shape-rendering="crispEdges" role="img" aria-label="The link as a QR code">' +
    `<rect width="${size}" height="${size}" fill="#FFFFFF"/>` +
    `<path d="${parts.join('')}" fill="#1B1B19"/></svg>`
  )
}
