"""Watch a fleet from a CSV file, window by window.

    python -m cedfs.monitor fleet.csv --unit engine --time cycle --window 10

The file is in long format: one row per unit per time step, a column naming
the unit, a column ordering time, and one column per variable. Every unit must
have the same time steps (a feature stream has a fixed set of objects); the
longest common prefix is used if they do not. Columns other than the unit and
time ones are variables, unless `--variables` lists which to use.

Two monitors run (docs/INDUSTRIAL.md explains when each is the right one):

* clustering — `cedfs.fleet.monitor`, screened, clustered on summaries: per
  window, whether the fleet is one group or has split, the events between
  windows (CED-FS's and MONIC's names for them), which units left the largest
  group and through which variables;
* deviation — `cedfs.fleet.deviation` + `accumulate`: which units have been
  consistently unlike the fleet over the last `--m` windows, each measured
  against its own first `--baseline` time steps.

Output is a readable report, or JSON lines with `--json` (one object per
window) for another program to consume.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

from cedfs.fleet import accumulate, deviation, monitor
from cedfs.transitions import boundary_transitions


def read_fleet(path: Path, unit: str, time: str, variables: list[str] | None = None,
               delimiter: str | None = None):
    """Long-format table -> (units array (U, T, V), unit ids, time values, variable names)."""
    with open(path, newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=delimiter or ",;\t ")
        rows = list(csv.DictReader(f, dialect=dialect, skipinitialspace=True))
    if not rows:
        raise ValueError(f"{path} has no rows")
    header = [h for h in rows[0] if h]
    for name in (unit, time):
        if name not in header:
            raise ValueError(f"column {name!r} not in {header}")
    names = variables or [h for h in header if h not in (unit, time)]
    by_unit: dict[str, list[tuple[float, list[float]]]] = {}
    for r in rows:
        by_unit.setdefault(r[unit], []).append((float(r[time]), [float(r[v]) for v in names]))
    ids = sorted(by_unit, key=lambda u: (len(u), u))
    for u in ids:
        by_unit[u].sort(key=lambda tv: tv[0])
    horizon = min(len(by_unit[u]) for u in ids)
    cube = np.array([[v for _, v in by_unit[u][:horizon]] for u in ids], dtype=float)
    times = [t for t, _ in by_unit[ids[0]][:horizon]]
    return cube, ids, times, names


def report(cube, ids, times, names, window, alpha=0.001, baseline=None, m=5, level=0.01):
    """One dict per window: what each monitor says about it."""
    watched = monitor(cube, window, screen_alpha=alpha, represent="summaries")
    monic = boundary_transitions(watched.clusterings)
    alarms = None
    if baseline is not None:
        alarms = accumulate(deviation(cube, window, baseline), m, level)
    out = []
    for w, labels in enumerate(watched.clusterings):
        start, end = w * window, (w + 1) * window - 1
        groups = [sorted(ids[i] for i in np.flatnonzero(labels == g)) for g in np.unique(labels)]
        entry = {
            "window": w + 1, "from": times[start], "to": times[end],
            "groups": len(groups),
            "group_sizes": sorted((len(g) for g in groups), reverse=True),
            "left_the_fleet": [ids[i] for i in np.flatnonzero(watched.flags[:, w])],
            "through": [names[v] for v in watched.variables[w]],
        }
        if w > 0:
            entry["events"] = watched.events[w - 1]
            entry["transitions"] = {k: v for k, v in monic[w - 1].items() if v}
        if alarms is not None:
            entry["deviating"] = [ids[i] for i in np.flatnonzero(alarms[:, w])]
        out.append(entry)
    return out


def _print(entries, out=sys.stdout):
    for e in entries:
        head = f"window {e['window']:>3}  [{e['from']:g} .. {e['to']:g}]  "
        if e["groups"] == 1:
            line = head + "one group"
        else:
            line = (head + f"{e['groups']} groups {e['group_sizes']}; left: "
                    + ", ".join(map(str, e["left_the_fleet"][:12]))
                    + (" ..." if len(e["left_the_fleet"]) > 12 else "")
                    + f"  through {', '.join(e['through'][:6])}")
        if e.get("transitions") and set(e["transitions"]) != {"survive"}:
            line += "  | " + " ".join(f"{k} {v}" for k, v in e["transitions"].items())
        if e.get("deviating"):
            line += "  | deviating: " + ", ".join(map(str, e["deviating"][:12]))
        print(line, file=out)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0],
                                     formatter_class=argparse.RawDescriptionHelpFormatter,
                                     epilog=__doc__.split("\n\n", 1)[1])
    parser.add_argument("csv", type=Path)
    parser.add_argument("--unit", required=True, help="column naming the unit")
    parser.add_argument("--time", required=True, help="column ordering time")
    parser.add_argument("--variables", nargs="+", help="variable columns (default: all others)")
    parser.add_argument("--window", type=int, required=True, help="time steps per window")
    parser.add_argument("--alpha", type=float, default=0.001, help="screening level per window")
    parser.add_argument("--baseline", type=int,
                        help="time steps of each unit's own start for the deviation monitor "
                             "(omit to run the clustering monitor only)")
    parser.add_argument("--m", type=int, default=5, help="windows a deviation must persist over")
    parser.add_argument("--level", type=float, default=0.01)
    parser.add_argument("--delimiter")
    parser.add_argument("--json", action="store_true", help="JSON lines, one per window")
    args = parser.parse_args(argv)

    cube, ids, times, names = read_fleet(args.csv, args.unit, args.time, args.variables,
                                         args.delimiter)
    entries = report(cube, ids, times, names, args.window, args.alpha, args.baseline,
                     args.m, args.level)
    if args.json:
        for e in entries:
            print(json.dumps(e, default=str))
    else:
        print(f"{len(ids)} units, {len(times)} time steps, {len(names)} variables, "
              f"window {args.window}")
        _print(entries)
    return 0


if __name__ == "__main__":
    sys.exit(main())
