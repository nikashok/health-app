#!/usr/bin/env python3
"""Build the bundled reference database assets/db/ifct2017.db.

Inputs (vendored under db_build/sources/):
  - ifct2017_foods.csv     : IFCT 2017 raw ingredients (528 rows)
  - Anuvaad_INDB_2024.xlsx : INDB 2024 cooked dishes (1014 rows)

Output:
  - assets/db/ifct2017.db  : read-only reference data shipped with the app.
    Tables: foods, cooked_foods, foods_fts, cooked_foods_fts.

This DB is COMMITTED and copied to writable storage on first launch. It contains
ONLY reference data. User tables (user_profile, log_entries, custom_foods,
measures) and the N001 typo correction are applied by the runtime migration (M0),
never here. See CLAUDE.md.

The INDB sheet has no qa_note column, but M0 needs a flag for "broken" serving
sizes (PRD §9 #2: ~4% of INDB serving sizes are unreliable). The INDB per-serving
columns are exactly proportional to the per-100g columns, so the implied serving
weight = unit_serving_energy_kcal / energy_kcal * 100 is exact. We set qa_note when
that implied weight is missing or implausible as a single food portion. The measures
seed (runtime) skips a dish's serving as a default when qa_note IS NOT NULL.
"""
import csv
import os
import sqlite3
import xml.etree.ElementTree as ET
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "sources")
OUT = os.path.join(ROOT, "assets", "db", "ifct2017.db")

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Implausible-portion band for INDB serving weights (grams). Anything outside this
# band (or non-computable) gets qa_note flagged so it is not used as a default
# measure. Bounds chosen to exclude clearly-broken weights while keeping legitimate
# large thali/plate servings (observed p95 ~650 g).
MIN_SERVING_G = 5.0
MAX_SERVING_G = 1000.0


def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def load_ifct():
    rows = []
    with open(os.path.join(SRC, "ifct2017_foods.csv"), newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            rows.append(
                (
                    r["code"].strip(),
                    r["name"].strip(),
                    (r["common_name"] or "").strip() or None,
                    (r["scientific_name"] or "").strip() or None,
                    (r["group_code"] or "").strip() or None,
                    (r["food_group"] or "").strip() or None,
                    fnum(r["energy_kcal"]),
                    fnum(r["energy_kj"]),
                    fnum(r["protein_g"]),
                    fnum(r["fat_g"]),
                    fnum(r["carb_g"]),
                    fnum(r["fibre_g"]),
                    fnum(r["water_g"]),
                    fnum(r["ash_g"]),
                    (r["regions"] or "").strip() or None,
                    (r["qa_note"] or "").strip() or None,
                )
            )
    return rows


def load_indb():
    xlsx = os.path.join(SRC, "Anuvaad_INDB_2024.xlsx")
    with zipfile.ZipFile(xlsx) as z:
        ss_root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        shared = ["".join(t.text or "" for t in si.iter(NS + "t")) for si in ss_root]
        sheet_root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    def cell(c):
        v = c.find(NS + "v")
        if v is None:
            return ""
        return shared[int(v.text)] if c.get("t") == "s" else v.text

    rows = sheet_root.find(NS + "sheetData").findall(NS + "row")
    header = [cell(c) for c in rows[0].findall(NS + "c")]
    idx = {h: i for i, h in enumerate(header)}

    out = []
    flagged = 0
    for r in rows[1:]:
        vals = [cell(c) for c in r.findall(NS + "c")]
        def g(name):
            i = idx[name]
            return vals[i] if i < len(vals) else ""

        energy_kcal = fnum(g("energy_kcal"))
        serving_kcal = fnum(g("unit_serving_energy_kcal"))
        unit = (g("servings_unit") or "").strip() or None

        # implied serving weight (exact, since serving cols are proportional)
        implied = None
        if energy_kcal and serving_kcal is not None and energy_kcal != 0:
            implied = serving_kcal / energy_kcal * 100.0

        qa_note = None
        if unit is not None:  # only a present serving unit can be "broken"
            if implied is None or implied <= 0:
                qa_note = "Serving weight not computable from INDB energy."
            elif implied < MIN_SERVING_G or implied > MAX_SERVING_G:
                qa_note = f"Implied serving weight {implied:.0f} g implausible; treat as suggestion."
        if qa_note:
            flagged += 1

        out.append(
            (
                g("food_code").strip(),
                g("food_name").strip(),
                (g("primarysource") or "").strip() or None,
                energy_kcal,
                fnum(g("energy_kj")),
                fnum(g("carb_g")),
                fnum(g("protein_g")),
                fnum(g("fat_g")),
                fnum(g("freesugar_g")),
                fnum(g("fibre_g")),
                fnum(g("sodium_mg")),
                unit,
                serving_kcal,
                qa_note,
            )
        )
    return out, flagged


def build():
    foods = load_ifct()
    cooked, flagged = load_indb()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)
    db = sqlite3.connect(OUT)
    db.executescript(
        """
        CREATE TABLE foods (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          common_name TEXT,
          scientific_name TEXT,
          group_code TEXT,
          food_group TEXT,
          energy_kcal REAL,
          energy_kj REAL,
          protein_g REAL,
          fat_g REAL,
          carb_g REAL,
          fibre_g REAL,
          water_g REAL,
          ash_g REAL,
          regions TEXT,
          qa_note TEXT
        );

        CREATE TABLE cooked_foods (
          food_code TEXT PRIMARY KEY,
          food_name TEXT NOT NULL,
          primarysource TEXT,
          energy_kcal REAL,
          energy_kj REAL,
          carb_g REAL,
          protein_g REAL,
          fat_g REAL,
          freesugar_g REAL,
          fibre_g REAL,
          sodium_mg REAL,
          servings_unit TEXT,
          unit_serving_energy_kcal REAL,
          qa_note TEXT
        );

        CREATE VIRTUAL TABLE foods_fts USING fts5(code, name, common_name);
        CREATE VIRTUAL TABLE cooked_foods_fts USING fts5(food_code, food_name);
        """
    )

    db.executemany(
        "INSERT INTO foods VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", foods
    )
    db.executemany(
        "INSERT INTO cooked_foods VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", cooked
    )
    db.executemany(
        "INSERT INTO foods_fts (code, name, common_name) VALUES (?,?,?)",
        [(f[0], f[1], f[2] or "") for f in foods],
    )
    db.executemany(
        "INSERT INTO cooked_foods_fts (food_code, food_name) VALUES (?,?)",
        [(c[0], c[1]) for c in cooked],
    )
    db.commit()

    nf = db.execute("SELECT count(*) FROM foods").fetchone()[0]
    nc = db.execute("SELECT count(*) FROM cooked_foods").fetchone()[0]
    n001 = db.execute("SELECT energy_kcal FROM foods WHERE code='N001'").fetchone()[0]
    db.close()

    print(f"foods           : {nf}")
    print(f"cooked_foods    : {nc}")
    print(f"qa_note flagged : {flagged}")
    print(f"N001 (raw src)  : {n001} kcal  (migration corrects to 191.0)")
    print(f"wrote           : {OUT}  ({os.path.getsize(OUT)} bytes)")

    assert nf == 528, f"expected 528 foods, got {nf}"
    assert nc == 1014, f"expected 1014 cooked_foods, got {nc}"


if __name__ == "__main__":
    build()
