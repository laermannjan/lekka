# Style

Colours, type and placement. What is drawn where is in `LAYOUT.md`.

The page is a datasheet: a white sheet with a hard edge, laid on a grey ground,
holding tables of numbers. Nothing is coloured to look important, nothing is
enlarged to look important, and every device on the page means one thing.

## Colours

| Name | Value | Used for |
|---|---|---|
| ink | `#14140F` | text, and every border round a control |
| grey | `#6D6D64` | units, qualifiers, notes, anything secondary |
| faint | `#9C9C93` | a value that is absent, the edge of a box you cannot change |
| rule | `#D3D2CB` | every hairline: cells of a table, rows of a list, the recess in a field |
| dashed | `#4A4A43` | the rule under a section heading |
| paper | `#FFFFFF` | the sheet, cells, fields |
| ground | `#E4E3DE` | outside the sheet |
| shade | `#F4F3EF` | the head of a places bar, the row a table grows by |
| wash | `#E8EFE9` | a preparation row |
| accent | `#14724B` | the recipe's left edge, and `Create` |
| link | `#1B3FBF` | a link, and the act that commits |
| gold | `#F0A81E` | what is set, where you stand, and `Import` |
| amber | `#FBEEB5` | a chosen row, a callout |
| tint blue | `#DCEAF8` | a duration, marked where it stands |

Each tint has a dotted edge of its own hue. A pale fill inside a black rule reads
as two things; filled and edged in one hue it reads as one.
| warning | `#A8331D` | `Delete`, `Remove`, and anything that went wrong |

**Every colour has one job.**

| | |
|---|---|
| **blue** | a link, and the act that commits what you have done - `Save`, `Add`, `Import` in its own dialog |
| **gold** | what is set, and where you are standing - the scale in force, the `Now` column |
| **green** | the edge of a recipe, and making one that did not exist |
| **red** | this destroys something, or something went wrong |
| **black** | the pointer is on it, and only while it is |

Black is the heaviest fill the page has, so it is spent on the one state that
lasts no longer than the hand does. What stays chosen is gold, which can sit on
the page all day without shouting. This was learnt the hard way: a black block
for the current tab pulled the eye off the recipe every time.

Colour never encodes what a step *is*. Steps are not coloured by kind. That was
tried and dropped: classifying cost more than it gave.

## Type

| | |
|---|---|
| face | JetBrains Mono, self-hosted, variable weight, antialiased |
| size | 14 px for everything a recipe is made of |
| weights | 400 body, 600 verbs, names, preparations, column headings; 700 the wordmark |
| line height | 1.35, notes 1.25 |
| figures | monospaced by the face, so every column of numbers lines up |

One face throughout. A recipe is a table of quantities, so what lines up is what
matters, and a machine face is what the subject is: amounts, temperatures,
durations, ids.

Three sizes exist, and only three:

- **18 px** the wordmark
- **16 px** the name of what is on the page
- **14 px** everything else

The first two answer "what is this page holding", which a recipe itself never has
to answer. Inside the table there is no second size, no italics, and no underline
outside links.

Small capitals with letter-spacing are kept for **machine-readable values only** -
a collection's name, a version. A column heading is not one of those: it is set
bold at body size, in the case it was written in. `Ingredient` over a column of
ingredients does not need announcing twice, once by what it says and once by how
it is set.

## Hierarchy without size

Rank comes from three means only:

1. **weight** - a verb is 600, its note 400
2. **colour** - a name is ink, its qualifier grey
3. **position** - the verb above, the note below

## Depth

**Depth is an offset block, never a blur.** A control casts ink out of the page;
a field is pressed into it with the same shadow turned round. That direction is
the whole of the difference between a thing you push and a thing you fill.

| | |
|---|---|
| a control | `2px 2px 0` in ink, and it moves into its own shadow when pressed |
| a box | `3px 3px 0` at 13% ink - the sheet, a table, a dialog |
| a field | `inset 2px 2px` in the rule colour |

## Rules

Three weights, and each one means something:

| | |
|---|---|
| 1 px dashed `dashed` | divides sections of the page, under a heading, 6 on 5 |
| 1 px solid `rule` | divides cells of a table, rows of a list |
| 1 px solid `ink` | draws round anything you can press, and closes the head of a table |

The dashed rule is drawn as a gradient rather than `border-style: dashed`,
because the dash a browser picks is 3 px on 3 px and reads as a row of specks.

## Controls

- **Every control is a box**: 1 px of ink, square, filled white, tight padding.
  There is no borderless button - a thing you may press says so by being drawn.
- **Hover** inverts it to solid ink. **Pressed**, it translates into its shadow.
- **Filled** buttons say what kind of act they are: blue commits, green makes,
  gold brings in, red destroys. A filled button carries a trailing `→` when it
  leads somewhere.
- **Switches** are segments sharing one outline, cut by single lines, the one in
  force filled gold.
