# Writing a lekka recipe

How to turn any recipe - a web page, a photo of a book, a PDF, a few lines of text, an
idea - into a lekka recipe. Written for whoever does it, a person or a model. The
result is one JSON object, valid against `recipe.schema.json`.

## What a lekka recipe is

A recipe is a flow: ingredients go into a step, its result goes into the next step,
and the last step finishes the dish. lekka draws that flow as a table, rows for the
ingredients and columns for time, and also reads it out as a list of steps. Both come
from the same structure, so the structure has to be right.

In the list, each step is read out as its sentence: the instruction as a cook would
write it, with every ingredient the step takes named in braces. lekka puts the
amount and name there, scaled to however much is being made:

> `pour in {lukewarm water} and knead for 10 min, until smooth`
>
> reads: Pour in `350 ml lukewarm water` and knead for `10 min`, until smooth

Whoever cooks never has to look up how much: it is there where it goes in. Above the
steps, lekka gathers every ingredient from them into one list, with its aside, and
adds up what goes in more than once; the shopping list is that same list. Nobody
writes it: you write each ingredient once, as a child of the step it goes into.

There are three kinds of entry:

- An **ingredient** is one use of something that goes into the food. 300 g of flour in
  a preferment and 60 g more in the dough are two ingredients.
- A **step** is something done to what flows into it: its `children`. A step's
  children are ingredients, earlier steps, or both.
- A **preparation** is something done that nothing flows from: preheating the oven,
  greasing a tin, soaking skewers. It has no children and is no step's input.

The last step is the `root`. Everything flows into it, so the JSON nests from the end
of the recipe back to its beginning: the root's children are what the last step
takes, their children what those took, and so on down to the ingredients.

Any entry can have an `aside`: what you must know but do not do. On a step it is how,
or until when: `covered`, `until doubled`. On an ingredient it is what you need before
cooking, to choose, buy or prepare it: `Type 550`, `chopped`. An ingredient's aside is
shown in the list above the steps, never in them.

A step is written twice, for two readers. Its `step` is the short form, `knead 10
min`: the table's label, and where the timer comes from. Its `sentence` is what the
cook reads.

## How to get there

1. **List every ingredient as a use.** Each mention in the source is one ingredient,
   even when the same thing appears several times.
2. **Find where things meet.** Ingredients that go into one bowl together are children
   of the same step, next to each other. This decides the order, not the order of the
   source.
3. **Pull out what does not flow.** Tins, tools, preheating: these are preparations.
   Test every candidate: does it go into the food? If not, it is a preparation.
4. **Make each instruction one step with one verb.** Its short form takes the verb
   and parameters, its aside the condition; its sentence keeps the instruction as
   the source says it, with the step's ingredients put in braces.
5. **Nest.** Start from the last step, give it what it takes as children, and repeat
   until only ingredients and preparations are left.
6. **Give side strands their own steps.** A preferment, a soaker, a sauce made on the
   side, a roux: each is its own step, a child of the step it joins.
7. **Read it back** from the innermost steps outward. If that sounds like the recipe,
   the structure is right.

## Steps

- **One step, one verb.** Two verbs are two steps, unless they are one movement on one
  thing.
- **Split** where something waits or changes between two actions: knead, then rise,
  then shape. **Merge** where a step would merge nothing and change nothing: adding
  salt and then stirring is one step that takes the salt.
- **An ingredient joins at the step where it is added**, not where it was first
  mentioned. Water poured in for kneading is a child of the kneading step.
- **The verb first**, in the form the language uses for a recipe heading: `bake`,
  `fold`; in German the infinitive, `backen`, `falten`. Lower case.
- **Parameters right after the verb**, temperature before time: `bake 200 °C fan 60
  min`. Write times as a number and `s`, `min` or `h`, so they can become timers.
- **Three to five words**, not counting numbers. Anything longer belongs in the aside.
- **Use the trade's word** where it has one, and the same word for the same thing in
  every recipe: `proof`, `rest`, `cool`; in German bread baking `Stockgare` for the
  rise in the bowl and `Stückgare` for the rise in the tin.
- **The aside holds what you must know but do not do:** a condition (`no preheating,
  lowest rack`), the state to reach (`until doubled`), something to do during a long
  step (`slash lengthwise after 10 min`). The table shows it beside the step.

### The sentence

- **Write it as the cook would read it**, in the recipe's language and its word
  order: `mix {flour}, {salt} and {dry yeast}`; in German the verb last, `{Mehl},
  {Salz} und {Hefe} mischen`.
- **Name every ingredient the step takes in braces, once**, exactly as its name is
  written: `{lukewarm water}`, not `{water}`. The braces stand where the amount should
  be read, and lekka puts it there. Never mention one of them without braces, and
  never write an amount: the braces bring it, scaled.
- **Name what earlier steps made in plain words:** `the dough`, `den Sauerteig`, or
  nothing at all where it is obvious. Only the step's own ingredients take braces.
