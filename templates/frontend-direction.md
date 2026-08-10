# Visual direction

Appended to the builder brief only when this repository renders a user interface.

The `quality:impeccable` gate can tell you a choice is *wrong* — AI beige, an italic serif
nobody chose, a clipped label. No gate can tell you a choice is *distinctive*, because
nobody can write a deterministic rule for that. This section is the half of DoD line 5 a
detector cannot reach.

Adapted from Anthropic's `frontend-design` skill. Its principles are here; its
brainstorm-explore-critique **workflow deliberately is not** — this loop already owns the
process, and a second one in the same prompt produces a builder that redesigns instead of
shipping while the ratchet charges it for every test written along the way.

## Make choices, not defaults

Right now AI-generated design clusters hard around three looks:

1. warm cream background near `#F4F1EA`, high-contrast serif display, terracotta accent
2. near-black background, one bright acid-green or vermilion accent
3. broadsheet layout, hairline rules, zero border-radius, dense columns

Each is legitimate for *some* brief. All three are defaults rather than decisions, and they
show up regardless of subject. **Where the PRD or the design docs pin a direction, follow it
exactly — the spec's own words always win, including when it asks for one of these.** Where
an axis is left free, do not spend that freedom on a default.

## Ground it in the subject

Distinctive choices come from the subject's own world — its materials, artifacts and
vocabulary. If the PRD does not pin down the audience and the page's single job, take them
from the design docs rather than inventing a mood. Build with the real content.

## Where the personality lives

- **Type carries it.** Pair display and body faces deliberately, with an intentional scale,
  weights and spacing. Type is not a neutral delivery vehicle for the words.
- **The hero is a thesis.** Open with the most characteristic thing in the subject's world.
  A big number with a small label, three supporting stats and a gradient accent is the
  template answer; use it only if it is genuinely the best one.
- **Structure encodes meaning.** Numbering, eyebrows, dividers and labels should be true
  about the content, not decorative. `01 / 02 / 03` is right only when the content really is
  a sequence.
- **Motion is deliberate.** One orchestrated moment lands harder than scattered effects, and
  scattered effects are themselves a tell that a machine made this.
- **Match complexity to the vision.** Maximalist directions need elaborate execution;
  minimal ones need precision in spacing and detail. Elegance is executing the chosen
  vision well.

## Spend boldness in one place

Let one signature element be the memorable thing and keep everything around it quiet. Cut
decoration that does not serve the brief. Chanel's rule applies: before leaving the house,
look in the mirror and remove one accessory.

Taking no risk is also a risk. Take one you can justify in a sentence.

## Copy is design material

Words exist to make the interface easier to use, not to decorate it.

- Name things by what people control, never by how the system is built. A person manages
  notifications, not webhook config.
- Active voice, and the same name through the whole flow: a button that says **Publish**
  produces a toast that says **Published**, never *Submit* → *Success*.
- Errors say what went wrong and how to fix it. They do not apologise and they are never
  vague. An empty state is an invitation to act.
- Sentence case, plain verbs, no filler. Each element does exactly one job.

## The quality floor is not optional

Responsive to mobile, visible keyboard focus, reduced motion respected. This is not
decoration you can trade away for the signature element — and the accessibility assertions
in the Playwright specs enter the ratchet, so a page that has ever been clean may never
quietly stop being clean.