- **Fields** are the inverse: ink border, white ground, the shadow inward, the
  text sitting low and left of centre. Focus is a 2 px blue outline, inset.

## Where a control goes

Sorted by what it touches, which settles every question of placement:

| touches | goes |
|---|---|
| the page | the masthead, beside the name |
| how the recipe is drawn | above the table, beside what it changes - the scale, `Fit to screen` |
| the recipe itself | below the table, out of the way of reading - `Edit`, `Save`, `Done` |

A control that would do nothing is not drawn. `Fit to screen` is offered only on a
recipe that does not fit, and `Cancel` reads `Done` when there is nothing to
cancel: leaving a recipe you only looked at is not an undo.

## Tags

A tag carries an identifier and carries it **whole**: the id, the key, the
version. Never a word standing in for the value - a box reading `KEY` says
nothing the column heading above it has not already said, and hides the one thing
the row was asked for.

Mono small capitals, a dotted border - a value that was generated rather than
typed should not be drawn with the same edge as a control - and a tint that says
what kind of identifier it is, so a recipe is told from a collection before either
is read. The border is dotted in the tint's own hue, not in ink.

The same treatment marks a value inside running text: a **duration** in a verb, on
the pale blue, and a **preparation** belonging to a step, on the wash. Both are one
thing lifted out of a line of words, which is what a tag is for.

## Inside the table

- Ingredients left aligned, steps **centred**. Centring is what makes a merge
  visible: a cell spanning four rows sits at their middle.
- Amounts right aligned, unit grey between amount and name, qualifier grey after
  the name.
- An amount without a number (`nach Geschmack`) is grey, left aligned, and takes
  the amount and unit columns together.
- Notes sit under their verb, centred, grey, balanced across lines.
- **A duration in a verb is tagged**, on the pale blue tint. How long a step takes
  is the one thing a cook looks for while the pan is already hot, and it is buried
  in the middle of the words. It is the same pattern the specification sums, so
  the tags on the table are exactly what the `Time` row adds up.
- Nothing wraps in the ingredient column; the table scrolls sideways instead.
- The head of the table is white and closed by a line of ink. Weight separates
  it from the body, not a fill.
- A preparation belonging to the **recipe** is a row under the head, on the wash
  colour, spanning everything, with the three ingredient fields beside it empty.
  Its words are pinned to the part of the table you can see and centred in that:
  a table can be three times the width of the screen, and words centred across all
  of it sit in the middle of a scroll nobody has made.
  One belonging to a **step** is drawn inside that step's cell, above its verb, as
  a tag on the wash: it is something done before that step, and a band over the
  step's column said instead that it belonged to the column.
- The recipe's left edge is 3 px of accent. It is the one place a colour names
  what a box is rather than what state it is in.

Column widths: amount 58 px, unit 54 px, a step column between 120 and 240 px.
Rows are at least 21 px with 2 px of vertical padding.

The table is **as wide as it needs to be**, up to the width of the sheet. One
that fits is drawn whole; only one that does not scrolls sideways.

## The sheet

One sheet, at most 1080 px, always the same width, with a 1 px ink edge. The
table inside it may be wider than the screen and scroll; the sheet never moves,
so the page keeps its edges however long the recipe is.

- **Masthead**: the app's name at 18 px 700, which is the way home; the
  collection stamped beside it; page actions on the right. Closed by a rule of
  ink.
- **Section heading**: a name at 16 px 600 with a dashed rule the full width
  under it. It closes the heading and opens the block.
- **Foot**: the path of the page, and the version, over a hairline. Pushed to the
  bottom, so a short recipe still has a page under it.
- **Message band**: a callout, double framed - a thick edge, a gap, then a dashed
  line inside it. Two frames is how a printed page says "read this one thing
  first" without a second size or a heavier weight. It sits under the masthead
  and above the heading, because it is about the page, not about the recipe.

## The other screens

**Overview.** A table of three columns: `Recipe`, `Delete`, `Remove`. The last
row is where the table grows - `Import` in gold, `Create` in green - on the shade
colour, the way `+ Ingredient` sits at the foot of the editor's table.

**Specification.** A label and value grid, two pairs to a line. Rows a person
wrote are fields while the recipe is being written; rows worked out from it stay
text, because there is nothing to type into a sum.

**Sharing dialog.** A small box in the middle of a dimmed page, framed like
everything else: 1 px ink, at most 320 px, no radius. Its heading sits on the
shade colour and reads as a sentence, not a label. Under it the code on white, at
most 240 px, quiet zone included; then the note in grey; then the link in full,
wrapped rather than cut, because a link one cannot read is a link one cannot
type.

**Reading a recipe that will not fit.** The whole table, scrolled sideways, with
every cell **held at the left edge** until the step that takes it arrives and
pushes it out. That hold is what the reading is for: the edge always says what is
standing on the counter rather than what was bought.

