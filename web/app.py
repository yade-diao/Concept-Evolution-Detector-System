"""
app.py – Flask web application for the CED-FS concept evolution detector.

Run with:
    python -m web.app          # or
    flask --app web.app run --port 8080 --debug
"""

import logging
import os
import sys
import tempfile
import threading
from datetime import datetime

import matplotlib
matplotlib.use("Agg")  # non-interactive backend

import numpy as np
from flask import (
    Flask, jsonify, request,
    send_from_directory, send_file,
)
from flask_cors import CORS
from scipy.io import loadmat

# ---------------------------------------------------------------------------
# Package path resolution (allows running as `python web/app.py` from root)
# ---------------------------------------------------------------------------
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from cedfs.algorithm.ced_fs import CED_FS
from cedfs.utils.normalize import min_max_normalize

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder="static")
# Allow the Vite dev server (port 5173) during development.
# In production the built files are served directly by Flask.
CORS(app, origins=["http://localhost:5173", "http://127.0.0.1:5173"])

# Path to the Vue production build entry-point
_DIST_DIR   = os.path.join(os.path.dirname(__file__), "static", "dist")
_DIST_INDEX = os.path.join(_DIST_DIR, "index.html")

IMAGE_FOLDER = os.path.join(os.path.dirname(__file__), "static", "images")
os.makedirs(IMAGE_FOLDER, exist_ok=True)

# ---------------------------------------------------------------------------
# In-memory state (single-user, non-persistent)
# ---------------------------------------------------------------------------
_EMPTY_STATE = {
    "status": "idle",          # idle | processing | completed | error
    "total_windows": 0,
    "windows_processed": 0,
    "cluster_nums": [],
    "ri_values": [],
    "events": {
        "emerging":   [],
        "drift":      [],
        "forgetting": [],
        "stable":     [],
    },
    "image_files": [],
    "last_update": None,
    "error": None,
}

_state = _EMPTY_STATE.copy()
_state_lock = threading.Lock()

_DEFAULT_PARAMS = {
    "kernelType": 1,
    "sigma": 6.0,
    "p": 0.05,
    "similarityThreshold": 0.5,
    "windowSize": 50,
    "chunkDelay": 500,
}

_current_params = _DEFAULT_PARAMS.copy()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _numpy_to_python(obj):
    """Recursively convert NumPy scalars / arrays to native Python types."""
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: _numpy_to_python(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_numpy_to_python(x) for x in obj]
    return obj


def _load_mat_auto(path: str) -> np.ndarray:
    """Load the first non-system variable from a .mat file as a 2-D array."""
    mat = loadmat(path, struct_as_record=False, squeeze_me=True)
    keys = [k for k in mat if not k.startswith("__")]
    if not keys:
        raise ValueError("No variables found in the .mat file.")
    arr = np.array(mat[keys[0]])
    if arr.ndim == 1:
        arr = arr.reshape(-1, 1)
    return arr


def _run_analysis_thread(data_with_labels, data_dim, window_length, params):
    """Background thread that runs the full CED-FS pipeline."""
    global _state

    def _on_progress(window_num, total):
        with _state_lock:
            _state["windows_processed"] = window_num
            _state["last_update"] = datetime.utcnow().isoformat()

    try:
        best_ri, events, cluster_nums, image_files = CED_FS(
            data_with_labels,
            d=data_dim,
            winsize=window_length,
            algorithm_params=params,
            image_dir=IMAGE_FOLDER,
            progress_callback=_on_progress,
        )
        with _state_lock:
            _state["status"] = "completed"
            _state["cluster_nums"] = _numpy_to_python(cluster_nums)
            _state["ri_values"].append(float(best_ri))
            _state["events"] = _numpy_to_python(events)
            _state["image_files"] = image_files
            _state["windows_processed"] = _state["total_windows"]
            _state["last_update"] = datetime.utcnow().isoformat()
    except Exception as exc:
        logger.exception("CED-FS analysis failed.")
        with _state_lock:
            _state["status"] = "error"
            _state["error"] = str(exc)
            _state["last_update"] = datetime.utcnow().isoformat()

# ---------------------------------------------------------------------------
# Routes – SPA pages
# All non-API routes return the Vue build's index.html so that
# vue-router can handle client-side navigation.
# ---------------------------------------------------------------------------

def _spa():
    """Serve the Vue production build entry-point."""
    if not os.path.exists(_DIST_INDEX):
        return (
            "<h2>Frontend not built.</h2>"
            "<p>Run <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code></p>",
            503,
        )
    return send_file(_DIST_INDEX)


@app.route("/")
@app.route("/parameters")
@app.route("/visualization")
@app.route("/help")
def spa_index():
    return _spa()


