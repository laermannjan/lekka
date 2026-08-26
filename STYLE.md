# Style

Colours, type and placement. What is drawn where is in `LAYOUT.md`.

## Colours

| Name | Value | Used for |
|---|---|---|
| ink | `#1B1B19` | body text |
| grey | `#7A7A72` | qualifiers, notes, labels, secondary buttons, anything secondary |
| accent | `#1E6B4C` | header bar, card frame, active switch, links, focus |
| accent pale | `#A9C6B6` | text on the accent bar that is not the title, disabled borders |
| line | `#4E9067` | every rule: grid, toolbar, list separators, button outlines |
| ground | `#F2F1EC` | page, toolbar, separators inside the step and shopping views |
| white | `#FFFFFF` | cells, ingredient rows, free areas, controls |
| preparation | `#E6EFE9` | preparation band, message band, "editable" badge |
| warning | `#8C2F1E` | error text |
| warning ground | `#F6E3DF` | background of an error message |

## Type

| | |
|---|---|
| face | IBM Plex Sans, self-hosted, antialiased |
| size | 14 px everywhere, buttons and inputs included |
| weights | 450 body, 600 verbs, preparation, card titles in lists, 700 the page title |
| line height | 1.3, notes 1.25, the structure editor 1.5 |
| upper case | page title and the small labels in the toolbar, both letter-spaced 0.06 em |
| figures | tabular in every column that holds numbers |

Two deliberate exceptions to the single size:

- the **structure editor** is 13 px monospace, because it shows a file, not a card
- the **role badge** in the overview is 12 px

## Hierarchy without size

Rank comes from three means only:

1. **weight** - a verb is 600, its note 450
2. **colour** - a name is ink, its qualifier grey
3. **position** - the verb above, the note below

No second size in the card, no italics, no underline outside links.

**Colour does not encode content.** Steps are not coloured by kind. That was
tried and dropped: classifying cost more than it gave.

## Inside the card

- Ingredients left aligned, steps **centred**. Centring is what makes a merge
  visible: a cell spanning four rows sits at their middle.
- Amounts right aligned, unit grey between amount and name, qualifier grey after
  the name.
- An amount without a number (`nach Geschmack`) is grey, left aligned, and takes
  the amount and unit columns together.
- Notes sit under their verb, centred, grey, balanced across lines.
- Nothing wraps in the ingredient column; the grid scrolls sideways instead.
- Preparation lines span the full width, centred, weight 600, on the preparation
  colour. Card notes likewise but grey on white.
- Column headers sit on the ground colour in grey upper case.

Column widths: amount 58 px, unit 54 px, a step column at least 150 px. Rows are
at least 21 px with 1 px of vertical padding. The card is at most 1140 px wide.

## Frame and bars

- The page is one card on the ground colour, bordered 2 px in the accent.
- **Header bar** in the accent, no rule below it: title upper case 700 on the
  left; yield and card notes on the right in accent pale.
- **Toolbar** below it on the ground colour, closed by a 1 px line: scale left,
  views middle, actions right, each group with a small grey upper-case label.
- **Switches** are segmented: buttons sharing one outline, separated by 1 px
  lines, the active one filled with the accent and white on it.
- **Buttons** are outlined in the line colour on white and invert to accent on
  hover. Secondary ones drop the outline until hovered and are grey. Disabled
  ones are grey with a pale accent outline.
- **Message band** under the toolbar, on the preparation colour, closed by a
  line; an error swaps it for the warning ground and warning text. Empty, it
  disappears entirely.

## The other screens

**Overview.** A list, separated above and below each row by 1 px lines. The card
name is weight 600 and links to reading; a badge follows it, 12 px 600, in
accent on preparation when this device can edit, grey on ground when it cannot.
The actions sit right aligned in the same row.

**Step and shopping views.** At most 70 characters wide. Rows separated by 1 px
in the **ground** colour, not the line colour: these are lists, not a grid. A
step shows its number in a 24 px grey tabular column, the verb 600, ingredients
and note grey. A shopping line shows the amount in a 96 px column, right
aligned, weight 600.

## Editing

- Editable fields get a 2 px radius and, on focus, a 1 px accent ring drawn as a
  shadow instead of an outline, so it hugs the text.
- Everything else - buttons, links, the textarea - shows the ordinary focus
  ring: a 2 px accent outline, offset 1 px.
- In edit mode, an empty amount, unit or qualifier shows a faint placeholder
  (`–`, `–`, `…`) permanently, so an empty field can be found and hit.
- An empty note is invisible until the cell is hovered or focused, then it
  appears with the word "Hinweis". Notes are rare; placeholders on every cell
  would be noise.

## Print

Drop the toolbar and every editing affordance, thin the card frame to 1 px, and
let the grid stand without its scroll container.