Rows never move, because a step stands on exactly the rows it took, and a row that
has been taken over keeps the height its ingredient asked for.

Above it, three places name where things are on the screen rather than which
column they are: `Done`, `Now`, `Next`, bold, with `Now` filled gold. They are
fixed to the screen and never scroll, and `Next` is narrower than a column on
purpose - a recipe that runs on has to say so.

The hold has to be paid for out of a narrow screen, so the three ingredient
columns are capped there rather than fixed at 58 and 54 px, and the name wraps
inside them. A qualifier drops to its own line.

## Editing

- **Every part of a recipe is written where it is drawn.** No form is put over
  the table: a row's four values are its three cells opened as fields, a step's
  verb, note and preparations are fields in its cell, and what the recipe
  yields, its notes and the preparations belonging to it are fields in the
  specification.
- **One cell is open at a time.** Everything else stays exactly as it is read.
  A field is one line and cuts where a cell wraps, so a table of nothing but
  fields is a table that cannot be read while it is being written in - which is
  the one thing the editor must not cost.
- **A tap opens the cell it lands on**, with the caret in that cell and its text
  selected, so typing replaces it. Tapping a row opens all four of its fields,
  because they are one line of the recipe split across three cells and tab should
  run along them. Tapping a step opens that step's cell alone.
- A cell commits when the caret leaves it, or on enter, and goes back to being
  read. The fields keep the cell's own alignment and colour, and a step's fields
  wrap and grow the way the cell they replaced does.
- An empty amount, unit or qualifier shows a faint placeholder (`–`, `–`, `…`)
  in the row that is open, so an empty field can be found and hit.
- `+ Ingredient` adds an empty row and puts the caret in it, and `Process in
  step` makes an unnamed step and puts the caret in that. There is no form to
  fill in first: the thing is made and then named, and a blank one is simply a
  fault until it is not.
- **A step's preparations are fields in its cell.** Read, a preparation attached
  to a step is drawn over that step's column, which is when it happens. Written,
  it belongs with the step - it is one of the things the step says about itself,
  and a band cell has nothing to say about which step it is attached to. So the
  band holds nothing while writing.
- **Every field of the open cell is drawn**, empty or not, in the order the
  things happen: what comes before the step, then the step, then its note. Only
  one cell is open at a time, so there is room for all of them - and a field that
  has to be discovered says nothing about what it is for. The placeholder is what
  says it.
- A tappable cell is marked by the cursor and by the amber wash under the
  pointer - never by a colour of its own.
- A **chosen row** takes the amber across all three of its fields. There is no
  column of checkboxes: a row is chosen by holding it, or by shift or command
  clicking it, so writing costs the table no column that reading has to make room
  for. A click reaches the row through its fields, so shift still chooses from
  anywhere in it; a press does not, because holding a row is how a thumb chooses
  it and holding inside a field is how a thumb selects text.
- **Shift, command or a long press on a step** says "these rows are what goes
  in": it ticks what the step holds, and from there rows are ticked and unticked
  like any others. The bar then offers `Apply` instead of `Process in step`.
- **Deleting is done from the bar the ticked rows raise**, where what else would
  go is already spelled out. It takes the rows themselves rather than what holds
  them: `Process in step` asks what these rows belong to, because that is what a
  new step would take, and deleting asks nothing. A step is deleted from the same
  bar while its inputs are being chosen.
- The name of the recipe is a field in the heading; its yield, notes and
  preparations are fields in the specification. A preparation that belongs to a
  step is edited in that step's form, and one that belongs to the recipe has no
  form to open, so it is not offered as a tap.

## Fitting

A recipe wider than the screen has two answers, and they are exclusive:

- **read it a step at a time**, which keeps the type and gives up seeing it all
- **fit it to the screen**, which keeps the whole table and gives up the type

So it is one button, saying what it will do: `Fit to screen`, then `Actual size`.
Fitting shrinks the table until it is inside the room it has and never magnifies
one that already fits, and it turns the reading affordances off, because there is
nowhere left to scroll to.

## Print

Drop the masthead, the foot, every bar and every editing affordance, and let the
table stand without its scroll container.

Paper is one page wide and cannot be scrolled, so a printed recipe is fitted to
the page rather than measured: the ingredient block takes only what its content
needs, and the steps divide what is left over, evenly. Where that leaves a column
narrower than the word standing in it, the word breaks. It is the one place where
a word may be broken - on screen there is somewhere to scroll to; on paper there
is not, and a word that will not break draws over the cell beside it instead.

There is no density setting. There was one - a `Print small` button that printed
at 11 px - and it asked a question about paper on a screen, where nothing could
be pressed against the answer. The tracks above already fit a recipe to the page,
and a screen fitted to itself is not also fitted to the sheet.

## Words

The thing on the screen is a **recipe**. The card is how it is drawn, and
`.lekka` files, the format and the code still say card, because that is what they
are about: a table where rows are ingredients and columns are time.
