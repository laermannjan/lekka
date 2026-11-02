# Writing a lekka recipe

How to turn any recipe - a web page, a photo of a book, a PDF, a few lines of text, an
idea - into a lekka recipe. Written for whoever does it, a person or a model. The
result is one JSON object, valid against `recipe.schema.json`.

## What a lekka recipe is

A recipe is a flow: ingredients go into a step, its result goes into the next step,
and the last step finishes the dish. lekka draws that flow as a table, rows for the
ingredients and columns for time, and also reads it out as a list of steps. Both come
from the same structure, so the structure has to be right.

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

Any entry can have an `aside`: what you must know but do not do. Which flour, how
warm the water, how long until it is done.

## How to get there

1. **List every ingredient as a use.** Each mention in the source is one ingredient,
   even when the same thing appears several times.
2. **Find where things meet.** Ingredients that go into one bowl together are children
   of the same step, next to each other. This decides the order, not the order of the
   source.
3. **Pull out what does not flow.** Tins, tools, preheating: these are preparations.
   Test every candidate: does it go into the food? If not, it is a preparation.
4. **Make each instruction one step with one verb.** What is left of the sentence
   goes into the step's parameters or its aside, or is dropped.
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
  step (`slash lengthwise after 10 min`).

## Ingredients

- **The name** is what you would ask for in a shop: a noun, no attributes. `flour`,
  `quark`, `seeds`, `oats`.
- **The aside** holds state, choice and alternative: `lukewarm`, `or plain yogurt`,
  `e.g. sunflower`, `coarse`, `fresh`. Whatever you would not say in the shop.
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
    "children": [
      {
        "step": "put in tin",
        "children": [
          { "preparation": "grease loaf tin" },
          {
            "step": "rise 1 h",
            "aside": "covered",
            "children": [
              {
                "step": "knead 10 min",
                "children": [
                  {
                    "step": "mix",
                    "children": [
                      { "ingredient": "flour", "amount": "500 g" },
                      { "ingredient": "salt", "amount": "10 g" },
                      { "ingredient": "dry yeast", "amount": "7 g" }
                    ]
                  },
                  { "ingredient": "water", "aside": "lukewarm", "amount": "350 ml" }
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
