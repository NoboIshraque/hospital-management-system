#!/usr/bin/env python3
"""Captions and annotations for the 2-minute demo video (the Clipchamp export, 1:45.87).

The export has no sound, so this track has to explain the video on its own. It writes:

  captions.ass   burned into the video by build-captioned.sh: the caption band under the
                 picture (part, decision, what is happening), and the call-outs drawn on it
  captions.srt   the same captions as plain subtitles, for a player or PowerPoint

Layout of the finished 1920 x 1080 frame:
  - the screen recording scaled to 85 % (1632 x 918), centred at the top
  - a 162 px caption band under it: the part on the left, the caption on the right
  - a progress bar along the top edge of the band (drawn by ffmpeg, not here)
  - call-outs (amber outline + amber label) drawn over the recording, at the place on
    screen they refer to. Every rectangle below is in the ORIGINAL video's pixels
    (1920 x 1080), measured from frames of the export; vx()/vy() move it into the frame.

Times are seconds in the export. Scene cuts were found with ffmpeg's scene detection;
the moment each on-screen event appears (a toast, a refusal, a red badge) was measured
by sampling the pixels where it appears every 0.25 s.

Run:  python3 make-captions.py <output folder> [fonts folder, default <output>/fonts]
"""
import sys, pathlib
from PIL import ImageFont   # only to measure label text, so each label gets one tidy box

SCALE, OFF_X, OFF_Y = 0.85, 144, 0      # where the recording sits in the frame
BAND_Y = 918                            # top of the caption band

# Colours in ASS order (&HAABBGGRR). Same palette as the app: rail #0C2B3A, brand #0E6E8C;
# amber #F5B83D is the call-out colour (it reads on the light pages and the dark consoles).
WHITE = "&H00FFFFFF"
RAIL = "&H003A2B0C"
INK = "&H00221B0E"
AMBER = "&H003DB8F5"
SOFT = "&H00CEC2A9"        # --rail-ink #A9C2CE

def vx(x): return round(OFF_X + SCALE * x)
def vy(y): return round(OFF_Y + SCALE * y)

