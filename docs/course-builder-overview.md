# Course builder — overview

The course builder helps post-16 teachers and curriculum leads plan a study
programme against the Pearson **Options Guide — Programme Builder**. It answers
three questions the guide itself answers, but faster and for a whole programme at
once:

- What can I still teach from first teach 2027?
- What is funded, and when does reform land?
- If something is going, what do I move to?

It sits alongside the table builder in the same app but shares no data with it —
separate database tables, separate routes, separate types.

---

## Who it is for

| Person | What they do |
| --- | --- |
| Curriculum lead / Curriculum Development Manager | Builds a programme, checks it against the guide, shares or publishes it |
| Teacher or head of department | Uses a published builder from a link or an embed to assemble their own programme |
| Colleague with a share | Views or co-edits a builder inside the app |

Accounts are limited to Pearson email domains (`@pearson.com`,
`@pearsoncanada.com`, `@pearsoned.com`). Anyone can use a **published** builder
without an account.

---

## The four screens

| Route | Screen | Who can reach it |
| --- | --- | --- |
| `/course` | Hub — create a builder, open a saved one, see builders shared with you | Signed in |
| `/course/guide` | The Options Guide on its own, for looking up a single qualification | Signed in |
| `/course/:id` | Workspace — browse the guide on the left, build the programme on the right | Owner, or a colleague the builder is shared with |
| `/cb/:slug` | The published builder — a working tool for anyone with the link, and what an embed renders | Public |

Builders also appear on the main dashboard under **Course builders**, with the
same card actions as the hub. Links shared before the public page became a
working builder used `/cp/<slug>`; those redirect to `/cb/<slug>` rather than
breaking.

---

## What the dataset holds

Everything the course builder shows comes from one generated module,
`src/data/optionsGuide.ts` — 287 qualifications across 17 subject areas, with the
guide's own wording for transition guidance and the qualifications it suggests
considering.

| Dimension | Breakdown |
| --- | --- |
| Subjects (17) | Art and Design, Business, Construction, Digital, Education and Early Years, Engineering, Esports, Health and Social Care, Land-based, Media, Music, Performing Arts, Protective Services, Science, Sport, Transport and Logistics, Travel and Tourism |
| Types | BTEC 243, T Level 16, A Level 12, NVQ 10, V Level 3, Foundation Certificate 2, Occupational Certificate 1 |
| Status for 2027 | Available 250, being withdrawn 27, new 10 |
| Funding for 2027 | Funded 254, not funded 27, to be confirmed 6 |
| Reform first-teach year | 2027 (18), 2028 (115), 2029 (47), 2030 (60), none given (47) |
| Levels | Level 2 and Level 3 |

Each entry carries its qualification number (QN), guided learning hours (GLH),
whether it is a full programme or part of one, the learner profile, and the
guide's transition route.

---

## What the builder works out for you

Add qualifications and the **What to check** panel rewrites itself. Each note is
one of three tones — sound (`ok`), worth a look (`watch`), or a real problem
(`risk`):

- **Not funded for your first teach year** — risk, with the guide's transition
  route for each affected qualification.
- **Being withdrawn** — risk; the qualification cannot be started that year.
- **Funding still to be confirmed** — watch; a new qualification the guide has
  not confirmed funding for yet.
- **When the first reform lands** — risk if it lands on or before your first
  teach year, watch otherwise, with the arithmetic spelled out: a two-year
  programme starting in 2027 finishes in 2029.
- **Programme shape** — one full programme with choices alongside it reads as
  sound; more than one full programme is flagged, because a learner would
  normally take one. If nothing in the plan is a full programme, the total GLH is
  compared against the real range that full programmes occupy at that level in
  the guide, rather than an invented target.
- **Spans more than one subject** — watch, in case the mix was not deliberate.
- **Choices no longer in the guide** — watch, when a saved plan references a
  qualification a newer edition has dropped.

Qualifications with no published GLH are counted separately, so a total never
quietly under-reports.

