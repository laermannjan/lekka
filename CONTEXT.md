# Lekka

FOSS, self-hosted recipe manager. One instance is shared by a household; recipes, ingredients, and cook history are common but attributed to whoever acted.

## Language

**Ingredient**:
A reusable, named food item, canonical across every recipe that uses it. Identified along two independent axes: **specificity** (how precisely it's named) and **classification** (what it's like, for filtering/matching).
_Avoid_: Item, food

**Base term**:
The broad canonical name shared by related Ingredients (e.g. "milk" for both dairy milk and almond milk). Free text, autocompleted against existing terms to encourage reuse rather than duplication.

**Descriptor**:
A free-text qualifier narrowing an Ingredient's Base term to the desired specificity (e.g. "almond", "unsweetened", "whole"). Loose and display-oriented; never used for matching or filtering.

**Tag**:
A classification label drawn from a curated, growable vocabulary, describing what an Ingredient is or is related to (e.g. `nut-derived`, `dairy-alternative`, `vegan`, `creamy`). An Ingredient can hold any number of Tags — Tags are not a tree, so an Ingredient isn't confined to one branch (almond milk is `nut-derived` and `dairy-alternative`, never `dairy`). Tags drive filtering. Household-extensible: a household can add its own Tags as needs arise (each self-hosted instance is one household, so there's no cross-household drift to reconcile); creating one autocompletes against the existing vocabulary to nudge reuse over near-duplicates (`nut-free` vs. `no-nuts`). Seeded broadly at first run — allergens and diet-types, but also sensory properties (texture, flavor, acidity) that no v1 feature matches on yet; that matching is the deferred concept-aware substitution engine's job, this just lays the data groundwork.
_Avoid_: Category, class (both imply a single-parent hierarchy, which Tags deliberately aren't)

**Tag Group**:
A small, fixed classification of what kind of thing a Tag describes — allergen, diet, or sensory. Not itself household-extensible, unlike Tag. Exists purely so a Tag picker can filter to what's relevant: Diners' avoid-Tag picker defaults to allergen/diet Tags, keeping sensory ones (`creamy`, `acidic`) out of the way without hiding them from ingredient authoring.

**Recipe**:
A named dish: a shared pool of Steps plus one or more Compositions (a default line and any named Variants) that each select, order, and optionally override those Steps. Evolves over time via Version — one shared timeline covering the pool and every Composition together.

**Step**:
One instruction, optionally carrying a Duration and referencing zero or more Ingredient Usages. Belongs to a Recipe's shared Step pool — the same Step stays literally shared across every Composition that references it unmodified, so editing it once updates every Composition that hasn't overridden it.

**Composition**:
One named or default line through a Recipe: an ordered list of Step references. Each reference either points at a pool Step unmodified, or carries a Composition-local full override of that Step's content (instruction, Duration, and Usages together — Step is the only override unit, there's no independent Usage-level override). No line is structurally privileged — the default Composition and every Variant are peers over the same pool. Removing a Step from one Composition's list only affects that Composition; the Step stays in the pool as long as another Composition still references it.

**Ingredient Usage**:
The line linking an Ingredient to a Step within a specific Recipe — where Quantity, Prep Attributes, Alternatives, and a free-text Note live. The same Ingredient looks different on every Usage line without becoming a different Ingredient.
_Avoid_: Recipe ingredient, ingredient line (fine informally; "Usage" is canonical)

**Prep Attribute**:
A preparation state (chilled, room-temperature, diced) that applies to an Ingredient only in the context of one Usage — never a property of the Ingredient itself.

**Alternative**:
An acceptable substitute for an Ingredient Usage, declared explicitly by the recipe author on that specific Usage line. Not a global fact about two Ingredients — butter may accept margarine in one recipe and not another, depending on the role texture or flavor plays there. The same idea as Variant, at the smallest possible scope: unnamed, inline, one Usage — where Variant is named and can span many Steps.
_Avoid_: Substitute (reserved for the deferred, quality-attribute-matching recommendation engine — a distinct, much heavier concept than Alternative)

**Duration**:
A Step's time cost: `{kind: active | wait | cook | estimate, min, max?, unit}`. One Step carries at most one Duration; a step with two time phases is split into two Steps.

**Scaling Formula**:
An optional, author-written override on an Ingredient Usage's Quantity or a Step's Duration, replacing the default strict-linear response to a serving-count change (e.g. salt scaling slower than the rest, or rise time lengthening as starter quantity shrinks). No formula present means linear scaling for a Quantity, constant (unaffected by servings) for a Duration. Authored through a small, growable set of guided sentence templates, never a free-form expression language — an author is never asked to write raw syntax. The v1 catalog:
- **Rate vs. servings** (Quantity or Duration) — "should increase slower/exactly/faster than servings, at N% rate."
- **Vs. another Usage** (Duration) — "should increase/decrease by N units per unit short of/over `<another Usage>`'s usual quantity."
- **Fixed, doesn't scale** (Quantity or Duration) — stays constant regardless of servings; a distinct template, not a 0%-rate edge case of the first.

Whole-unit rounding (you can't cook 3.33 eggs) is a property of the Quantity's Unit, not a Scaling Formula template — it applies even under default linear scaling.

**Version**:
A point in a Recipe's edit history — one shared timeline covering the Step pool and every Composition together, not a per-Variant history. Reverting restores the whole Recipe, pool and all Compositions, to that point.

**Variant**:
A named Composition other than the default one (e.g. "Chilli sin carne" alongside the default "Chilli con carne" line). Created by seeding a new Composition from an existing one's current list of Step references — that seed is recorded only as informational lineage ("derived from"), not an ongoing structural link. No merge or cherry-pick operation exists between Compositions; a Step edited in the shared pool already reaches every Composition that hasn't overridden it, which is what a merge would otherwise be for.
_Avoid_: Fork, branch (both imply the graph/merge machinery this deliberately doesn't have)

**Cook**:
One occasion of making a Recipe — records the date, the Version and Composition used, the acting Profile, the Diners present, an outcome, and a summary. Distinct from an edit: logging what happened during a Cook never silently changes the Recipe.

**Cook Log Annotation**:
A note pinned to a specific Step or Ingredient Usage within a Cook, capturing what happened at that point rather than free text dumped at the end.

**Profile**:
A lightweight named identity for one household member, used to attribute Cooks and edits and to carry a standing dietary preference (a persistent set of avoid-Tags). Reached via a plain picker — no password, no roles, no per-user data separation. Instance-level access control (should the instance itself require a login) is a deployment concern, outside this domain.
_Avoid_: User, account (both imply auth/access concerns a Profile doesn't carry)

**Diners**:
The set of Profiles currently selected as present/eating, driving the dietary Tag filter across the app. Distinct from the acting Profile (the one, singular identity attribution credits) — Diners defaults to just the acting Profile but is freely adjustable, and persists across sessions until changed. An Ingredient Usage carrying a Tag any selected Diner avoids is flagged, not hidden; if that Usage has an Alternative clearing the flag, it's surfaced as a suggested swap.
_Avoid_: Who's eating (fine in conversation, not canonical)
