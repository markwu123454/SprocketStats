import json
import random
from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import datetime

PY_TO_TS = {
    int: "number",
    float: "number",
    str: "string",
    bool: "boolean",
    type(None): "null",
}


def infer_types(value, *, pretty=False):
    """
    Print the type of a variable, still broken
    """
    counts = defaultdict(int)
    definitions = {}

    # store all object examples per fingerprint
    examples = defaultdict(list)

    # ---------- helpers ----------

    def is_record_like(obj):
        if len(obj) < 4:
            return False
        fps = {fingerprint(v) for v in obj.values()}
        return len(fps) == 1

    # ---------- fingerprint ----------

    def fingerprint(v, stack=None):
        if stack is None:
            stack = set()

        vid = id(v)
        if vid in stack:
            return ("recursive",)

        stack.add(vid)

        if v is None:
            fp = ("null",)

        elif type(v) in PY_TO_TS:
            fp = (PY_TO_TS[type(v)],)

        elif isinstance(v, Mapping):
            if is_record_like(v):
                value_fp = fingerprint(next(iter(v.values())), stack)
                fp = ("record", value_fp)
            else:
                fp = (
                    "object",
                    tuple(sorted(fingerprint(val, stack) for val in v.values()))
                )

        elif isinstance(v, Sequence) and not isinstance(v, (str, bytes)):
            fps = sorted({fingerprint(x, stack) for x in v})
            fp = ("array", tuple(fps))

        else:
            fp = ("any",)

        stack.remove(vid)
        if isinstance(v, Mapping):
            examples[fp].append(v)

        return fp

    # ---------- count pass ----------

    def count(v):
        fp = fingerprint(v)
        counts[fp] += 1

        if isinstance(v, Mapping):
            for val in v.values():
                count(val)
        elif isinstance(v, Sequence) and not isinstance(v, (str, bytes)):
            for x in v:
                count(x)

    # ---------- emit ----------

    def emit_fp(fp):
        if fp in definitions:
            return definitions[fp]

        kind = fp[0]

        if kind in {"string", "number", "boolean", "null"}:
            return kind

        if kind == "any":
            return "any"

        if kind == "array":
            inner = fp[1]
            if len(inner) == 1:
                return f"{emit_fp(inner[0])}[]"
            return f"({' | '.join(emit_fp(x) for x in inner)})[]"

        if kind == "record":
            return f"Record<string, {emit_fp(fp[1])}>"

        if kind == "object":
            objs = examples[fp]

            # collect all keys
            all_keys = set().union(*(o.keys() for o in objs))

            fields = []
            for key in sorted(all_keys):
                present = [o for o in objs if key in o]
                optional = len(present) < len(objs)

                val_fp = fingerprint(present[0][key]) if present else ("any",)
                ts_type = emit_fp(val_fp)

                opt = "?" if optional else ""
                fields.append(f"{key}{opt}: {ts_type};")

            return "{ " + " ".join(fields) + " }"

        return "any"

    def emit(v):
        fp = fingerprint(v)

        if counts[fp] > 1 and fp not in definitions:
            name = f"Type{len(definitions) + 1}"
            definitions[fp] = name
            definitions[name] = emit_fp(fp)
            return name

        if fp in definitions:
            return definitions[fp]

        return emit_fp(fp)

    def format_ts(ts: str, indent: int = 2) -> str:
        out = []
        level = 0
        i = 0

        while i < len(ts):
            ch = ts[i]

            if ch == "{":
                out.append("{\n")
                level += 1
                out.append(" " * (level * indent))
            elif ch == "}":
                out.append("\n")
                level -= 1
                out.append(" " * (level * indent))
                out.append("}")
            elif ch == ";":
                out.append(";\n")
                out.append(" " * (level * indent))
            else:
                out.append(ch)

            i += 1

        return "".join(out).strip()

    # ---------- run ----------

    count(value)
    main = emit(value)

    if pretty:
        main = format_ts(main)

    return definitions, main


