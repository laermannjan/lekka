# Style

Colours, type and placement. What is drawn where is in `LAYOUT.md`.

## Tokens

| Name | Value | Used for |
|---|---|---|
| ink | `#1B1B19` | body text |
| grey | `#7A7A72` | qualifiers, notes, labels, anything secondary |
| accent | `#1E6B4C` | header bar, card frame, active controls |
| accent pale | `#A9C6B6` | text on the accent bar that is not the title |
| line | `#4E9067` | every rule in the grid |
| ground | `#F2F1EC` | page and toolbar background |
| white | `#FFFFFF` | cells and ingredient rows |
| preparation | `#E6EFE9` | the preparation band |
| warning | `#8C2F1E` | error messages |

| Name | Value |
|---|---|
| type | IBM Plex Sans, self-hosted |
| size | 14 px, **one size for everything**, buttons included |
| weights | 450 body, 600 verbs and preparation, 700 title |
| line height | 1.3, notes 1.25 |
| row height | at least 21 px, 1 px vertical padding |
| amount column | 58 px, unit column 54 px, step column at least 150 px |
| card width | at most 1140 px |

## Hierarchy without size

There is one type size. Rank is expressed by three means only:

1. **weight** - a verb is 600, its note 450
2. **colour** - the name is ink, its qualifier is grey
3. **position** - the verb above, the note below it

No second size, no italics, no underlines outside links.

**Colour does not encode content.** Steps are not coloured by kind. That was
tried and dropped: the effort of classifying was out of proportion to the gain.

## Placement in the card

- Ingredients left aligned, steps **centred**. Centring is what makes a merge
  visible: a cell spanning four rows sits at their middle.
- Amounts right aligned with tabular figures, so digits line up down the column.
- A unit sits between amount and name, in grey.
- An amount without a number (`nach Geschmack`) takes both columns and is grey.
- Notes sit under their verb, centred, grey, balanced across lines.
- Nothing wraps in the ingredient column; the table scrolls sideways instead.

## The frame

- The page is one card on the ground colour, bordered 2 px in the accent.
- **Header bar** in the accent: title upper case, weight 700, letter-spaced
  0.06 em; yield and card notes on the right in accent pale.
- **Toolbar** below it on the ground colour, separated by a line: scale on the
  left, views in the middle, actions on the right. Each group carries a small
  grey upper-case label.
- **Switches** are segmented: buttons sharing one border, the active one filled
  with the accent, white on it.
- **Buttons** are outlined in the line colour on white; secondary ones drop the
  border until hovered.

## Editing

- An editable field shows a 1 px accent outline when focused, nothing before.
- Empty fields show a placeholder only in edit mode and only on hover: `–` for
  amount and unit, `…` for a qualifier, the word for note.
- The change counter sits in the toolbar, in the accent colour.

## Print

Drop the toolbar and every editing affordance, thin the card frame to 1 px, and
let the table stand without a scroll container.
