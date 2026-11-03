import { splitAside } from './card.js'
import { t } from './i18n.js'
import { phrase, stepsOf } from './recipe.js'
import { divider, element, icon, menuItem, said, slide, uses } from './ui.js'
import {
  deleteStep, ingredientOf, ingredientsOf, insertAfter, joined, merge, mergeable, moveIngredient,
  named, parentOf, rowOf, setStep, shortOf, sources, split, stepsIn, storedForm, unbraced, validate,
} from './edit.js'

/**
 * Writing a recipe, new or not: the recipe as it is read, with every part of it in reach.
 *
 * What it is called, how much it makes and what comes before the first step are fields at
 * the top. Each step is drawn as it reads, and a tap on its words or what goes in opens
 * it in a sheet. Its line carries what joins it to the step above; a cut beside its words
 * splits it; `+ Step` under it puts a new one after it. A new recipe is the same page with
 * nothing in it yet.
 *
 * The screen owns its repaint. Everything else in the app rebuilds from the link, which
 * would re-read the recipe from the server and lose the draft, so this is one element that
 * draws itself again and hands back a recipe only when it is saved.
 */
export function renderWriter({ draft, fresh = false, onSave, onClose }) {
  let current = draft
  let dirty = false
  let faults = []
  let undo = null
  const box = element('div', 'writer')

  const change = (next) => {
    current = next
    dirty = true
    if (faults.length) faults = validate(current)
    paint()
  }
  const number = (step) => stepsIn(current).indexOf(step) + 1

  function paint() {
    const steps = stepsIn(current)
    const entries = new Map()
    for (const strand of current.strands)
      for (const entry of stepsOf({ preparations: [], root: strand })) entries.set(entry.node, entry)

    box.replaceChildren(
      bar(),
      fields(),
      steps.length ? element('p', 'lead', t('Tap a step to change it.')) : null,
      element('ol', 'method writing', undefined, steps.length ? steps.map((step, index) => stepItem(step, index + 1, entries.get(step))) : [first()]),
      report(),
      undo,
    )
  }

  function bar() {
    const cancel = button('plain', t('Cancel'), () => {
      if (dirty && !confirm(t('Leave without saving? The changes are lost.'))) return
      onClose()
    })
    return element('div', 'bar', undefined, [cancel, element('span', 'middle', fresh ? t('New recipe') : t('Edit')), button('save', t('Save'), commit)])
  }

  /* ---- what the recipe is ---- */

  function fields() {
    // Where it came from is a note with a name in front, and so are its other names, which
    // are kept as they were; the rest are notes of its own, one a line.
    const source = current.notes.find((note) => note.startsWith('source:'))?.replace(/^source:\s*/, '') ?? ''
    const aliases = current.notes.filter((note) => note.startsWith('aliases:'))
    const own = current.notes.filter((note) => !note.startsWith('source:') && !note.startsWith('aliases:'))
    const about = { source, own }
    // Typed into without a repaint, so the caret stays where it is.
    const notes = () => {
      current.notes = [...(about.source.trim() ? [`source: ${about.source.trim()}`] : []), ...aliases, ...about.own]
      dirty = true
    }

    const title = input('title', current.title ?? '', t('What is it called?'), (text) => {
      current.title = text
      dirty = true
    })
    if (fresh && !current.title) queueMicrotask(() => title.focus())
    const yields = input('', current.yields ?? '', t('e.g. 4 servings'), (text) => {
      current.yields = text.trim() || null
      dirty = true
    })
    const note = area('note', own.join('\n'), t('e.g. keeps 5 days'), (text) => {
      about.own = text.split('\n').map((line) => line.trim()).filter(Boolean)
      notes()
    })
    const from = input('', source, 'https://', (text) => {
      about.source = text
      notes()
    })

    return element('section', 'fields', undefined, [
      labelled(t('Name'), title),
      element('div', 'pair', undefined, [labelled(t('Yield'), yields), labelled(t('Note'), note)]),
      labelled(
        t('Before'),
        element('div', 'before-list', undefined, [
          ...current.preparations.map(beforeRow),
          add(t('Preparation'), () => {
            current.preparations = [...current.preparations, { kind: 'preparation', text: '', aside: null }]
            dirty = true
            paint()
            ;[...box.querySelectorAll('.before-list input')].at(-1)?.focus()
          }),
        ]),
        t('What has to be known or done before the first step: when to start, the oven, the tin. What happens later is said by the step it happens in.'),
      ),
      labelled(t('Source'), from),
    ])
  }

  function beforeRow(prep, index) {
    const field = input('', prep.aside ? `${prep.text} (${prep.aside})` : prep.text, t('e.g. start the evening before'), (text) => {
      const { text: body, aside } = splitAside(text.trim())
      current.preparations[index] = { kind: 'preparation', text: body.trim(), aside: aside ?? null }
      dirty = true
    })
    const remove = tool('minus', t('Remove'), () => change({ ...current, preparations: current.preparations.filter((_, at) => at !== index) }))
    return element('div', 'row', undefined, [field, remove])
  }

  /* ---- the steps ---- */

  function stepItem(step, n, entry) {
    const before = mergeable(current, step)
    const line = element('div', 'divider', undefined, [
      hollow(),
      ...divider(n).children,
      before ? tool('join', t('Merge step {n} with step {m}', { n, m: n - 1 }), () => mergeSheet(step, n)) : hollow(),
    ])
    const words = element('div', 'said', undefined, [
      element('p', 'sentence', undefined, said(phrase(entry))),
      tool('cut', t('Split step {n}', { n }), () => splitSheet(step, n)),
    ])
    words.onclick = () => stepSheet(step, n)
    const list = entry.ingredients.length ? uses(entry.ingredients, 1) : null
    if (list) list.onclick = () => stepSheet(step, n)
    const next = add(t('Step'), () => stepSheet(null, n + 1, step), 'add-step')
    next.setAttribute('aria-label', t('Add a step after step {n}', { n }))
    return element('li', '', undefined, [line, words, list, next])
  }

  function first() {
    return element('li', 'first', undefined, [
      divider(1),
      add(t('First step'), () => stepSheet(null, 1, null), 'add-step'),
      element('p', 'lead', t('Say it as you would tell someone, and what goes in. Each next step carries on where the one before stops.')),
    ])
  }

  /* ---- a step, opened ---- */

  /**
   * A step's sheet, or a new step's: its sentence, its short form, what goes in, and what
   * it takes from before. Nothing is written until `Done`; a new step that is never done
   * is never added.
   */
  function stepSheet(step, n, after = null) {
    const isNew = step === null
    const taken = isNew ? (after ? [after] : []) : step.children.filter((child) => child.kind === 'step')
    const offered = [...new Set([...taken, ...sources(current, step)])]
    const chosen = new Set(taken)

    const sentence = area('sentence', isNew ? '' : unbraced(step.sentence), isNew ? t('What is to be done? For example: slice the loaf') : step.verb)
    const verb = input('', isNew ? '' : step.verb, t('Short'))
    const aside = input('', isNew ? '' : (step.aside ?? ''), t('Note'))
    // A short form nobody wrote follows the sentence, until somebody writes one.
    let guessed = isNew || step.verb === ''
    verb.addEventListener('input', () => (guessed = false))

    const rows = []
    const list = element('div', 'rows')
    const chips = element('div', 'chips')
    const recheck = () => {
      if (guessed) verb.value = shortOf(sentence.value)
      const present = new Set(named(sentence.value, rows.map((row) => ({ name: row.word() }))).map((one) => one.name))
      chips.replaceChildren(...rows.filter((row) => row.word()).map((row) => nameChip(row.word(), present.has(row.word()), sentence, recheck)))
    }
    sentence.addEventListener('input', recheck)

    /** One ingredient's two fields, and a menu for what else can be done with it. */
    const makeRow = (node) => {
      const written = node ? rowOf(node) : { amount: '', name: '' }
      const amount = input('amount', written.amount, t('Amount'))
      const name = input('name', written.name, t('Ingredient'))
      name.addEventListener('input', recheck)
      const row = {
        amount,
        name,
        word: () => ingredientOf({ name: name.value }).name,
        write: () => {
          const fields = ingredientOf({ amount: amount.value, name: name.value })
          return node ? Object.assign(node, fields) : fields
        },
      }
      const more = tool('more', t('{name}: move or remove', { name: written.name || t('Ingredient') }), () => {
        const elsewhere = isNew || !node ? [] : stepsIn(current).filter((one) => one !== step)
        const menu = slide(
          element('h2', '', name.value || t('Ingredient')),
          element('div', 'menu', undefined, [
            ...elsewhere.map((other) =>
              menuItem('down', t('Into step {n} · {verb}', { n: number(other), verb: other.verb }), () => {
                menu.close()
                apply()
                change(moveIngredient(current, node, other))
              }),
            ),
            menuItem('trash', t('Remove'), () => {
              menu.close()
              rows.splice(rows.indexOf(row), 1)
              row.element.remove()
              recheck()
            }, 'danger'),
          ]),
        )
      })
      row.element = element('div', 'row ingredient', undefined, [amount, name, more])
      rows.push(row)
      list.append(row.element)
      return row
    }
    for (const node of isNew ? [] : ingredientsOf(step)) makeRow(node)

    const from = element('div', 'chips', undefined, offered.map((one) => {
      const chip = element('button', 'chip', undefined, [icon(chosen.has(one) ? 'check' : 'plus', 14), `${number(one)} · ${one.verb}`])
      chip.type = 'button'
      chip.setAttribute('aria-pressed', String(chosen.has(one)))
      chip.onclick = () => {
        if (chosen.has(one)) chosen.delete(one)
        else chosen.add(one)
        chip.setAttribute('aria-pressed', String(chosen.has(one)))
        chip.firstChild.replaceWith(icon(chosen.has(one) ? 'check' : 'plus', 14))
      }
      return chip
    }))

    const apply = () => {
      const ingredients = rows.filter((row) => row.name.value.trim() || row.amount.value.trim()).map((row) => row.write())
      const fields = { sentence: sentence.value, verb: verb.value.trim() || shortOf(sentence.value), aside: aside.value, ingredients, from: [...chosen] }
      sheet.close()
      change(isNew ? insertAfter(current, after, fields).draft : setStep(current, step, fields))
    }

    // From a card written before every preparation came first: kept where it is, and only
    // to be taken away.
    const legacy = isNew ? [] : step.children.filter((child) => child.kind === 'preparation')
    const sheet = slide(
      head(isNew ? t('New step') : t('Step {n}', { n }), t('Done'), apply, () => sheet.close()),
      part(t('As the recipe says it'), [sentence, chips], t('The ingredients the sentence names are found on their own. Tap one to put it into the sentence.')),
      part(t('Short'), [element('div', 'pair', undefined, [verb, aside])], t('Stands in the table and in the list while cooking. A time in it becomes a timer.')),
      part(t('Ingredients'), [list, add(t('Ingredient'), () => makeRow(null).amount.focus())], t('A sort or preparation in brackets: flour (type 1150).')),
      offered.length
        ? part(t('From step'), [from], t('What goes into this one from earlier steps. Nothing ticked: it starts a strand of its own, which a later step brings together with the rest.'))
        : null,
      legacy.length
        ? part(t('Before'), legacy.map((prep) => {
            const line = element('div', 'row', undefined, [element('span', 'text', prep.aside ? `${prep.text} (${prep.aside})` : prep.text)])
            line.append(tool('minus', t('Remove'), () => {
              step.children = step.children.filter((child) => child !== prep)
              line.remove()
              dirty = true
            }))
            return line
          }))
        : null,
      isNew ? null : button('plain danger', t('Delete step'), () => {
        sheet.close()
        remove(step, n)
      }),
    )
    sheet.classList.add('step-sheet')
    recheck()
    if (isNew) queueMicrotask(() => sentence.focus())
  }

  /** A name the step takes, ticked when its sentence says it; tapped, it is put in where the caret is. */
  function nameChip(word, present, sentence, recheck) {
    const chip = element('button', 'chip', undefined, [icon(present ? 'check' : 'plus', 14), word])
    chip.type = 'button'
    chip.setAttribute('aria-pressed', String(present))
    chip.setAttribute('aria-label', t('Put {name} into the sentence', { name: word }))
    chip.onclick = () => {
      if (present) return
      const at = sentence.selectionStart ?? sentence.value.length
      const before = sentence.value.slice(0, at)
      const space = before && !/\s$/.test(before) ? ' ' : ''
      sentence.value = `${before}${space}${word}${sentence.value.slice(at)}`
      sentence.dispatchEvent(new Event('input'))
      sentence.focus()
    }
    return chip
  }

  /* ---- merging and splitting ---- */

  function mergeSheet(step, n) {
    const before = mergeable(current, step)
    const words = joined(before, step)
    const sentence = area('sentence', words.sentence)
    const verb = input('', words.verb, t('Short'))
    const aside = input('', words.aside, t('Note'))
    const after = parentOf(current, step)
    const apply = () => {
      sheet.close()
      change(merge(current, step, { sentence: sentence.value, verb: verb.value, aside: aside.value }))
    }
    const sheet = slide(
      head(t('Steps {a} + {b}', { a: n - 1, b: n }), t('Merge'), apply, () => sheet.close()),
      part(t('As the recipe says it'), [sentence], t('Both sentences stand one after the other. Read it over, whether they sound right together.')),
      part(t('Short'), [element('div', 'pair', undefined, [verb, aside])]),
      part(t('Ingredients'), [uses([...ingredientsOf(before), ...ingredientsOf(step)], 1)], t('The ingredients of both steps. The same one in both is added up.')),
      after ? part(t('After'), [element('p', 'quiet', t('{n} · {verb} carries on from the merged step.', { n: number(after), verb: after.verb }))]) : null,
    )
    sheet.classList.add('step-sheet')
  }

  function splitSheet(step, n) {
    const moving = new Set()
    const sentence = area('sentence', unbraced(step.sentence), step.verb)
    const next = area('sentence', '', t('What is to be done next?'))
    const verb = input('', '', t('Short'))
    let guessed = true
    verb.addEventListener('input', () => (guessed = false))
    next.addEventListener('input', () => guessed && (verb.value = shortOf(next.value)))
    const moved = element('div', 'moved')
    const ticks = ingredientsOf(step).map((node) => {
      const tick = element('button', 'tick', undefined, [icon('check', 14)])
      tick.type = 'button'
      tick.setAttribute('aria-pressed', 'false')
      tick.setAttribute('aria-label', t('Move {name} into the new step', { name: node.name }))
      tick.onclick = () => {
        if (moving.has(node)) moving.delete(node)
        else moving.add(node)
        tick.setAttribute('aria-pressed', String(moving.has(node)))
        moved.replaceChildren(...(moving.size ? [uses([...moving], 1)] : []))
      }
      const { amount, name } = rowOf(node)
      return element('div', 'row ticked', undefined, [tick, element('span', 'amount', amount), element('span', 'name', name)])
    })
    const apply = () => {
      if (!next.value.trim()) return next.focus()
      sheet.close()
      const kept = { sentence: sentence.value, verb: step.verb, aside: step.aside ?? '' }
      change(split(current, step, { keep: kept, next: { sentence: next.value, verb: verb.value.trim() || shortOf(next.value) }, moving: [...moving] }).draft)
    }
    const sheet = slide(
      head(t('Split step {n}', { n }), t('Split'), apply, () => sheet.close()),
      part(t('Step {n}', { n }), [sentence, ...ticks], ticks.length ? t('Ticked ingredients move into the new step.') : null),
      divider(t('new: {n}', { n: n + 1 })),
      part(t('New step after it'), [next, verb, moved], t('It carries on from what step {n} makes. What came after step {n} comes after it.', { n })),
    )
    sheet.classList.add('step-sheet')
    queueMicrotask(() => next.focus())
  }

  /* ---- deleting, and taking it back ---- */

  function remove(step, n) {
    const before = structuredClone(current)
    const back = button('plain', t('Undo'), () => {
      undo = null
      change(before)
    })
    undo = element('div', 'undo glass', undefined, [element('span', '', t('Step {n} deleted', { n })), back])
    change(deleteStep(current, step))
    setTimeout(() => {
      if (undo?.contains(back)) {
        undo = null
        paint()
      }
    }, 8000)
  }

  /* ---- saving ---- */

  /** What is still wrong, each line leading to the step it is about. */
  function report() {
    if (faults.length === 0) return null
    return element('div', 'notice warning faults', undefined, faults.map((fault) => {
      const node = fault.node ?? fault.nodes?.[0] ?? null
      const step = node?.kind === 'step' ? node : node ? parentOf(current, node) : null
      if (!step) return element('p', '', fault.message)
      return button('plain', fault.message, () => stepSheet(step, number(step)))
    }))
  }

  /**
   * The card is only ever stored as text, so saving writes it and reads it back first;
   * what would not survive is refused, and nothing is sent.
   */
  async function commit() {
    faults = validate(current)
    if (faults.length) return paint()
    if (!dirty && !fresh) return onClose()
    const text = storedForm(current)
    if (text === null) {
      faults = [{ kind: 'unstorable', message: t('This card does not come back the same when stored. Nothing was saved.') }]
      return paint()
    }
    const failed = await onSave(text)
    if (failed) {
      faults = [{ kind: 'unsaved', message: failed }]
      return paint()
    }
    dirty = false
    onClose()
  }

  paint()
  return box
}