def ts(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def srt_ts(t):
    ms = round(t * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"

# ---------------------------------------------------------------- the parts
# (start, end, number shown, name, the design decision it demonstrates)
PARTS = [
    (0.00,   4.67,  None, "Introduction",        "UHID · DBMS course project"),
    (4.67,  19.97,  1,    "Registration",        "Decision 1 · one UHID per person"),
    (19.97, 27.07,  2,    "Booking",             "Decisions 3 and 4 · computed slots"),
    (27.07, 31.40,  3,    "Race test",           "Decision 4 · transactional booking"),
    (31.40, 44.87,  4,    "Wards and beds",      "Decision 7 · bed state by trigger"),
    (44.87, 50.20,  5,    "The national record", "Decisions 2 and 6 · consent, referral"),
    (50.20, 70.27,  6,    "Recording a visit",   "Decision 5 · the encounter hub"),
    (70.27, 79.20,  7,    "Break-glass",         "Decision 2 · access is granted"),
    (79.20, 84.43,  8,    "Lab result",          "A trigger decides abnormal"),
    (84.43, 92.43,  9,    "Merging a duplicate", "Decision 1 · the safety net"),
    (92.43, 101.23, 10,   "The database itself", "No web page involved"),
    (101.23, 105.87, None, "Summary",            "The database enforces the rules"),
]

# ---------------------------------------------------------------- the captions
# (start, end, text). At most two lines; kept near 15–20 characters a second.
CAPTIONS = [
    (0.25,  4.60, "One patient, one health ID (UHID), one record shared by every hospital in the country."),
    (4.80,  7.90, "A receptionist registers a patient. Typing a name and birth date starts a live duplicate check."),
    (8.00, 11.20, "The database already holds two records like this one, so no second UHID is issued."),
    (11.30, 17.20, "A genuinely new patient is entered instead, with a national ID number."),
    (17.30, 19.95, "UHID issued. Its serial comes from a locked counter, so no two can be the same."),
    (20.00, 23.40, "Free appointment slots are computed: weekly schedule − leave − existing bookings."),
    (23.45, 27.05, "Booking runs inside a locked transaction, so one slot can only ever be taken once."),
    (27.10, 31.35, "Proof: two receptionists book the same slot at the same instant. Exactly one wins, 5 rounds out of 5."),
    (31.45, 37.40, "The receptionist admits Abdul Karim Mia to bed GM-04 in the male general ward."),
    (37.45, 40.90, "GM-04 turns red because a database trigger changed the bed's status, not the web page."),
    (40.95, 44.85, "A transfer to a bed in the female ward is refused by the database, and nothing moves."),
    (44.90, 50.15, "A doctor opens Rahim's full history. A referral from another hospital gave this doctor consent, and the read is logged first."),
    (50.25, 55.55, "The doctor records a visit: chief complaint, then a diagnosis coded from the ICD-10 catalogue."),
    (55.60, 61.45, "Two medicines are prescribed. Amoxicillin is a penicillin, and this patient is allergic to penicillin."),
    (61.50, 63.85, "A haemoglobin test is ordered, and the visit is saved."),
    (63.90, 66.65, "A trigger refuses the Amoxicillin line, so the whole visit is rolled back: nothing was saved."),
    (66.70, 69.15, "Amoxicillin is removed, and the visit is saved again."),
    (69.20, 70.25, "Saved as one transaction."),
    (70.30, 72.90, "Next the doctor looks up Fatema: no appointment, no referral, no consent."),
    (72.95, 74.75, "Without a reason to see her, the database refuses the record."),
    (74.80, 77.90, "Break-glass opens it in an emergency, but only with a written reason."),
    (77.95, 79.15, "The read is flagged for review."),
    (79.25, 82.70, "The lab technician enters the haemoglobin result: 10.2 g/dL."),
    (82.75, 84.40, "A trigger compares it with the reference range: Abnormal."),
    (84.50, 89.80, "The hospital administrator compares the two Rahim records the database flagged as one person."),
    (89.85, 92.40, "Merging moves everything to one UHID in one transaction; the old UHID still opens the record."),
    (92.50, 95.95, "Finally, straight into MySQL with no web page: change a bed's status by hand. Refused."),
    (96.00, 99.70, "Delete a row from the access log. Refused: the log is append-only."),
    (99.75, 101.20, "Insert a UHID with a wrong check digit. Refused."),
    (101.30, 105.80, "Every rule in this demo was enforced by the database itself, not by the web pages."),
]

# ---------------------------------------------------------------- the call-outs
# (start, end, [rectangles in video px], label, label anchor (x, y) in video px, ASS \an)
# \an: 7 top-left, 8 top-centre, 9 top-right, 1 bottom-left, 2 bottom-centre, 3 bottom-right,
#      4 middle-left, 6 middle-right
NOTES = [
    (8.00, 10.90, [(1345, 227, 1787, 762)],
     "Duplicate check in MySQL: same NID, same name + birth date,\\Nor same mobile — before any UHID is issued", (1787, 780), 9),
    (17.40, 19.95, [(830, 432, 1090, 488)],
     "Check digit = serial digits summed mod 10 (0+0+0+0+1 = 1),\\Nverified by the CHECK constraint ck_patient_uhid_check_digit", (960, 288), 2),
    (20.70, 23.40, [(305, 702, 420, 746), (678, 702, 793, 746), (927, 702, 1042, 746), (1051, 804, 1166, 848)],
     "Struck through = already booked.\\NThe grid is one query, never a stored table", (1440, 724), 4),
    (29.80, 31.35, [(160, 920, 800, 958)],
     "SELECT … FOR UPDATE on the doctor's row\\N+ UNIQUE (doctor_id, slot_start)", (830, 939), 4),
    (37.50, 39.80, [(662, 487, 763, 565)],
     "Set to Occupied by the trigger trg_bed_occupancy_ai\\Nwhen the bed stay row is inserted", (712, 585), 8),
    (43.50, 44.85, [(1578, 973, 1893, 1053)],
     "Refused in the database: the ward is for the other sex.\\NThe whole transfer rolled back", (1893, 955), 3),
    (45.00, 46.70, [(1456, 188, 1759, 235), (305, 521, 1787, 606)],
     "The referral from Square Hospital carried a consent grant.\\NThis read was written to access_log before the record was returned", (1759, 250), 9),
    (47.00, 50.15, [],
     "5 encounters · 4 hospitals · one record", (1786, 92), 9),
    (51.10, 55.55, [(1377, 447, 1787, 601)],
     "Allergies on file: penicillin (severe), sulfa drugs", (1787, 437), 3),
    (56.00, 62.85, [(1377, 326, 1787, 480)],
     "Penicillin allergy on file —\\Nwatch what happens to Amoxicillin", (1787, 316), 3),
    (64.10, 66.65, [(334, 252, 1325, 357)],
     "trg_prescription_item_bi raised SIGNAL 45000 → ROLLBACK:\\Nthe diagnosis and the first medicine were undone too", (830, 372), 8),
    (64.10, 66.65, [(1377, 617, 1787, 998)],
     "Six procedure calls,\\None START TRANSACTION … COMMIT", (1787, 607), 3),
    (69.30, 70.25, [(328, 545, 425, 585)],
     "Referral now marked Arrived", (440, 565), 4),
    (78.00, 79.15, [(305, 347, 1787, 428), (1416, 188, 1759, 235)],
     "Break-glass: logged with the reason,\\Nqueued for the hospital administrator's review", (1787, 440), 9),
    (82.75, 84.40, [(307, 438, 1786, 528)],
     "is_abnormal set by the trigger trg_lab_result_bi:\\N10.2 is below the range 12–15.5", (1786, 545), 9),
    (84.60, 89.75, [],
     "Found by the view v_possible_duplicates —\\Na self-join on patient (same name + birth date, or mobile)", (1786, 100), 9),
    (89.90, 91.20, [(693, 388, 1227, 492)],
     "Encounters, appointments, referrals, consents and allergies\\Nall move in one transaction", (960, 262), 2),
    (91.30, 92.40, [(1498, 973, 1891, 1037)],
     "The losing UHID now opens the surviving record", (1891, 955), 3),
    (93.50, 101.20, [(160, 182, 1556, 208)],
     "1 · Trigger trg_bed_bu: a bed's status changes only by admit, transfer or discharge", (169, 560), 7),
    (96.00, 101.20, [(160, 289, 874, 315)],
     "2 · Triggers on access_log: no UPDATE, no DELETE — append-only", (169, 625), 7),
    (99.75, 101.20, [(160, 430, 1277, 456)],
     "3 · CHECK constraint: 7+0+4+1+3 = 15, so the check digit must be 5, not 4", (169, 690), 7),
]

# The numbered badges at the end of each refused statement in the mysql scene
BADGES = [(93.50, 101.20, "1", 1572, 195), (96.00, 101.20, "2", 890, 302), (99.75, 101.20, "3", 1293, 443)]


NOTE_FS = 25            # label font size (ASS units)
NOTE_PAD_X, NOTE_PAD_Y = 12, 7
_FONT_CACHE = {}


def text_width(text, fonts_dir, fs=NOTE_FS):
    """Width libass will give `text` in IBM Plex Sans SemiBold. libass sizes a font by its
    OS/2 win ascent + descent, which for Plex is 1.397 em, so the em is fs / 1.397."""
    if fs not in _FONT_CACHE:
        path = next(f for f in sorted(pathlib.Path(fonts_dir).glob("*.ttf"))
                    if "Sans" in " ".join(ImageFont.truetype(str(f), 10).getname())
                    and "SemiBold" in " ".join(ImageFont.truetype(str(f), 10).getname()))
        _FONT_CACHE[fs] = ImageFont.truetype(str(path), fs / 1.397)
    return _FONT_CACHE[fs].getlength(text)


def label_box(label, ax, ay, an, fonts_dir):
    """Top-left corner and size of the label's box, placed by its anchor and \\an."""
    lines = label.split("\\N")
    w = max(text_width(l, fonts_dir) for l in lines) + 2 * NOTE_PAD_X
    h = NOTE_FS * len(lines) + 2 * NOTE_PAD_Y
    col, row = (an - 1) % 3, (an - 1) // 3          # col 0 left 1 centre 2 right; row 0 bottom 1 middle 2 top
    x = ax - (0, w / 2, w)[col]
    y = ay - (h, h / 2, 0)[row]
    return round(x), round(y), round(w), round(h)


def rect_path(x1, y1, x2, y2):
    return f"m {x1} {y1} l {x2} {y1} l {x2} {y2} l {x1} {y2}"


def build_ass(fonts_dir):
    out = []
    out.append("""[Script Info]
Title: UHID demo video — captions and annotations
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
""")
    out.append(f"Style: Caption,IBM Plex Sans,38,{WHITE},{WHITE},{RAIL},&H00000000,0,0,0,0,100,100,0,0,1,0,0,4,470,56,0,1\n")
    out.append(f"Style: PartNo,IBM Plex Mono,21,{AMBER},{AMBER},{RAIL},&H00000000,0,0,0,0,100,100,1,0,1,0,0,7,48,0,0,1\n")
    out.append(f"Style: PartName,IBM Plex Sans SemiBold,32,{WHITE},{WHITE},{RAIL},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,48,0,0,1\n")
    out.append(f"Style: PartSub,IBM Plex Sans,21,{SOFT},{SOFT},{RAIL},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,48,0,0,1\n")
    out.append(f"Style: Note,IBM Plex Sans SemiBold,{NOTE_FS},{INK},{INK},{AMBER},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n")
    out.append(f"Style: Shape,IBM Plex Sans,20,{AMBER},{AMBER},{AMBER},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n")
    out.append("""
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""")
    D = "Dialogue: {layer},{s},{e},{style},,0,0,0,,{text}\n"

    # Caption band furniture: the divider between the part and the caption
    out.append(D.format(layer=0, s=ts(0), e=ts(105.87), style="Shape",
               text=f"{{\\pos(0,0)\\an7\\1c{SOFT}\\1a&HB0&\\bord0\\p1}}{rect_path(436, BAND_Y + 30, 438, 1080 - 30)}{{\\p0}}"))

    for s, e, n, name, sub in PARTS:
        label = "UHID DEMO" if n is None else f"PART {n} OF 10"
        out.append(D.format(layer=1, s=ts(s), e=ts(e), style="PartNo", text=f"{{\\pos(48,{BAND_Y + 30})}}{label}"))
        out.append(D.format(layer=1, s=ts(s), e=ts(e), style="PartName", text=f"{{\\pos(48,{BAND_Y + 58})}}{name}"))
        out.append(D.format(layer=1, s=ts(s), e=ts(e), style="PartSub", text=f"{{\\pos(48,{BAND_Y + 102})}}{sub}"))

    for s, e, text in CAPTIONS:
        out.append(D.format(layer=1, s=ts(s), e=ts(e), style="Caption",
                   text=f"{{\\fad(120,120)\\pos(470,{BAND_Y + 84})}}{text}"))

    for s, e, rects, label, (ax, ay), an in NOTES:
        for (x1, y1, x2, y2) in rects:
            pad = 6
            path = rect_path(vx(x1) - pad, vy(y1) - pad, vx(x2) + pad, vy(y2) + pad)
            # transparent fill, a 4 px amber outline, a faint dark halo so it reads on white
            out.append(D.format(layer=2, s=ts(s), e=ts(e), style="Shape",
                       text=f"{{\\pos(0,0)\\an7\\fad(150,150)\\1a&HFF&\\3c{RAIL}\\3a&H90&\\bord7\\p1}}{path}{{\\p0}}"))
            out.append(D.format(layer=3, s=ts(s), e=ts(e), style="Shape",
                       text=f"{{\\pos(0,0)\\an7\\fad(150,150)\\1a&HFF&\\3c{AMBER}\\bord3.5\\p1}}{path}{{\\p0}}"))
        bx, by, bw, bh = label_box(label, vx(ax), vy(ay), an, fonts_dir)
        bx = max(8, min(bx, 1920 - 8 - bw))         # keep it on the frame
        out.append(D.format(layer=4, s=ts(s), e=ts(e), style="Shape",
                   text=f"{{\\pos(0,0)\\an7\\fad(150,150)\\1c{AMBER}\\bord0\\shad3\\4c{RAIL}\\4a&H60&\\p1}}"
                        f"{rect_path(bx, by, bx + bw, by + bh)}{{\\p0}}"))
        out.append(D.format(layer=5, s=ts(s), e=ts(e), style="Note",
                   text=f"{{\\an7\\pos({bx + NOTE_PAD_X},{by + NOTE_PAD_Y})\\fad(150,150)}}{label}"))

    for s, e, mark, x, y in BADGES:
        cx, cy, r = vx(x) + 14, vy(y), 15
        out.append(D.format(layer=4, s=ts(s), e=ts(e), style="Shape",
                   text=f"{{\\pos(0,0)\\an7\\fad(150,150)\\1c{AMBER}\\bord0\\p1}}{rect_path(cx - r, cy - r, cx + r, cy + r)}{{\\p0}}"))
        out.append(D.format(layer=5, s=ts(s), e=ts(e), style="Note",
                   text=f"{{\\an5\\pos({cx},{cy})\\fad(150,150)}}{mark}"))
    return "".join(out)


def build_srt():
    lines = []
    for i, (s, e, text) in enumerate(CAPTIONS, 1):
        lines.append(f"{i}\n{srt_ts(s)} --> {srt_ts(e)}\n{text}\n")
    return "\n".join(lines)


def build_vtt():
    lines = ["WEBVTT", ""]
    for s, e, text in CAPTIONS:
        lines.append(f"{srt_ts(s).replace(',', '.')} --> {srt_ts(e).replace(',', '.')}\n{text}\n")
    return "\n".join(lines)


if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    fonts = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else out / "fonts"
    out.mkdir(parents=True, exist_ok=True)
    (out / "captions.ass").write_text(build_ass(fonts), encoding="utf-8")
    (out / "captions.srt").write_text(build_srt(), encoding="utf-8")
    (out / "captions.vtt").write_text(build_vtt(), encoding="utf-8")
    print(f"wrote captions.ass, captions.srt, captions.vtt to {out}")
