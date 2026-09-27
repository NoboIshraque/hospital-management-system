# Drawing the ER diagrams

A working guide for sketching the diagrams on paper and then building them in draw.io.
The model itself is in `er-design.md` — this file is only about how to *draw* it.

**Already done for you:** `docs/er-diagrams/uhid-er.drawio` is a six-page draw.io file with
every entity and all 62 relationship lines already placed. Open it at
[app.diagrams.net](https://app.diagrams.net) → *File → Open From → Device*. Its relationship
lines were generated from the Mermaid blocks in `er-design.md`, so the diagram and the document
cannot disagree with each other. Sketch first if that helps you think — then use the file as the
clean version rather than starting from an empty canvas.

---

## 1. First: which notation does your teacher want?

This matters more than anything else here, and it is worth one question in class before you
draw anything twice.

| | **Chen notation** | **Crow's foot** |
|---|---|---|
| Looks like | Rectangles, diamonds for relationships, ovals for attributes | Boxes listing columns, lines with fork/bar ends |
| Good for | The *conceptual* model — showing you understand entities vs relationships vs attributes | The *logical* model — showing the tables you actually built |
| At 39 entities | Unreadable. Attribute ovals alone would be ~200 shapes | Fine. This is what it is designed for |
| In draw.io | Shapes exist, but you place every oval by hand | Built in, and already generated for you |

**Do both, and say why.** That is not hedging — it is the standard sequence a DBMS course
teaches, and doing both is how you show you know the difference:

1. **One Chen diagram of the core 10 entities** (§5 below) — the conceptual model. Small enough
   to read, and it is where you demonstrate weak entities, associative entities and
   participation.
2. **Five crow's-foot diagrams of all 39** (`uhid-er.drawio`) — the logical model that maps
   1-to-1 onto `database/schema.sql`.

If the teacher only wants one, ask which. If they say "just the ER diagram", they almost always
mean Chen.

---

## 2. Three rules that stop a sketch turning into spaghetti

Learned the hard way by everyone who has drawn one of these.

1. **Draw every box before you draw any line.** Lines are what go wrong, and you cannot plan
   them until you can see where everything sits. Pencil, and leave a full box-width of space
   between boxes — the gaps are where lines live.
2. **Put each lookup table next to the one thing that points at it.** `bed_status` belongs
   beside `bed`, `ward_type` beside `ward`, `encounter_type` beside `encounter`. A lookup table
   drawn on the far side of the page drags a line across everything.
3. **Let the hub sit in the middle.** On the clinical page, `encounter` goes in the centre with
   its children fanning right and its parents entering from the left. Every line then runs
   left-to-right and none needs to double back.

A fourth, for the paper version: **write cardinality last**, after all the lines are drawn and
you can see which end is which. Adding the forks as you go is how you end up with a diagram
that says a patient has one encounter.

---

## 3. The page-by-page sketch plan

Each page is one landscape sheet. The columns below are how to divide the sheet — left column
is parents, right column is children, so every line runs one way.

### Page 1 — How it fits together (9 boxes, no columns)

The one-page story. Names only, no attributes. Draw this one first: it is the easiest and it
tells you whether you understand the shape of the system.

```
  column 1              column 2              column 3
  hospital       ───┐   patient        ───┐   access_log
  doctor         ───┤   appointment    ───┤   prescription
  doctor_posting ───┘   encounter      ───┘   admission
```

Lines: `hospital` and `doctor` → `doctor_posting` → `appointment`; `patient` → `appointment`;
`appointment` → `encounter`; `patient` → `encounter`; `encounter` → `prescription` and
→ `admission`; `patient` → `access_log`.

### Page 2 — Institutions (7 boxes)

```
  column 1         column 2      column 3
  division            │          department
  district         hospital      hospital_department
  hospital_tier       │          ward
```

`division` → `district` → `hospital`; `hospital_tier` → `hospital`; `hospital` →
`hospital_department`, `ward`; `department` → `hospital_department`.

### Page 3 — People & access (11 boxes)

```
  column 1           column 2        column 3          column 4
  role               user_account    doctor            hospital
  permission         patient         doctor_posting    department
  role_permission    patient_merge                     district
```

Note the three boxes in column 4 are only there as line targets — draw them small.
`role` + `permission` → `role_permission`; `role`, `hospital`, `patient`, `doctor` →
`user_account`; `doctor`, `hospital`, `department` → `doctor_posting`; `patient` →
`patient_merge`; `district` → `patient`.

### Page 4 — Clinical spine (16 boxes) — the important one

This is the page the examiner will look at longest. `encounter` in the centre.

```
  column 1          column 2           column 3              column 4
  patient           encounter_vitals   encounter_diagnosis   diagnosis
  encounter_type  → ENCOUNTER       →  prescription       →  prescription_item
  hospital          patient_allergy    lab_order             medicine
  doctor_posting                                             lab_result / lab_test
  allergen
```

Everything in column 1 points *into* `encounter`. Everything in columns 3–4 hangs *off* it.
Draw `encounter` as a slightly bigger box — it earns it.

### Page 5 — Scheduling & beds (14 boxes)

```
  column 1          column 2          column 3          column 4
  doctor            doctor_schedule   ward              hospital
  doctor_posting    doctor_leave      bed               ward_type
  patient           appointment       bed_occupancy     bed_status
  encounter         admission
```

The two worth getting right: `appointment` → `encounter` (one-to-one *optional* — null until
the patient turns up) and `admission` → `bed_occupancy` → `bed` (never `admission` → `bed`
directly, which is the whole point of that design).

### Page 6 — Referral, consent & audit (7 boxes)

```
  column 1     column 2          column 3
  patient      referral
  hospital     consent_grant
  encounter    access_log        user_account
```

`patient`, `hospital`, `encounter` all point into all three of the right-hand boxes, so this
page has the most lines per box. Space column 1 out generously.

---

## 4. Crow's foot cheat sheet

The symbol goes at the end of the line *nearest the thing it describes*.

| Symbol at that end | Reads as | Example in this model |
|---|---|---|
| `──╫` two bars | exactly one, mandatory | every `hospital` sits in exactly one `district` |
| `──○┤` circle + bar | zero or one, optional | an `encounter` has at most one `prescription` |
| `──○<` circle + fork | zero or many | a `patient` may have no `encounter` yet |
| `──┤<` bar + fork | one or many | a `ward` must have at least one `bed` |

The four that are easy to get backwards, so check these on your sketch:

- `ward ╫────┤< bed` — a bed is in exactly one ward; a ward has **one or more** beds. Not zero:
  a ward with no beds is not a ward.
- `prescription ╫────┤< prescription_item` — same shape, same reason. A prescription with no
  drug on it is not a prescription.
- `encounter ╫────○┤ prescription` — **optional.** Not every visit prescribes anything.
- `appointment ○┤────○┤ encounter` — optional on *both* ends. An appointment may never be
  attended, and an encounter may be a walk-in that was never booked.

---

## 5. If you need the Chen diagram

Use these **10 entities only**. Anything more and the attribute ovals swamp it.

`patient` · `hospital` · `doctor` · `department` · `encounter` · `diagnosis` · `medicine` ·
`appointment` · `ward` · `bed`

**Shapes:**

- **Rectangle** = entity. **Double rectangle** = weak entity — draw `bed` this way.
- **Diamond** = relationship. **Double diamond** = identifying relationship — the one between
  `ward` and `bed`.
- **Oval** = attribute, on a line to its entity. <u>Underline</u> the primary key. Dashed oval =
  derived attribute — use it for `age` on `patient`, which is the cheapest way to show you know
  what a derived attribute is.
- **Double oval** = multivalued. You have none left: resolving them all into tables is the
  point of §6.2 in `er-design.md`. Worth saying out loud — "there are no multivalued attributes
  because each one became a table, and here is the list".

**Attributes to actually draw** (three or four each, no more — say "full list in the data
dictionary"):

| Entity | Attributes on the diagram |
|---|---|
| `patient` | <u>patient_id</u>, uhid, name, dob, *age* (dashed) |
| `hospital` | <u>hospital_id</u>, name, tier |
| `doctor` | <u>doctor_id</u>, name, bmdc_reg |
| `encounter` | <u>encounter_id</u>, started_at, type |
| `bed` | <u>bed_no</u> (partial key — dashed underline), status |

**The three relationship diamonds worth drawing as diamonds with attributes on them**, because
they are what make the model more than boxes:

1. `doctor` —◇`posting`◇— `hospital`, with `fee` and `department` hanging off the diamond. An
   M:N relationship whose attributes belong to the relationship, not to either entity.
2. `patient` —◇`books`◇— `doctor`, with `slot_start` on the diamond → promoted to the
   `appointment` entity.
3. `patient` —◇`attends`◇— `hospital`, with the encounter's attributes on it → promoted to the
   `encounter` entity.

Draw 1 as a diamond, and draw 2 and 3 as **entities** with a note saying "promoted from a
relationship because it has attributes and children of its own". That contrast — one left as a
relationship, two promoted — is exactly the understanding being examined.

---

## 6. What is in the draw.io file

Six pages, tabs along the bottom. Colour carries meaning:

| Appearance | Means |
|---|---|
| Filled `--brand-soft` blue | A real entity, in `schema.sql` now |
| Filled `--surface-3` grey | A lookup / catalogue table — reference data |
| **Dashed border** | Phase 2 (`er-design.md` §7) — designed, not in `schema.sql` yet |
| `PK` / `FK` / `U` after a column | primary key / foreign key / unique |
| `copy`, `denorm`, `derived` | The three deliberate redundancies. Be ready to defend each |

Only key and identifying columns are shown. That is on purpose: a diagram with every column is
a data dictionary badly formatted, and the data dictionary is a separate document.

**Editing it:** drag a box and its lines follow. To add a column, click the box, then
*Edit → Add Row* (or copy an existing row and retype it). To change a line's cardinality, click
it and edit *Line start* / *Line end* in the right-hand Style panel — the values are named
`ERmandOne`, `ERzeroToMany`, `ERoneToMany`, `ERzeroToOne`.

**Exporting for the report:** *File → Export as → PDF*, with **Crop** ticked and *Selection
Only* unticked. PDF, not PNG — a PNG of a diagram this size is unreadable when printed, and the
text in a PDF stays sharp at any zoom.

**Colours are hard-coded hexes in that file,** which is the one place outside `favicon.svg` and
the `theme-color` meta tag where that is allowed — a `.drawio` file cannot read CSS custom
properties. They are `--brand` `#0E6E8C`, `--brand-soft` `#DDEDF3`, `--surface-3` `#E7EDF0`,
`--ink` `#0E1B22`, `--ink-2` `#47606D`. If the brand colour ever changes, this file changes by
hand too.

---

## 7. Before you hand it in

- Every line has a symbol at **both** ends. A line with a fork at one end and nothing at the
  other is the most common mark lost on an ER diagram.
- No line crosses another where a box could have been moved instead.
- The weak entities are visibly weak — `bed`, `prescription_item`, `encounter_vitals`,
  `encounter_diagnosis` (`er-design.md` §6.1).
- Every box on the diagram exists in `database/schema.sql` with the same name, or is marked
  phase 2. A diagram that disagrees with the schema is worse than no diagram.
- The three redundancies are labelled: `encounter.consultation_fee`, `appointment.doctor_id`,
  `bed.status`. Labelling them reads as judgement; leaving them unlabelled reads as an error.
