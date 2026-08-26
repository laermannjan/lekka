# Turning a recipe into a card

Instructions for converting an ordinary recipe - prose, a photo of a page, a
website - into a `.lekka` card. The format is in `FORMAT.md`.

## Procedure

1. **List every ingredient as a use.** Each mention in the text is one line,
   even when the same ingredient appears several times. 300 g flour in the
   preferment and 60 g in the dough are two lines.
2. **Group by where things merge.** Ingredients that go into one bowl together
   must end up adjacent, because the card draws them as one block. This decides
   the order, not the order in the original text.
3. **Pull out anything that does not flow.** Tins, tools, preheating: these
   become `*` preparation lines. Test for every line: does this go into the pot?
   If not, it is preparation.
4. **Turn each sentence into one verb** plus parameters. Whatever is left over
   goes into the bracket or is dropped.
5. **Nest.** Write the last step first at the outermost level, its inputs
   indented under it, and so on down to the ingredients.
6. **Check the side strands.** A preferment, a soaker, a roux is its own block
   of lines that merges into the main strand later. In the file it is a step
   indented under the step it merges into.
7. **Read it back as a sequence.** If the steps, read innermost first, sound
   like a recipe, the card is right.

## Naming ingredients

Two parts, and the split matters because the shopping list groups by name:

- **name** - what you would read out in a shop. A noun, no attributes:
  `Wasser`, `Magerquark`, `Körner`, `Haferflocken`.
- **bracket** - state, choice, alternative: `lauwarm`, `oder Naturjoghurt`,
  `z. B. Sonnenblumen`, `grob`, `frisch`.

Rule of thumb: whatever you would not read out in a shop goes in the bracket.

## Amounts

- Write the amount as the source gives it: `300 g`, `2 TL`, `1 Würfel`.
- A source that gives a range keeps it: `Wasser: 40-60 g`. Ranges scale.
- Words are allowed where there is no number: `Salz: Prise`,
  `Pfeffer: nach Geschmack`. They do not scale.
- No amount at all is fine: `Haferflocken (grob)`.
- Do not invent precision the source does not have.

## Phrasing steps

- **Infinitive, lower case, verb first.** No article, no subject:
  `vermengen`, `in Form geben`, `backen`.
- **Parameters straight after the verb**, temperature before time:
  `backen 200 °C Heißluft 60 min`.
- **One step, one verb.** Two verbs mean two steps, unless they are inseparable
  on the same object: `einfetten, ausstreuen`.
- **Three to five words**, not counting numbers. Longer belongs in the bracket.

Reuse verbs so that cards sound alike: `vermengen · verkneten · falten ·
reifen lassen · gehen lassen · formen · in Form geben · einschneiden · backen ·
stürzen · auskühlen`.

## What goes in the bracket of a step

What you must know but do not do:

- conditions: `ohne Vorheizen, unterste Schiene`
- the target state: `bis sich das Volumen verdoppelt`
- an intervention during a long step: `nach 10 min längs einschneiden`

Ordinary punctuation inside it, never `·` or `|`.

## Worked example

Source:

> Mehl, Salz und Trockenhefe mischen. Lauwarmes Wasser zugeben und 10 Minuten
> kneten. Zugedeckt 1 Stunde gehen lassen. Eine Kastenform einfetten, den Teig
> einfüllen und bei 220 °C 40 Minuten backen.

Card:

```
# Kastenbrot (1 Laib)
* Kastenform einfetten

- backen 220 °C 40 min
  - in Form geben
    - gehen lassen 1 h (zugedeckt)
      - kneten 10 min
        - mischen
          - Mehl: 500 g
          - Salz: 10 g
          - Trockenhefe: 7 g
        - Wasser (lauwarm): 350 ml
```

Note what happened: greasing the tin does not flow anywhere, so it became a
preparation line. "Zugedeckt" is a condition, not an action, so it went into the
bracket. The water joins at `kneten`, not at `mischen`, because the text says it
is added afterwards - and that is exactly what the card will show.

## Checks before you finish

- Every line without children is a real ingredient, not an instruction.
- Every step has at least one input.
- No step merges nothing and changes nothing.
- Ingredients that belong together are adjacent.
- Read innermost to outermost: does it sound like the original recipe?
