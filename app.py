import os, sqlite3
from datetime import date, datetime
from flask import Flask, request, jsonify, send_file, Response, render_template_string

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("LYNX_DATA_DIR", os.path.join(BASE_DIR, "data"))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "lynx.db")

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

DEFAULTS = dict(
    line="GS Mach Line 1", material_default="PLA+",
    target_weight=1.0, weight_tol=0.02, target_dia=1.75, dia_tol=0.05,
    spools_per_hr=10,
)
# 3-shift model (24h coverage, 8h each)
SHIFTS = [
    ("S1", "08:30", "16:30"),
    ("S2", "16:30", "00:30"),
    ("S3", "00:30", "08:30"),
]
# sample operators so the dropdown is usable; rename/delete in Setup
SAMPLE_OPS = ["Ahmed", "Mahmoud", "Youssef"]

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = db(); c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS days(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      line TEXT, material_default TEXT,
      target_weight REAL, weight_tol REAL, target_dia REAL, dia_tol REAL,
      spools_per_hr REAL, planned_colors TEXT, batch_ids TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS shifts(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL, start TEXT, end TEXT
    );
    CREATE TABLE IF NOT EXISTS operators(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL, active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS blocks(
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER,
      shift TEXT, block_time TEXT, color TEXT, batch_id TEXT,
      target_kg REAL, actual_kg REAL, operator TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS weight_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER, date TEXT,
      hour INTEGER, time TEXT, color TEXT, batch_id TEXT, reading_kg REAL, operator TEXT
    );
    CREATE TABLE IF NOT EXISTS diameter_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER, date TEXT,
      hour INTEGER, time TEXT, color TEXT, batch_id TEXT, reading_mm REAL, operator TEXT
    );
    CREATE TABLE IF NOT EXISTS transitions(
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER, date TEXT, time TEXT,
      line TEXT, from_color TEXT, to_color TEXT, batch_id TEXT,
      spools INTEGER, weight_kg REAL, operator TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS materials(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      code TEXT NOT NULL,
      target_weight REAL, target_dia REAL
    );
    CREATE TABLE IF NOT EXISTS colors(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      code TEXT NOT NULL
    );
    """)
    conn.commit(); conn.close()

def migrate():
    conn = db(); c = conn.cursor()
    cols = [r[1] for r in c.execute("PRAGMA table_info(days)")]
    if "spools_per_hr" not in cols:
        c.execute("ALTER TABLE days ADD COLUMN spools_per_hr REAL DEFAULT 10")
    if "planned_colors" not in cols:
        c.execute("ALTER TABLE days ADD COLUMN planned_colors TEXT DEFAULT ''")
    for tbl in ("weight_logs", "diameter_logs"):
        tcols = [r[1] for r in c.execute(f"PRAGMA table_info({tbl})")]
        if "operator" not in tcols:
            c.execute(f"ALTER TABLE {tbl} ADD COLUMN operator TEXT")
    conn.commit(); conn.close()

def seed_static():
    conn = db(); c = conn.cursor()
    if not c.execute("SELECT COUNT(*) FROM shifts").fetchone()[0]:
        c.executemany("INSERT INTO shifts(name,start,end) VALUES(?,?,?)", SHIFTS)
    if not c.execute("SELECT COUNT(*) FROM operators").fetchone()[0]:
        c.executemany("INSERT INTO operators(name) VALUES(?)", [(o,) for o in SAMPLE_OPS])
    if not c.execute("SELECT COUNT(*) FROM materials").fetchone()[0]:
        mats = [
            ("PLA+", "PLA", 1.0, 1.75), ("PLA CF", "PLACF", 1.0, 1.75),
            ("PETG HF", "PETG", 1.0, 1.75), ("PETG-CF", "PETGCF", 1.0, 1.75),
            ("ABS CF", "ABSCF", 1.0, 1.75), ("ABS+/ASA", "ABS", 1.0, 1.75),
        ]
        c.executemany("INSERT INTO materials(name,code,target_weight,target_dia) VALUES(?,?,?,?)", mats)
    if not c.execute("SELECT COUNT(*) FROM colors").fetchone()[0]:
        cols = [
            ("White","wht"),("Black","blk"),("Red","red"),("Blue","blu"),("Green","grn"),
            ("Grey","gry"),("Yellow","yel"),("Orange","org"),("Natural","nat"),("Silver","sil"),
            ("Purple","pur"),("Brown","brn"),("Transparent","tra"),
        ]
        c.executemany("INSERT INTO colors(name,code) VALUES(?,?)", cols)
    conn.commit(); conn.close()

init_db(); migrate(); seed_static()

def d_or_null(v):
    try:
        if v is None or v == "": return None
        return float(v)
    except Exception:
        return None

def i_or_null(v):
    try:
        if v is None or v == "": return None
        return int(v)
    except Exception:
        return None

# ---------- API ----------
@app.route("/")
def index():
    from flask import send_from_directory
    return send_from_directory("templates", "index.html")

@app.route("/api/setup-defaults")
def setup_defaults():
    return jsonify(DEFAULTS)

def batch_id(material, color, d):
    try:
        y, m, day = d.split("-")
        ddmmyy = f"{day}{m}{y[2:]}"
    except Exception:
        ddmmyy = d
    mat_code = ""; col_code = ""
    if material:
        conn = db(); c = conn.cursor()
        row = c.execute("SELECT code FROM materials WHERE name=?", (material,)).fetchone()
        if row: mat_code = row["code"]
        else: mat_code = material.upper().replace(" ", "").split("-")[0]
        row = c.execute("SELECT code FROM colors WHERE name=?", (color,)).fetchone() if color else None
        if row: col_code = row["code"]
        conn.close()
    if not col_code and color:
        col_code = color.lower().replace(" ", "").split("-")[0][:3]
    if not mat_code: mat_code = "MAT"
    if not col_code: col_code = "col"
    return f"{mat_code}-{col_code}-{ddmmyy}"

@app.route("/api/catalog")
def catalog():
    conn = db(); c = conn.cursor()
    mats = [dict(r) for r in c.execute("SELECT * FROM materials ORDER BY name")]
    cols = [dict(r) for r in c.execute("SELECT * FROM colors ORDER BY name")]
    conn.close()
    return jsonify(materials=mats, colors=cols)

@app.route("/api/shifts")
def shifts():
    conn = db(); c = conn.cursor()
    rows = [dict(r) for r in c.execute("SELECT * FROM shifts ORDER BY name")]
    conn.close()
    return jsonify(shifts=rows)

@app.route("/api/operators")
def operators():
    conn = db(); c = conn.cursor()
    rows = [dict(r) for r in c.execute("SELECT * FROM operators ORDER BY name")]
    conn.close()
    return jsonify(operators=rows)

@app.route("/api/operator", methods=["POST"])
def add_operator():
    p = request.json; name = (p.get("name") or "").strip()
    if not name: return jsonify(ok=False, error="Name required"), 400
    conn = db(); c = conn.cursor()
    try:
        c.execute("INSERT INTO operators(name) VALUES(?)", (name,))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify(ok=False, error="Operator already exists"), 409
    conn.close()
    return jsonify(ok=True)

@app.route("/api/operator/<int:rid>", methods=["POST"])
def delete_operator(rid):
    conn = db(); c = conn.cursor()
    c.execute("DELETE FROM operators WHERE id=?", (rid,))
    conn.commit(); conn.close()
    return jsonify(ok=True)

@app.route("/api/material", methods=["POST"])
def upsert_material():
    p = request.json
    conn = db(); c = conn.cursor()
    try:
        if p.get("id"):
            c.execute("UPDATE materials SET name=?,code=?,target_weight=?,target_dia=? WHERE id=?",
                      (p["name"], p["code"], d_or_null(p.get("target_weight")), d_or_null(p.get("target_dia")), p["id"]))
        else:
            c.execute("INSERT INTO materials(name,code,target_weight,target_dia) VALUES(?,?,?,?)",
                      (p["name"], p["code"], d_or_null(p.get("target_weight")), d_or_null(p.get("target_dia"))))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify(ok=False, error="A material with that name already exists"), 409
    conn.close()
    return jsonify(ok=True)

@app.route("/api/color", methods=["POST"])
def upsert_color():
    p = request.json
    conn = db(); c = conn.cursor()
    try:
        if p.get("id"):
            c.execute("UPDATE colors SET name=?,code=? WHERE id=?", (p["name"], p["code"], p["id"]))
        else:
            c.execute("INSERT INTO colors(name,code) VALUES(?,?)", (p["name"], p["code"]))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify(ok=False, error="A color with that name already exists"), 409
    conn.close()
    return jsonify(ok=True)

@app.route("/api/catalog-delete/<tbl>/<int:rid>", methods=["POST"])
def delete_catalog(tbl, rid):
    allowed = {"material": "materials", "color": "colors"}
    if tbl not in allowed: return jsonify(ok=False), 400
    conn = db(); c = conn.cursor()
    c.execute(f"DELETE FROM {allowed[tbl]} WHERE id=?", (rid,))
    conn.commit(); conn.close()
    return jsonify(ok=True)

@app.route("/api/day/<d>", methods=["GET"])
def get_day(d):
    conn = db(); c = conn.cursor()
    c.execute("SELECT * FROM days WHERE date=?", (d,))
    day = c.fetchone()
    if not day:
        return jsonify(dict(exists=False, **DEFAULTS, planned_colors="", blocks=[], weights=[], diameters=[], transitions=[]))
    day = dict(day)
    blocks = [dict(r) for r in c.execute("SELECT * FROM blocks WHERE day_id=? ORDER BY id", (day["id"],))]
    weights = [dict(r) for r in c.execute("SELECT * FROM weight_logs WHERE day_id=? ORDER BY hour", (day["id"],))]
    diameters = [dict(r) for r in c.execute("SELECT * FROM diameter_logs WHERE day_id=? ORDER BY hour", (day["id"],))]
    transitions = [dict(r) for r in c.execute("SELECT * FROM transitions WHERE day_id=? ORDER BY id", (day["id"],))]
    conn.close()
    mat = (day.get("material_default") or DEFAULTS["material_default"])
    bp = batch_id(mat, "", d)
    return jsonify(dict(exists=True, **day, blocks=blocks, weights=weights, diameters=diameters, transitions=transitions, batch_preview=bp))

@app.route("/api/day", methods=["POST"])
def upsert_day():
    p = request.json
    d = p["date"]
    conn = db(); c = conn.cursor()
    c.execute("SELECT id FROM days WHERE date=?", (d,))
    row = c.fetchone()
    fields = dict(
        line=p.get("line", DEFAULTS["line"]),
        material_default=p.get("material_default", DEFAULTS["material_default"]),
        target_weight=d_or_null(p.get("target_weight", DEFAULTS["target_weight"])),
        weight_tol=d_or_null(p.get("weight_tol", DEFAULTS["weight_tol"])),
        target_dia=d_or_null(p.get("target_dia", DEFAULTS["target_dia"])),
        dia_tol=d_or_null(p.get("dia_tol", DEFAULTS["dia_tol"])),
        spools_per_hr=d_or_null(p.get("spools_per_hr", DEFAULTS["spools_per_hr"])),
        planned_colors=p.get("planned_colors", ""),
        batch_ids=p.get("batch_ids", ""),
    )
    if row:
        c.execute("UPDATE days SET line=?,material_default=?,target_weight=?,weight_tol=?,target_dia=?,dia_tol=?,spools_per_hr=?,planned_colors=?,batch_ids=? WHERE date=?",
                  (fields["line"], fields["material_default"], fields["target_weight"], fields["weight_tol"], fields["target_dia"], fields["dia_tol"], fields["spools_per_hr"], fields["planned_colors"], fields["batch_ids"], d))
        day_id = row["id"]
    else:
        c.execute("INSERT INTO days(date,line,material_default,target_weight,weight_tol,target_dia,dia_tol,spools_per_hr,planned_colors,batch_ids,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (d, fields["line"], fields["material_default"], fields["target_weight"], fields["weight_tol"], fields["target_dia"], fields["dia_tol"], fields["spools_per_hr"], fields["planned_colors"], fields["batch_ids"], datetime.now().isoformat()))
        day_id = c.lastrowid
    conn.commit(); conn.close()
    return jsonify(day_id=day_id)

def _table_cols():
    return {}

@app.route("/api/blocks", methods=["POST"])
def add_block():
    p = request.json
    conn = db(); c = conn.cursor()
    day_id = _day_id(c, p["date"])
    if p.get("id"):
        c.execute("UPDATE blocks SET shift=?,block_time=?,color=?,batch_id=?,target_kg=?,actual_kg=?,operator=?,notes=? WHERE id=?",
                  (p.get("shift"), p.get("block_time"), p.get("color"), p.get("batch_id"), d_or_null(p.get("target_kg")), d_or_null(p.get("actual_kg")), p.get("operator"), p.get("notes"), p["id"]))
    else:
        c.execute("INSERT INTO blocks(day_id,shift,block_time,color,batch_id,target_kg,actual_kg,operator,notes) VALUES(?,?,?,?,?,?,?,?,?)",
                  (day_id, p.get("shift"), p.get("block_time"), p.get("color"), p.get("batch_id"), d_or_null(p.get("target_kg")), d_or_null(p.get("actual_kg")), p.get("operator"), p.get("notes")))
    conn.commit(); conn.close()
    return jsonify(ok=True)

@app.route("/api/weight", methods=["POST"])
def add_weight():
    p = request.json
    conn = db(); c = conn.cursor()
    day_id = _day_id(c, p["date"])
    if p.get("id"):
        c.execute("UPDATE weight_logs SET hour=?,time=?,color=?,batch_id=?,reading_kg=?,operator=? WHERE id=?",
                  (i_or_null(p.get("hour")), p.get("time"), p.get("color"), p.get("batch_id"), d_or_null(p.get("reading_kg")), p.get("operator"), p["id"]))
    else:
        c.execute("INSERT INTO weight_logs(day_id,date,hour,time,color,batch_id,reading_kg,operator) VALUES(?,?,?,?,?,?,?,?)",
                  (day_id, p["date"], i_or_null(p.get("hour")), p.get("time"), p.get("color"), p.get("batch_id"), d_or_null(p.get("reading_kg")), p.get("operator")))
    conn.commit(); conn.close()
    return jsonify(ok=True)

@app.route("/api/diameter", methods=["POST"])
def add_diameter():
    p = request.json
    conn = db(); c = conn.cursor()
    day_id = _day_id(c, p["date"])
    if p.get("id"):
        c.execute("UPDATE diameter_logs SET hour=?,time=?,color=?,batch_id=?,reading_mm=?,operator=? WHERE id=?",
                  (i_or_null(p.get("hour")), p.get("time"), p.get("color"), p.get("batch_id"), d_or_null(p.get("reading_mm")), p.get("operator"), p["id"]))
    else:
        c.execute("INSERT INTO diameter_logs(day_id,date,hour,time,color,batch_id,reading_mm,operator) VALUES(?,?,?,?,?,?,?,?)",
                  (day_id, p["date"], i_or_null(p.get("hour")), p.get("time"), p.get("color"), p.get("batch_id"), d_or_null(p.get("reading_mm")), p.get("operator")))
    conn.commit(); conn.close()
    return jsonify(ok=True)

@app.route("/api/transition", methods=["POST"])
def add_transition():
    p = request.json
    conn = db(); c = conn.cursor()
    day_id = _day_id(c, p["date"])
    if p.get("id"):
        c.execute("UPDATE transitions SET time=?,line=?,from_color=?,to_color=?,batch_id=?,spools=?,weight_kg=?,operator=?,notes=? WHERE id=?",
                  (p.get("time"), p.get("line"), p.get("from_color"), p.get("to_color"), p.get("batch_id"), i_or_null(p.get("spools")), d_or_null(p.get("weight_kg")), p.get("operator"), p.get("notes"), p["id"]))
    else:
        c.execute("INSERT INTO transitions(day_id,date,time,line,from_color,to_color,batch_id,spools,weight_kg,operator,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (day_id, p["date"], p.get("time"), p.get("line"), p.get("from_color"), p.get("to_color"), p.get("batch_id"), i_or_null(p.get("spools")), d_or_null(p.get("weight_kg")), p.get("operator"), p.get("notes")))
    conn.commit(); conn.close()
    return jsonify(ok=True)

@app.route("/api/delete/<tbl>/<int:rid>", methods=["POST"])
def delete_row(tbl, rid):
    allowed = {"blocks": "blocks", "weight": "weight_logs", "diameter": "diameter_logs", "transition": "transitions"}
    if tbl not in allowed: return jsonify(ok=False), 400
    conn = db(); c = conn.cursor()
    c.execute(f"DELETE FROM {allowed[tbl]} WHERE id=?", (rid,))
    conn.commit(); conn.close()
    return jsonify(ok=True)

def _day_id(c, d):
    c.execute("SELECT id FROM days WHERE date=?", (d,))
    row = c.fetchone()
    if row: return row["id"]
    c.execute("INSERT INTO days(date,line,material_default,target_weight,weight_tol,target_dia,dia_tol,spools_per_hr,planned_colors,batch_ids,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
              (d, DEFAULTS["line"], DEFAULTS["material_default"], DEFAULTS["target_weight"], DEFAULTS["weight_tol"], DEFAULTS["target_dia"], DEFAULTS["dia_tol"], DEFAULTS["spools_per_hr"], "", "", datetime.now().isoformat()))
    return c.lastrowid

@app.route("/api/summary/<d>")
def summary(d):
    conn = db(); c = conn.cursor()
    c.execute("SELECT * FROM days WHERE date=?", (d,))
    day = c.fetchone()
    if not day:
        day = dict(date=d, **DEFAULTS, planned_colors="")
    else:
        day = dict(day)
    blocks = [dict(r) for r in c.execute("SELECT * FROM blocks WHERE day_id=(SELECT id FROM days WHERE date=?)", (d,))]
    weights = [dict(r) for r in c.execute("SELECT * FROM weight_logs WHERE day_id=(SELECT id FROM days WHERE date=?)", (d,))]
    diams = [dict(r) for r in c.execute("SELECT * FROM diameter_logs WHERE day_id=(SELECT id FROM days WHERE date=?)", (d,))]
    trans = [dict(r) for r in c.execute("SELECT * FROM transitions WHERE day_id=(SELECT id FROM days WHERE date=?)", (d,))]
    conn.close()
    tgt_w = day.get("target_weight") or 1.0
    wt_tol = day.get("weight_tol") or 0.02
    tgt_d = day.get("target_dia") or 1.75
    d_tol = day.get("dia_tol") or 0.05
    total_target = sum((b["target_kg"] or 0) for b in blocks)
    total_actual = sum((b["actual_kg"] or 0) for b in blocks)
    spools = round(total_actual / tgt_w) if tgt_w else 0
    w_checks = len(weights)
    w_oos = sum(1 for w in weights if w["reading_kg"] is not None and abs(w["reading_kg"] - tgt_w) > wt_tol)
    d_checks = len(diams)
    d_oos = sum(1 for x in diams if x["reading_mm"] is not None and abs(x["reading_mm"] - tgt_d) > d_tol)
    t_spools = sum((t["spools"] or 0) for t in trans)
    t_w = sum((t["weight_kg"] or 0) for t in trans)
    status = "PASS - customer-ready" if (w_oos == 0 and d_oos == 0) else "REVIEW - OUT OF SPEC found"
    return jsonify(dict(
        date=d, line=day.get("line"), material_default=day.get("material_default"),
        planned_colors=day.get("planned_colors", ""),
        batch_ids=day.get("batch_ids", ""),
        total_target=round(total_target, 2), total_actual=round(total_actual, 2),
        variance=round(total_actual - total_target, 2), est_spools=spools,
        weight_checks=w_checks, weight_oos=w_oos, weight_ok=w_checks - w_oos,
        diameter_checks=d_checks, diameter_oos=d_oos, diameter_ok=d_checks - d_oos,
        transition_spools=t_spools, transition_weight=round(t_w, 2),
        qc_status=status,
        target_weight=tgt_w, weight_tol=wt_tol, target_dia=tgt_d, dia_tol=d_tol,
    ))

@app.route("/api/export/<d>")
def export_csv(d):
    conn = db(); c = conn.cursor()
    c.execute("SELECT * FROM days WHERE date=?", (d,))
    day = c.fetchone()
    day = dict(day) if day else dict(date=d, **DEFAULTS, planned_colors="")
    blocks = [dict(r) for r in c.execute("SELECT * FROM blocks WHERE day_id=(SELECT id FROM days WHERE date=?)", (d,))]
    weights = [dict(r) for r in c.execute("SELECT * FROM weight_logs WHERE day_id=(SELECT id FROM days WHERE date=?)", (d,))]
    diams = [dict(r) for r in c.execute("SELECT * FROM diameter_logs WHERE day_id=(SELECT id FROM days WHERE date=?)", (d,))]
    trans = [dict(r) for r in c.execute("SELECT * FROM transitions WHERE day_id=(SELECT id FROM days WHERE date=?)", (d,))]
    conn.close()
    import io, csv
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["LYNX AM Daily Production Log", d])
    w.writerow([])
    w.writerow(["Setup"])
    w.writerow(["Line", day.get("line")])
    w.writerow(["Material", day.get("material_default")])
    w.writerow(["Target spool weight (kg)", day.get("target_weight")])
    w.writerow(["Weight tol (+/- kg)", day.get("weight_tol")])
    w.writerow(["Target diameter (mm)", day.get("target_dia")])
    w.writerow(["Diameter tol (+/- mm)", day.get("dia_tol")])
    w.writerow(["Spools / hr", day.get("spools_per_hr")])
    w.writerow(["Planned colors", day.get("planned_colors", "")])
    w.writerow(["Batch IDs", day.get("batch_ids", "")])
    w.writerow([])
    w.writerow(["Production Blocks"])
    w.writerow(["Shift","Block","Color","Batch ID","Target kg","Actual kg","Operator","Notes"])
    for b in blocks:
        w.writerow([b["shift"], b["block_time"], b["color"], b["batch_id"], b["target_kg"], b["actual_kg"], b["operator"], b["notes"]])
    w.writerow([])
    w.writerow(["Hourly Weight Log"])
    w.writerow(["Hour","Time","Color","Batch ID","Reading kg","Operator"])
    for x in weights:
        w.writerow([x["hour"], x["time"], x["color"], x["batch_id"], x["reading_kg"], x.get("operator")])
    w.writerow([])
    w.writerow(["Hourly Diameter Log"])
    w.writerow(["Hour","Time","Color","Batch ID","Reading mm","Operator"])
    for x in diams:
        w.writerow([x["hour"], x["time"], x["color"], x["batch_id"], x["reading_mm"], x.get("operator")])
    w.writerow([])
    w.writerow(["Color Transitions"])
    w.writerow(["Time","From","To","Batch ID","Spools","Weight kg","Operator","Notes"])
    for t in trans:
        w.writerow([t["time"], t["from_color"], t["to_color"], t["batch_id"], t["spools"], t["weight_kg"], t["operator"], t["notes"]])
    return Response(buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=LYNX_REPORTS_{d}.csv"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