- **Say the step's time, heat and aside** where they belong in the sentence: `bake at
  220 °C for 40 min`, `cover and leave to rise for 1 h`. Times and temperatures are
  highlighted wherever they stand.
- **One instruction, one sentence.** Lower case, no full stop; lekka capitalises it.

## Ingredients

The steps show an ingredient by its amount and name alone. So decide for every word
you have about it: is it needed at the stove, or before?

- **The name** is what you reach for when the step comes: a noun, and any word that
  changes which thing you take. `black pepper`, not the white; `lukewarm water`, since
  cold would be wrong at that moment; `brown sugar`, `egg yolks`. A temperature it
  must have when it goes in is part of the name too: `water 35 °C`, `boiling water`.
  When a recipe uses two of a kind, the name tells them apart: `rye flour` and `wheat
  flour`. Nothing more: two or three words at most.
- **The aside** is for before cooking: what to buy, which kind to choose, how to
  prepare it before you start. A grade or variety (`Type 550`, `coarse`), what you do
  to it beforehand (`chopped`, `freshly ground`, `peeled`), an
  alternative (`or plain yogurt`, `e.g. sunflower`). It is shown in the list above
  the steps and on the shopping list, never in the steps. `salt` with the aside
  `coarse`, but `black pepper` as its name.
- **The same thing has the same name and aside every time it is used.** That is how
  the list knows to add it up: coarse salt in two steps is `salt`, `coarse` both
  times, and the list says 2 tbsp. `salt` and `coarse salt` would be two things to buy.
- **The amount** is the source's, as the source gives it: `300 g`, `2 tsp`, `1 cube`.
  A range stays a range, `40-60 g`; both ends scale. Words where there is no number,
  `pinch`, `to taste`; they do not scale. No amount at all is fine; leave it out.
- **Numbers are decimals**, `0.5 l` or `0,5 l`, never `½`: a fraction is read as words
  and will not scale.
- **Do not invent precision** the source does not have, and do not round away what it
  has.

## The rest of the recipe

- **`title`** is the name of the dish. What it makes goes in **`yields`**: a number and
  what of, `12 pancakes`, `1 loaf`.
- **`preparations`** are the ones that come before everything else. A preparation only
  one step needs is a child of that step instead, so it is done when it is needed.
- **`source`** is where the recipe came from, if anything says so: its address.
- **`aliases`** are the other names somebody might search for it under: other languages,
  the dish it is a kind of, what sets it apart. A vegan cheesecake on cashews might
  have `["cheesecake", "Käsekuchen", "vegan", "cashew"]`.
- **`notes`** hold what is worth knowing about the recipe as a whole and is not part of
  the flow: how it keeps, what it goes with, what to try next time. Not instructions.

## Language and units

Write in the language of the source and keep its units, unless whoever asks for the
recipe wants another language or other units. lekka does not mind which.

## Characters to avoid

lekka keeps a recipe as text, where round brackets and colons have a meaning of their
own. So:

- no round brackets in a title, yields, step, ingredient, preparation or aside; what
  would go in brackets is what the aside is for
- no colon in an ingredient's name

## Example

From this source:

> Mix flour, salt and dry yeast. Add lukewarm water and knead for 10 minutes. Cover
> and let rise for 1 hour. Grease a loaf tin, put the dough in and bake at 220 °C for
> 40 minutes.

```json
{
  "title": "Sandwich loaf",
  "yields": "1 loaf",
  "source": "https://example.com/sandwich-loaf",
  "aliases": ["white bread", "tin loaf", "yeast bread"],
  "root": {
    "step": "bake 220 °C 40 min",
    "sentence": "bake at 220 °C for 40 min",
    "children": [
      {
        "step": "put in tin",
        "sentence": "put the dough into the tin",
        "children": [
          { "preparation": "grease loaf tin" },
          {
            "step": "rise 1 h",
            "aside": "covered",
            "sentence": "cover and leave to rise for 1 h",
            "children": [
              {
                "step": "knead 10 min",
                "sentence": "pour in {lukewarm water} and knead for 10 min",
                "children": [
                  {
                    "step": "mix",
                    "sentence": "mix {flour}, {salt} and {dry yeast}",
                    "children": [
                      { "ingredient": "flour", "aside": "strong white, or plain", "amount": "500 g" },
                      { "ingredient": "salt", "amount": "10 g" },
                      { "ingredient": "dry yeast", "amount": "7 g" }
                    ]
                  },
                  { "ingredient": "lukewarm water", "amount": "350 ml" }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Greasing the tin goes into nothing, so it is a preparation, and it sits with the step
that needs the tin rather than at the start. "Cover" is a condition, not an action, so
it is the aside of the rise. The water joins at kneading, not at mixing, because the
source adds it afterwards.

"Lukewarm" is part of the water's name, because it matters the moment the water goes
in. Which flour to buy matters only in the shop, so it is the flour's aside. The
dough is named in plain words; only a step's own ingredients take braces. The steps
read:

> 1 Mix `500 g flour`, `10 g salt` and `7 g dry yeast`
>
> 2 Pour in `350 ml lukewarm water` and knead for `10 min`
>
> 3 Cover and leave to rise for `1 h`
>
> 4 Grease loaf tin
>
> 5 Put the dough into the tin
>
> 6 Bake at `220 °C` for `40 min`

## Checks before you finish

- It is one JSON object, valid against `recipe.schema.json`, and nothing else.
- Every ingredient in the source is there, with the source's amount.
- Every entry without children is a real ingredient or a preparation, not an
  instruction.
- Every step has at least one ingredient flowing into it, directly or through earlier
  steps.
- No step merges nothing and changes nothing.
- Ingredients that go in together are next to each other.
- Read from the innermost steps outward, it sounds like the source.
- Every step has a sentence. It names every ingredient its step takes in braces,
  exactly once and exactly as written, names nothing else in braces, and holds no
  amount.
- Read in order, the sentences are the recipe as a cook would write it down.
- Every word a cook needs at the stove to take the right ingredient is in its name;
  an ingredient's aside holds only what matters before cooking.
