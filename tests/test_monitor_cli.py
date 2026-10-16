"""python -m cedfs.monitor on a small long-format file."""

import json

import numpy as np

from cedfs.monitor import main, read_fleet


def _write(tmp_path, shift_from=20):
    rng = np.random.default_rng(3)
    units, steps = 40, 40
    x = rng.standard_normal((units, steps, 4))
    x[:8, shift_from:, 2] += 3.0                 # units 0-7 leave through variable c
    path = tmp_path / "fleet.csv"
    with open(path, "w") as f:
        f.write("unit,t,a,b,c,d\n")
        for u in range(units):
            for t in range(steps):
                f.write(f"m{u},{t}," + ",".join(f"{v:.5f}" for v in x[u, t]) + "\n")
    return path


def test_read_fleet_returns_a_cube_in_unit_and_time_order(tmp_path):
    cube, ids, times, names = read_fleet(_write(tmp_path), "unit", "t")
    assert cube.shape == (40, 40, 4) and names == ["a", "b", "c", "d"]
    assert ids[:3] == ["m0", "m1", "m2"] and times[:3] == [0.0, 1.0, 2.0]


def test_cli_reports_who_left_and_through_what(tmp_path, capsys):
    assert main([str(_write(tmp_path)), "--unit", "unit", "--time", "t",
                 "--window", "10", "--json"]) == 0
    windows = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert [w["groups"] for w in windows[:2]] == [1, 1]
    assert windows[2]["groups"] == 2 and windows[2]["through"] == ["c"]
    assert sorted(windows[2]["left_the_fleet"]) == sorted(f"m{u}" for u in range(8))
    assert windows[2]["transitions"].get("emerge") == 1
