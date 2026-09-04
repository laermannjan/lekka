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

The same treatment marks a **duration** in a verb, on the pale blue, and a
**preparation** over its column, on the wash. Both are one thing lifted out of a
line of words, which is what a tag is for.

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
- **A preparation is a tag over the column of the step it comes before**, on the
  wash, above the line that names that column - which is when it happens. One
  belonging to the **recipe** stands over the ingredient block, left-aligned with
  `Ingredient` under it: it is the same thing said about the first step there is,
  and the ingredient block is what comes before every column there is.
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

- **A table being written is the table it is read as, to the pixel.** Same
  columns, same rows, same cells, not one field in it - and the only thing that
  ever differs is colour. Everything you can type is in the form, which is a
  layer over the page.

  It was not always so. Cells opened where they stood, and a field is not the
  words it replaces: it has a border and a padding they do not, so it wraps at a
  different width and the one piece of text being looked at reflowed as it was
  reached for. Measured on `roggenquarkbrot`, opening `backen` left every column
  and every row exactly where it was and moved the words inside that one cell by
  13px, 2px narrower and 16px shorter - which is small, and is at the precise
  point the eye is on. A column of boxes that came and went beside it moved the
  rest.
- **The form is docked to the foot of the window, not centred**, so the head of
  the table stays above it, and it is as tall as it needs to be. That is what a
  layer buys over a panel in the page: a panel has to fit the room left over, and
  how much room is left over depends on how long the recipe is - which is not a
  thing the place a control lives should depend on. On a narrow screen it is
  where a thumb already is.
- **It is modal, and the page behind it is dimmed.** The cost is real and was
  chosen: the table is dimmed, not hidden - the form is 640px at the foot of a
  wider window - so the shading still reads, but the list of inputs also says on
  its own what each one brings.
- **The table says two things, in two colours.** Blue rings the one row or step
  the form is open on. Amber shades what goes into it. A cell can be both, so
  the ring is a ring and not a fill.
- **A step is an L, and takes one colour.** Its cell stands at the right of the
  rows it takes, and the blank those rows wait in reaches back under them. Both
  halves are the step: shaded, lit and tapped as one, or it is an L with its
  corner missing. A row is its three cells and stops there - the blank is not the
  row's, it is the space the row is standing in while it waits.
- A tappable cell is marked by the cursor and by a wash under the pointer, in
  grey and never in amber: amber is what a row going into the open step is
  painted, and a hover in the same colour would claim the row had been chosen by
  pointing at it.
- **A tap opens the whole of what it lands on.** A row is one line of the recipe
  split across three cells, not three things, so tapping any of them opens the
  line; tapping a step opens that step.
- **The form says what kind of thing it holds and where it stands** - `Step`,
  `column 03` - and not its name. The name is in a field two lines below, and a
  heading that repeats the field under it is one more thing to read and one more
  thing to keep in step. It is also what took the name off the button: `Delete`
  used to carry it, which made a button as wide as the step was long.
- **Every field is named above it, not inside it.** A placeholder is the one
  piece of text that goes away exactly when the field has something in it, so
  three stacked fields that had all been filled were three identical boxes. Every
  field is drawn, empty or not, in the order the things happen: what comes before
  the step, then the step, then its note.
- **Nothing moves until `Apply`.** Typing writes nothing, ticking writes nothing;
  a row that leaves a step becomes a strand of its own and is drawn somewhere
  else, and having the table rearrange itself under every keystroke is no way to
  decide anything.
- **A box stands for an input, not for a row.** A step takes whole strands, so
  unticking one row of a strand it swallowed is not a move the format has: what
  goes into `vermengen` is `abkühlen`, not the Roggenschrot three steps inside
  it. The boxes are in the form, which is also what let the table keep the same
  number of columns while a recipe is being written as while it is read.
- **An input says what it brings, where that is worth saying.** A step brings
  everything under it and how much cannot be seen from its name, so it says
  `4 ingredients`; an ingredient brings its own one row, and a list that said so
  on every line would be a column of the word `row`.
- **A ticked strand is shaded whole**: the input itself, every step between it
  and the rows, and the rows. The step being written is not shaded - the shading
  says what is coming *in*.
- **`+ Step` guesses**, and the boxes show the guess: every ingredient still
  waiting for a step, or - when none is waiting - the ends of the strands, which
  is how two of them are joined.
- `+ Ingredient` adds an empty row and opens the form on it. There is no form to
  fill in first: the thing is made and then named, and a blank one is simply a
  fault until it is not.
- **`Save` and `Cancel` are the only buttons on the page**, under the table where
  `Edit` stood a moment ago. What can be done to one row or one step is done in
  the form, where that row or step is.
- **Everything that comes and goes is drawn below the row of buttons** - the
  faults, the messages. One appearing above the table pushes the table down under
  the hand that is working in it.
- **Deleting says what else it would take** before it does it, because there is
  no undo: a step left holding nothing goes too, and so can the step above it.
- The name of the recipe is a field in the heading; its yield, notes and
  preparations are fields in the specification. A preparation that belongs to a
  step is a field in that step's sheet, and one that belongs to the recipe is
  written in the specification, so a band cell is not offered as a tap.

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