# Serve the rest of the Vue build's static assets (JS chunks, CSS, icons, …)
@app.route("/assets/<path:filename>")
def spa_assets(filename):
    return send_from_directory(os.path.join(_DIST_DIR, "assets"), filename)


@app.route("/static/images/<path:filename>")
def serve_image(filename):
    return send_from_directory(IMAGE_FOLDER, filename)

# ---------------------------------------------------------------------------
# Routes – API
# ---------------------------------------------------------------------------

@app.route("/api/status")
def api_status():
    """Return a JSON snapshot of the current analysis state."""
    with _state_lock:
        payload = _numpy_to_python(dict(_state))
    return jsonify(payload)


@app.route("/api/parameters", methods=["GET"])
def api_get_parameters():
    return jsonify(_current_params)


@app.route("/api/parameters", methods=["POST"])
def api_save_parameters():
    global _current_params
    data = request.get_json(force=True) or {}
    errors = []

    if "sigma" in data:
        v = float(data["sigma"])
        if not (0.1 <= v <= 50):
            errors.append("sigma must be in [0.1, 50].")
    if "p" in data:
        v = float(data["p"])
        if not (0.001 <= v <= 0.5):
            errors.append("p must be in [0.001, 0.5].")
    if "similarityThreshold" in data:
        v = float(data["similarityThreshold"])
        if not (0.0 < v < 1.0):
            errors.append("similarityThreshold must be in (0, 1).")
    if errors:
        return jsonify({"success": False, "errors": errors}), 400

    for key, value in data.items():
        if key in _DEFAULT_PARAMS:
            _current_params[key] = value
    logger.info("Parameters updated: %s", _current_params)
    return jsonify({"success": True, "parameters": _current_params})


@app.route("/api/parameters/reset", methods=["POST"])
def api_reset_parameters():
    global _current_params
    _current_params = _DEFAULT_PARAMS.copy()
    return jsonify({"success": True, "parameters": _current_params})


@app.route("/api/run", methods=["POST"])
def api_run():
    """Upload data and label .mat files, then start a background CED-FS run."""
    global _state

    if "data_file" not in request.files or "label_file" not in request.files:
        return jsonify({"error": "Both 'data_file' and 'label_file' must be provided."}), 400

    window_length = int(request.form.get("window_length", _current_params["windowSize"]))

    tmp_data = tmp_label = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mat", delete=False) as f:
            request.files["data_file"].save(f)
            tmp_data = f.name
        with tempfile.NamedTemporaryFile(suffix=".mat", delete=False) as f:
            request.files["label_file"].save(f)
            tmp_label = f.name

        data   = _load_mat_auto(tmp_data)
        labels = _load_mat_auto(tmp_label)

        # Align shapes
        if data.shape[0] != labels.shape[0]:
            if data.shape[1] == labels.shape[0]:
                data = data.T
            elif data.shape[0] == labels.shape[1]:
                labels = labels.T
            else:
                n = min(data.shape[0], labels.shape[0])
                data, labels = data[:n], labels[:n]

        # Normalise features
        data_dim = data.shape[1]
        data = min_max_normalize(data.copy())

        # Combine features + labels
        combined = np.hstack((data, labels[:, :1]))

        n_windows = max(1, round(data_dim / window_length))

    except Exception as exc:
        logger.exception("Failed to load data.")
        return jsonify({"error": str(exc)}), 400
    finally:
        for p in (tmp_data, tmp_label):
            if p and os.path.exists(p):
                os.remove(p)

    # Clear old images
    for fname in os.listdir(IMAGE_FOLDER):
        fpath = os.path.join(IMAGE_FOLDER, fname)
        if os.path.isfile(fpath):
            try:
                os.remove(fpath)
            except OSError:
                pass

    with _state_lock:
        _state = {**_EMPTY_STATE.copy(), "status": "processing",
                  "total_windows": n_windows,
                  "last_update": datetime.utcnow().isoformat()}

    thread = threading.Thread(
        target=_run_analysis_thread,
        args=(combined, data_dim, window_length, dict(_current_params)),
        daemon=True,
    )
    thread.start()

    return jsonify({
        "status": "processing",
        "total_windows": n_windows,
        "message": f"Analysis started with {n_windows} windows.",
    })


@app.route("/api/clear", methods=["POST"])
def api_clear():
    global _state
    with _state_lock:
        _state = _EMPTY_STATE.copy()

    for fname in os.listdir(IMAGE_FOLDER):
        fpath = os.path.join(IMAGE_FOLDER, fname)
        if os.path.isfile(fpath):
            try:
                os.remove(fpath)
            except OSError:
                pass

    return jsonify({"message": "Cleared."})


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    debug = os.getenv("FLASK_ENV", "production") == "development"
    app.run(host="0.0.0.0", port=8080, debug=debug)
