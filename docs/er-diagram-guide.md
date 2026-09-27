# Drawing the ER diagrams

A working guide for sketching the diagrams on paper and then building them in draw.io.
The model itself is in `er-design.md` — this file is only about how to *draw* it.

**Already done for you — two files, both six pages.** Open either at
[app.diagrams.net](https://app.diagrams.net) → *File → Open From → Device*.

| File | Notation | What it is |
|---|---|---|
| `docs/er-diagrams/uhid-er-chen.drawio` | **Chen** | The **conceptual** model. Entities, relationship diamonds, attribute ovals, weak entities, participation. This is the one a DBMS course means by "the ER diagram" |
| `docs/er-diagrams/uhid-er.drawio` | Crow's foot | The **logical** model. All 39 tables with their key columns, mapping 1-to-1 onto `database/schema.sql` |

The crow's-foot file's relationship lines were generated from the Mermaid blocks in
`er-design.md`, so it and the document cannot disagree. Sketch first if that helps you think —
then use the files as the clean version rather than starting from an empty canvas.

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

**You have both, which is the standard sequence a DBMS course teaches** — conceptual model
first, then map it to tables. Lead with the Chen pages; keep the crow's-foot pages as the
"and here is what it became" half. If the teacher wants only one, it is the Chen one.

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

## 5. The Chen diagrams

`docs/er-diagrams/uhid-er-chen.drawio` — six pages, 33 entity boxes, 28 relationship diamonds,
109 attribute ovals, 59 cardinality lines. No two shapes overlap.

| Page | Shows | Why it earns a page |
|---|---|---|
| 1 · Core | patient, hospital, doctor, department, encounter | The heart. `posting` is drawn as a **diamond with attributes** — a relationship that carries `fee` is exactly what it is conceptually |
| 2 · Clinical | encounter, diagnosis, medicine, allergen, lab_test, vitals | Five diamonds, all carrying attributes. `vitals` is a weak entity |
| 3 · Appointments & beds | patient, doctor, appointment, encounter, hospital, ward, bed | Where the **weak entity** lives: `bed`, double rectangle, double diamond, partial key |
| 4 · Access | patient, doctor, hospital, user_account, role, permission | The two 1:1 lines are the "at most one account per person" decision |
| 5 · Consent, audit & referral | patient, hospital, user_account, encounter | `refers` is **recursive** — two lines to `hospital`, labelled *from* and *to*. `reads` is **ternary** |
| 6 · Availability | doctor, schedule, leave, appointment | The page that shows there is **no slot entity**. Two more weak entities |

### The notation used in the file

| Shape | Means |
|---|---|
| Rectangle | Entity |
| **Double** rectangle | Weak entity — `bed`, `vitals`, `schedule`, `leave` |
| Diamond | Relationship |
| **Double** diamond | Identifying relationship — `ward`–`bed`, `encounter`–`vitals` |
| Ellipse, <u>underlined</u> | Key attribute. `(partial)` marks a weak entity's discriminator |
| **Dashed** ellipse | Derived attribute — `patient.age`, `bed.status` |
| Single line | Partial participation — optional |
| **Double** line | Total participation — mandatory |
| `1` / `N` / `M` on a line | Cardinality |

If a double line renders as a single line in your draw.io version, select it and set *Style →
Line → Link*. It is drawn with `shape=link`, which is draw.io's two-parallel-lines edge.

### The answer that gets the marks: how a diamond becomes a table

This is what an examiner is actually testing, and it is one rule:

> **A 1:N relationship becomes a foreign key. An M:N relationship, or any relationship with its
> own attributes, becomes a table.**

Work it through out loud with these, which is every diamond in the file:

| Diamond | Kind | Maps to |
|---|---|---|
| `has` (patient–encounter) | 1:N | a foreign key `encounter.patient_id`. **No table.** |
| `at`, `attended by`, `contains`, `employs`, `has role`, `booked for` | 1:N | foreign keys. No tables |
| `signs in as` | 1:1 | a foreign key with a `UNIQUE` on it |
| `posting` | M:N:1 with `fee` | the `doctor_posting` table |
| `offers` | M:N | the `hospital_department` table |
| `allergic to` | M:N with `severity` | `patient_allergy` |
| `diagnosed as` | M:N with `is_primary` | `encounter_diagnosis` |
| `prescribes` | M:N with dose, frequency, duration | `prescription` + `prescription_item` |
| `orders` | M:N with status, value | `lab_order` + `lab_result` |
| `occupies` | M:N with from_at, to_at | `admission` + `bed_occupancy` |
| `grants` | M:N | `role_permission` |
| `consents` | M:N with scope, expiry | `consent_grant` |
| `reads` | ternary with basis, timestamp | `access_log` |
| `refers` | recursive, with urgency, status | `referral` |
| `works`, `away` | 1:N to weak entities | `doctor_schedule`, `doctor_leave` |
| `records` | identifying, 1:N | `encounter_vitals`, keyed on its parent |

**Say the count:** 28 diamonds, of which 16 become tables and 12 become nothing but a foreign
key. That sentence demonstrates the mapping rule better than any diagram does.

### Sketching a Chen page on paper

Different order from crow's foot, because the ovals are what run out of space:

1. **Entity rectangles first**, spread wide — wider than feels necessary. Each one needs room
   for three or four ovals around it.
2. **Diamonds in the gaps between them**, then the lines, then `1` / `N` / `M` on each line.
3. **Ovals last.** Hang them on the *outside* edge of each entity, pointing away from the middle
   of the page, so they never sit between two entities that need a line.
4. Double the lines that are total participation, and double the borders of `bed`, `vitals`,
   `schedule` and `leave`.

If you run out of room for ovals, that is the diagram telling you to drop attributes, not to
shrink the boxes. Three or four per entity, and say "the full column list is in the data
dictionary".

### What is deliberately not on the Chen pages

- **The lookup tables** — `division`, `district`, `hospital_tier`, `encounter_type`, `ward_type`,
  `bed_status`. At the conceptual level these are **attributes**, which is why `tier`,
  `district` and `type` appear as ovals. They only become tables in the logical model. This is
  a point in your favour, not an omission — have the sentence ready.
- **`patient_merge`** — phase 2, and a second recursive relationship on one diagram is noise
  when `refers` already demonstrates recursion. It is in the crow's-foot file.

---

## 6. What is in the crow's-foot file

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