Alongside the checks, **The guide suggests considering** collects the routes the
guide lists against the at-risk choices in that plan, each with a *Find in guide*
button.

---

## Sharing, publishing and measuring

| Action | What it does |
| --- | --- |
| **Share** | Adds a named Pearson colleague as *can view* or *can edit*. Private — no link is created. |
| **Publish** | Makes `/cb/<slug>` work for anyone. Unpublishing takes it down again. |
| **Embed** | Copies an `<iframe>` snippet pointing at the published builder. |
| **Analytics** | Page views, unique visits and the top interactions on a published builder, over 7, 30 or 90 days. |
| **History** | Who created, published, unpublished or duplicated the builder, and when. |
| **Transfer** | Moves ownership to another Pearson account, optionally keeping the old owner as an editor. |
| **Duplicate** | Copies the builder to your own account, always as a draft. |
| **Download** | Excel workbook: a *Programme* sheet (one row per qualification, with your notes) and an *Advice* sheet (the summary, every check, and the suggested routes). Visitors on a published builder can also print or save as PDF. |

A published builder is a **tool, not a snapshot**. A visitor gets the full guide,
builds their own programme, and downloads their own file. Nothing they do is
written to the database — their selection lives in their own browser's local
storage, so two people on the same link never see each other's work and the
owner's builder can never be altered from the public page.

Two options control how that page opens:

- **Start visitors off with the programme below** — the builder opens holding
  your selection instead of empty. Off by default, so publishing hands people a
  tool rather than someone else's half-made decision.
- **Keep visitors to this subject and level** — holds the browse list to your
  scope. Enforced in the browser component itself, not just hidden from the
  filter bar, so no route through the UI can widen it.

Your planning notes stay off shared views unless you tick **Show my notes**. They
appear on the read-only view a *can view* colleague sees; the published builder
always starts a visitor with their own blank notes.

---

## How it is built

| Concern | Where |
| --- | --- |
| The dataset | `src/data/optionsGuide.ts` (generated) |
| Plan shape, filtering, the checks, export rows | `src/lib/courseBuilder.ts` |
| Publish / duplicate / history helpers | `src/lib/coursePlanActions.ts` |
| Excel export | `src/lib/coursePlanDownload.ts` |
| Screens | `src/pages/CourseBuilderPage.tsx`, `CourseGuidePage.tsx`, `CoursePlanPage.tsx`, `PublicCourseBuilderPage.tsx` |
| Components | `src/components/course/` |
| Schema | `supabase/migration-v11.sql` (table), `-v12.sql` (publishing and sharing), `-v13.sql` (analytics, history, ownership transfer) |

Storage is deliberately small: a builder is a row in `course_plans` with its
chosen qualifications, notes and options held in a `config` JSON column.
`course_plan_shares` holds named colleagues; `course_plan_audit_log` holds the
history. Row-level security decides every read — a draft is visible only to its
owner and the colleagues it is shared with, and the public policy exposes
published rows only. Saved plans store the qualification number alongside the id,
so a plan survives a future re-numbering of the guide.

The workspace autosaves about a second after you stop typing, and a save can
never land on a different builder than the one it was typed into. Publishing is
written straight through instead, so the link it hands out works immediately.

### Moving to a new edition of the guide

The course builder reads nothing but the generated module, so a new edition is
one step:

```bash
pip install pdfplumber
python3 scripts/extract-options-guide.py <options-guide.pdf>
```

Re-run the extraction rather than editing rows by hand.

---

## Worth knowing

- Status, funding and reform years are the guide's position for **first teach
  2027**. The footer on every published builder says to confirm with a Curriculum
  Development Manager before committing to a programme.
- A visitor's work depends on their browser's local storage. In a private window,
  or with site data blocked, the builder still works — it just will not remember
  anything.
- Deleting a builder is immediate and final: shared colleagues lose access, and
  any link or embed stops working. The confirmation names who is affected.