def validate_match_scouting(downloaded_data):
    """
    Validates match scouting data.

    Checks per match:
    - 6 unique robots total
    - 2 alliances (red & blue)
    - 3 robots per alliance
    - unique scouter names

    Prints any detected issues.
    """
    match_entries = downloaded_data.get("match_scouting", [])

    # Group entries by match number
    matches = defaultdict(list)
    for entry in match_entries:
        matches[entry.get("match")].append(entry)

    for match_num in sorted(matches.keys()):
        entries = matches[match_num]

        teams = set()
        scouters = set()
        alliances = defaultdict(list)
        scouter_duplicates = set()

        for e in entries:
            team = e.get("team")
            alliance = e.get("alliance")
            scouter = e.get("scouter")

            if team:
                teams.add(team)
            if scouter:
                if scouter in scouters:
                    scouter_duplicates.add(scouter)
                scouters.add(scouter)
            if alliance:
                alliances[alliance].append(team)

        errors = []

        # 1. Check total unique robots
        if len(teams) != 6:
            errors.append(f"Expected 6 unique robots, found {len(teams)}: {sorted(teams)}")

        # 2. Check alliances
        expected_alliances = {"red", "blue"}
        found_alliances = set(alliances.keys())
        if found_alliances != expected_alliances:
            errors.append(f"Expected alliances {expected_alliances}, found {found_alliances}")

        # 3. Check robots per alliance
        for alliance in expected_alliances:
            count = len(set(alliances.get(alliance, [])))
            if count != 3:
                errors.append(f"{alliance} alliance has {count} robots (expected 3)")

        # 4. Check unique scouters
        if scouter_duplicates:
            errors.append(f"Duplicate scouters found: {sorted(scouter_duplicates)}")

        # Print results
        if errors:
            print(f"\nMatch {match_num} issues:")
            for err in errors:
                print(f"  - {err}")
        else:
            print(f"Match {match_num} passed all checks")


def counts_appearances(downloaded_data):
    """
    Lists how many times each scouter and each robot (team) appears
    in the match scouting data.
    """
    match_entries = downloaded_data.get("match_scouting", [])

    scouter_counts = defaultdict(int)
    robot_counts = defaultdict(int)

    for entry in match_entries:
        scouter = entry.get("scouter")
        team = entry.get("team")

        if scouter:
            scouter_counts[scouter] += 1
        if team:
            robot_counts[team] += 1

    # Print results sorted by count (most → least)
    print("\nScouter Appearance Counts:")
    for scouter, count in sorted(scouter_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  - {scouter}: {count}")

    print("\nRobot (Team) Appearance Counts:")
    for team, count in sorted(robot_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  - Team {team}: {count}")

SPECIAL_CHARS = "!@#$%^&*_-+=?"

def generate_password(team_number: int, team_name: str) -> str:
    # Split and scramble word order
    words = team_name.split()
    random.shuffle(words)
    base = "".join(words)

    chars = list(base)

    # Insert each digit of the team number at a random position
    for digit in str(team_number):
        pos = random.randrange(len(chars) + 1)
        chars.insert(pos, digit)

    # Insert exactly two special characters
    for _ in range(2):
        special = random.choice(SPECIAL_CHARS)
        pos = random.randrange(len(chars) + 1)
        chars.insert(pos, special)

    return "".join(chars)

async def generate_guest_profile():
    conn = get_connection()
    cursor = conn.cursor()

    with open("team_names.json", "r") as f:
        team_names = json.load(f)

    matches = await cursor.fetch("""
        SELECT match_type,
               match_number,
               red1, red2, red3,
               blue1, blue2, blue3
        FROM matches
        WHERE event_key = (
            SELECT current_event
            FROM metadata
            LIMIT 1
        );
    """)

    partner_data = {}

    for m in matches:
        match_key = f"{m['match_type']}{m['match_number']}"
        red = [m["red1"], m["red2"], m["red3"]]
        blue = [m["blue1"], m["blue2"], m["blue3"]]

        if 3473 in red:
            alliance = red
        elif 3473 in blue:
            alliance = blue
        else:
            continue

        for partner in alliance:
            if partner == 3473:
                continue

            entry = partner_data.setdefault(
                partner, {"teams": set(), "matches": set()}
            )

            entry["teams"].update(map(str, red + blue))
            entry["matches"].add(match_key)

    for partner, data in partner_data.items():
        team_name = team_names.get(str(partner), f"Team {partner}")
        password = generate_password(partner, team_name)

        permissions = {
            "team": sorted(data["teams"]),
            "match": sorted(data["matches"]),
            "ranking": False,
            "alliance": False
        }

        await cursor.execute("""
            INSERT INTO guests (password, name, permissions, expire_date)
            VALUES (%s, %s, %s::jsonb, %s);
        """, (
            password,
            team_name,
            json.dumps(permissions),
            datetime(2026, 6, 1)
        ))

    await conn.commit()