/* ---- the parts the screen is built from ---- */

function input(className, value, placeholder, onInput = null) {
  const node = element('input', className)
  node.type = 'text'
  node.value = value
  node.placeholder = placeholder
  node.autocomplete = 'off'
  if (onInput) node.addEventListener('input', () => onInput(node.value))
  return node
}

/** A field for words that may run to several lines, growing as they do. */
function area(className, value, placeholder = '', onInput = null) {
  const node = element('textarea', className)
  node.value = value
  node.placeholder = placeholder
  node.rows = 1
  const fit = () => {
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }
  node.addEventListener('input', () => {
    fit()
    onInput?.(node.value)
  })
  requestAnimationFrame(fit)
  return node
}

function labelled(text, field, hint = null) {
  return element('div', 'labelled', undefined, [element('p', 'label', text), field, hint ? element('p', 'hint', hint) : null])
}

function part(title, children, hint = null) {
  return element('section', 'part', undefined, [element('p', 'label', title), ...children, hint ? element('p', 'hint', hint) : null])
}

/** A sheet's head: cancel on the left, what it is in the middle, the one thing to do on the right. */
function head(title, action, run, cancel) {
  return element('div', 'bar sheet-head', undefined, [button('plain', t('Cancel'), cancel), element('span', 'middle', title), button('save', action, run)])
}

function button(className, text, run) {
  const node = element('button', className, text)
  node.type = 'button'
  node.onclick = run
  return node
}

function add(text, run, className = '') {
  const node = element('button', `add ${className}`.trim(), undefined, [icon('plus', 16), text])
  node.type = 'button'
  node.onclick = run
  return node
}

/** A small round button on a step's line or beside its words. */
function tool(name, label, run) {
  const node = element('button', 'tool', undefined, [icon(name, 17)])
  node.type = 'button'
  node.setAttribute('aria-label', label)
  node.onclick = (event) => {
    event.stopPropagation()
    run()
  }
  return node
}

/** The room a tool takes where there is none, so a step's number stays in the middle. */
function hollow() {
  const node = element('span', 'tool hollow')
  node.setAttribute('aria-hidden', 'true')
  return node
}
