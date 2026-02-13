"""
FRC Match Score Tracker via OCR on YouTube Livestreams — Library Version

This module exposes the full functionality of the FRC score tracker as a
Python library so it can be imported and driven from another script instead
of (or in addition to) the CLI.

Quick-start
-----------
    from frc_score_tracker_lib import FRCScoreTracker, ScoreRegionConfig

    tracker = FRCScoreTracker(
        url="https://www.youtube.com/watch?v=XXXXX",
        interval=1.0,
        batch_size=64,
    )
    result = tracker.run()
    print(result.scoring_moments)

With pre-calibrated regions
---------------------------
    config = ScoreRegionConfig(
        red_x1=0.528, red_y1=0.058, red_x2=0.595, red_y2=0.117,
        blue_x1=0.409, blue_y1=0.058, blue_x2=0.472, blue_y2=0.119,
        timer_x1=0.466, timer_y1=0.056, timer_x2=0.534, timer_y2=0.114,
    )
    tracker = FRCScoreTracker(file="match.mp4", config=config)
    result = tracker.run()

With cookies for authenticated YouTube access
----------------------------------------------
    tracker = FRCScoreTracker(
        url="https://www.youtube.com/watch?v=XXXXX",
        cookies="/path/to/cookies.txt",       # Netscape-format cookie file
        # OR
        cookies_from_browser="firefox",       # auto-extract from browser
    )
    result = tracker.run()

Calibration (interactive)
-------------------------
    FRCScoreTracker.calibrate("match.mp4")
    # Opens an OpenCV window; prints ScoreRegionConfig when done.
"""

from __future__ import annotations

import argparse
import csv
import subprocess
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any

import cv2
import numpy as np
from PIL import Image

# ──────────────────────────────────────────────────────────────
# Dependency checks
# ──────────────────────────────────────────────────────────────

TESSERACT_AVAILABLE = False
try:
    import pytesseract
    try:
        pytesseract.get_tesseract_version()
        TESSERACT_AVAILABLE = True
    except Exception:
        pass
except ImportError:
    pass

GPU_AVAILABLE = False
GPU_TYPE: Optional[str] = None


def check_gpu_support(quiet: bool = False) -> bool:
    """Check for AMD GPU (OpenCL) or NVIDIA GPU (CUDA) support."""
    global GPU_AVAILABLE, GPU_TYPE

    if cv2.ocl.haveOpenCL():
        cv2.ocl.setUseOpenCL(True)
        if cv2.ocl.useOpenCL():
            GPU_AVAILABLE = True
            GPU_TYPE = "OpenCL (AMD/Intel)"
            if not quiet:
                print(f" GPU Acceleration enabled: {GPU_TYPE}")
                try:
                    device = cv2.ocl.Device.getDefault()
                    print(f"  Device: {device.name()}")
                    print(f"  Global Memory: {device.globalMemSize() / (1024**3):.1f} GB")
                    print(f"  Max Alloc Size: {device.maxMemAllocSize() / (1024**3):.1f} GB")
                except Exception:
                    pass
            return True

    try:
        if cv2.cuda.getCudaEnabledDeviceCount() > 0:
            GPU_AVAILABLE = True
            GPU_TYPE = "CUDA (NVIDIA)"
            if not quiet:
                print(f" GPU Acceleration enabled: {GPU_TYPE}")
                try:
                    cv2.cuda.setBufferPoolUsage(True)
                    cv2.cuda.setBufferPoolConfig(cv2.cuda.getDevice(), 1024 * 1024 * 1024, 2)
                except Exception:
                    pass
            return True
    except Exception:
        pass

    if not quiet:
        print(" No GPU acceleration available — using CPU")
    return False


# ──────────────────────────────────────────────────────────────
# Configuration / data classes
# ──────────────────────────────────────────────────────────────

MATCH_AUTO_DURATION = 15
MATCH_TRANSITION_DURATION = 3
MATCH_TELEOP_DURATION = 135
MATCH_TOTAL_DURATION = MATCH_AUTO_DURATION + MATCH_TRANSITION_DURATION + MATCH_TELEOP_DURATION

INITIAL_SAMPLE_INTERVAL = 5.0
MATCH_START_SEARCH_WINDOW = 30.0
FRAME_PRECISION_SEARCH = 0.1


@dataclass
class ScoreRegionConfig:
    """Score overlay region configuration (normalised 0-1 coordinates)."""
    red_x1: float = 0.528
    red_y1: float = 0.058
    red_x2: float = 0.595
    red_y2: float = 0.117

    blue_x1: float = 0.409
    blue_y1: float = 0.058
    blue_x2: float = 0.472
    blue_y2: float = 0.119

    timer_x1: float = 0.466
    timer_y1: float = 0.056
    timer_x2: float = 0.534
    timer_y2: float = 0.114

    def to_dict(self) -> Dict[str, float]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, float]) -> "ScoreRegionConfig":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class ScoreEvent:
    """A single score reading at a point in time."""
    timestamp: float
    red_score: Optional[int]
    blue_score: Optional[int]
    match_time: Optional[str] = None
    match_phase: Optional[str] = None


@dataclass
class ScoringMoment:
    """A detected change in score."""
    timestamp: float
    alliance: str
    points_gained: int
    new_total: int
    match_time: Optional[str] = None
    match_phase: Optional[str] = None


@dataclass
class MatchBoundaries:
    """Detected match start/end times in video."""
    match_start: float
    auto_end: float
    teleop_start: float
    teleop_end: float


@dataclass
class TrackingResult:
    """Complete result returned by FRCScoreTracker.run()."""
    readings: List[ScoreEvent]
    scoring_moments: List[ScoringMoment]
    boundaries: Optional[MatchBoundaries]
    ocr_attempts: int
    ocr_successes: int
    ocr_failures: int
    elapsed_seconds: float
    frames_processed: int

    # Convenience helpers ─────────────────────────────────────
    @property
    def final_red(self) -> Optional[int]:
        red = [r.red_score for r in self.readings if r.red_score is not None]
        return red[-1] if red else None

    @property
    def final_blue(self) -> Optional[int]:
        blue = [r.blue_score for r in self.readings if r.blue_score is not None]
        return blue[-1] if blue else None

    @property
    def ocr_success_rate(self) -> float:
        return (self.ocr_successes / self.ocr_attempts * 100) if self.ocr_attempts else 0.0

    def export_events_csv(self, path: str) -> None:
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["video_timestamp_s", "match_time", "match_phase",
                        "alliance", "points_gained", "new_total"])
            for m in self.scoring_moments:
                w.writerow([f"{m.timestamp:.1f}", m.match_time or "",
                            m.match_phase or "", m.alliance, m.points_gained, m.new_total])

    def export_readings_csv(self, path: str) -> None:
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["video_timestamp_s", "match_time", "match_phase",
                        "red_score", "blue_score"])
            for r in self.readings:
                w.writerow([f"{r.timestamp:.1f}", r.match_time or "",
                            r.match_phase or "",
                            r.red_score if r.red_score is not None else "",
                            r.blue_score if r.blue_score is not None else ""])


# ──────────────────────────────────────────────────────────────
# GPU-Accelerated Image Processing
# ──────────────────────────────────────────────────────────────

class GPUImageProcessor:
    """GPU-accelerated image preprocessing pipeline."""

    def __init__(self, use_gpu: bool = True):
        self.use_gpu = use_gpu and GPU_AVAILABLE

    def preprocess_batch(self, rois: List[np.ndarray],
                         strategy: str = "default") -> List[np.ndarray]:
        if not rois:
            return []
        if self.use_gpu and GPU_TYPE == "OpenCL (AMD/Intel)":
            return self._preprocess_batch_opencl(rois, strategy)
        return [self._preprocess_single(roi, strategy) for roi in rois]

    # ── OpenCL batch path ────────────────────────────────────
    def _preprocess_batch_opencl(self, rois: List[np.ndarray],
                                 strategy: str) -> List[np.ndarray]:
        results = []
        for roi in rois:
            gpu_roi = cv2.UMat(roi)
            h, w = gpu_roi.get().shape[:2]
            mx = max(2, int(w * 0.1))
            my = max(1, int(h * 0.1))
            gpu_roi = cv2.UMat(gpu_roi.get()[my:h - my, mx:w - mx])

            scale = 4
            gpu_roi = cv2.resize(gpu_roi, None, fx=scale, fy=scale,
                                 interpolation=cv2.INTER_CUBIC)

            gray = cv2.cvtColor(gpu_roi, cv2.COLOR_BGR2GRAY)

            if strategy == "adaptive":
                thresh = cv2.adaptiveThreshold(
                    gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY, 11, 2)
            else:
                _, thresh = cv2.threshold(gray, 0, 255,
                                          cv2.THRESH_BINARY + cv2.THRESH_OTSU)

            thresh_cpu = thresh.get()
            if np.mean(thresh_cpu) < 127:
                thresh_cpu = cv2.bitwise_not(thresh_cpu)

            if strategy == "morphology":
                kernel = np.ones((2, 2), np.uint8)
                thresh_cpu = cv2.morphologyEx(cv2.UMat(thresh_cpu),
                                              cv2.MORPH_OPEN, cv2.UMat(kernel)).get()
                thresh_cpu = cv2.morphologyEx(cv2.UMat(thresh_cpu),
                                              cv2.MORPH_CLOSE, cv2.UMat(kernel)).get()

            pad = 20
            thresh_cpu = cv2.copyMakeBorder(thresh_cpu, pad, pad, pad, pad,
                                            cv2.BORDER_CONSTANT, value=255)
            results.append(thresh_cpu)
        return results

    # ── CPU fallback ─────────────────────────────────────────
    def _preprocess_single(self, roi: np.ndarray, strategy: str) -> np.ndarray:
        h, w = roi.shape[:2]
        mx = max(2, int(w * 0.1))
        my = max(1, int(h * 0.1))
        roi = roi[my:h - my, mx:w - mx]

        roi = cv2.resize(roi, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if len(roi.shape) == 3 else roi
        _, thresh = cv2.threshold(gray, 0, 255,
                                  cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if np.mean(thresh) < 127:
            thresh = cv2.bitwise_not(thresh)
        if strategy == "morphology":
            k = np.ones((2, 2), np.uint8)
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, k)
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, k)
        return cv2.copyMakeBorder(thresh, 20, 20, 20, 20,
                                  cv2.BORDER_CONSTANT, value=255)


# ──────────────────────────────────────────────────────────────
# Optimised Video Reader
# ──────────────────────────────────────────────────────────────

class OptimizedVideoReader:
    def __init__(self, source: str, cache_size: int = 500):
        self.source = source
        self.cache_size = cache_size
        self._frame_cache: Dict[int, np.ndarray] = {}
        self._cache_lock = threading.Lock()
        self._last_frame_num = -1

        self.cap = self._open(source)
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    @staticmethod
    def _open(source: str) -> cv2.VideoCapture:
        for backend, _ in [(cv2.CAP_FFMPEG, "FFMPEG"), (cv2.CAP_ANY, "ANY")]:
            cap = cv2.VideoCapture(source, backend)
            if cap.isOpened():
                return cap
        return cv2.VideoCapture(source)

    def get_frame(self, timestamp: float) -> Optional[np.ndarray]:
        fn = int(timestamp * self.fps)
        with self._cache_lock:
            if fn in self._frame_cache:
                self._last_frame_num = fn
                return self._frame_cache[fn].copy()
        if fn != self._last_frame_num + 1:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, fn)
        ret, frame = self.cap.read()
        self._last_frame_num = fn
        if not ret:
            return None
        with self._cache_lock:
            self._frame_cache[fn] = frame.copy()
            if len(self._frame_cache) > self.cache_size:
                to_remove = [k for k in self._frame_cache
                             if abs(k - fn) > self.cache_size // 2][:len(self._frame_cache) // 4]
                for k in to_remove:
                    del self._frame_cache[k]
        return frame

    def get_frames_batch(self, timestamps: List[float]) -> List[Tuple[float, np.ndarray]]:
        results = []
        for ts in sorted(timestamps):
            frame = self.get_frame(ts)
            if frame is not None:
                results.append((ts, frame))
        return results

    def release(self):
        self.cap.release()
        self._frame_cache.clear()


# ──────────────────────────────────────────────────────────────
# Batch OCR Processor
# ──────────────────────────────────────────────────────────────

class BatchOCRProcessor:
    def __init__(self, max_workers: int = 8, verbose: bool = False):
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.verbose = verbose

    def process_batch(self, rois: List[np.ndarray],
                      labels: List[str]) -> List[Optional[int]]:
        if not TESSERACT_AVAILABLE:
            return [None] * len(rois)
        futures = [self.executor.submit(self._extract_number, roi, lbl)
                   for roi, lbl in zip(rois, labels)]
        return [f.result() for f in futures]

    def _extract_number(self, roi: np.ndarray, label: str) -> Optional[int]:
        strategies = ["default", "adaptive", "morphology"]
        all_results: List[int] = []
        gpu_proc = GPUImageProcessor(use_gpu=GPU_AVAILABLE)

        for strategy in strategies:
            processed = gpu_proc._preprocess_single(roi, strategy)
            for psm in [8, 7, 13]:
                cfg = f'--oem 3 --psm {psm} -c tessedit_char_whitelist=0123456789'
                try:
                    text = pytesseract.image_to_string(
                        Image.fromarray(processed), config=cfg).strip()
                    if text.isdigit():
                        value = int(text)
                        if 0 <= value <= 300:
                            all_results.append(value)
                        elif "0" in text:
                            for i, ch in enumerate(text):
                                if ch == "0":
                                    nt = text[:i] + text[i + 1:]
                                    if nt and nt.isdigit() and 0 <= int(nt) <= 300:
                                        all_results.append(int(nt))
                                        break
                except Exception:
                    pass

        if all_results:
            return Counter(all_results).most_common(1)[0][0]
        return None

    def shutdown(self):
        self.executor.shutdown(wait=True)


# ──────────────────────────────────────────────────────────────
# Template Matching OCR (fallback)
# ──────────────────────────────────────────────────────────────

class TemplateMatchingOCR:
    def __init__(self, template_dir: str = "digit_templates"):
        self.templates: Dict[int, np.ndarray] = {}
        td = Path(template_dir)
        if td.exists():
            for digit in range(10):
                p = td / f"{digit}.png"
                if p.exists():
                    self.templates[digit] = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)

    def extract_number(self, roi: np.ndarray) -> Optional[int]:
        if not self.templates:
            return None
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if len(roi.shape) == 3 else roi
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if np.mean(thresh) < 127:
            thresh = cv2.bitwise_not(thresh)
        best, best_score = None, 0.0
        for num in range(301):
            ns = str(num)
            if not all(int(d) in self.templates for d in ns):
                continue
            imgs = [self.templates[int(d)] for d in ns]
            combined = np.hstack(imgs) if len(imgs) > 1 else imgs[0]
            if combined.shape[0] <= 0:
                continue
            scale = thresh.shape[0] / combined.shape[0]
            nw, nh = int(combined.shape[1] * scale), thresh.shape[0]
            if nw <= 0 or nh <= 0:
                continue
            resized = cv2.resize(combined, (nw, nh))
            if resized.shape[1] > thresh.shape[1] or resized.shape[0] > thresh.shape[0]:
                continue
            _, mx, _, _ = cv2.minMaxLoc(cv2.matchTemplate(thresh, resized, cv2.TM_CCOEFF_NORMED))
            if mx > best_score:
                best_score, best = mx, num
        return best if best is not None and best_score > 0.7 else None


# ──────────────────────────────────────────────────────────────
# Internal Score Tracker
# ──────────────────────────────────────────────────────────────

class _ScoreTracker:
    def __init__(self, config: ScoreRegionConfig, *,
                 debug: bool = False, batch_size: int = 64,
                 use_gpu: bool = True, verbose: bool = False):
        self.config = config
        self._debug = debug
        self._verbose = verbose
        self.readings: List[ScoreEvent] = []
        self.scoring_moments: List[ScoringMoment] = []
        self.last_red: Optional[int] = None
        self.last_blue: Optional[int] = None
        self.match_phase: Optional[str] = None
        self.match_active: bool = False

        self.gpu_processor = GPUImageProcessor(use_gpu=use_gpu)
        self.batch_size = batch_size
        self.ocr_processor = BatchOCRProcessor(max_workers=8, verbose=verbose)
        self.template_ocr = TemplateMatchingOCR() if not TESSERACT_AVAILABLE else None

        self.ocr_attempts = 0
        self.ocr_successes = 0
        self.ocr_failures = 0

    # ── helpers ──────────────────────────────────────────────
    @staticmethod
    def parse_timer(timer_str: Optional[str]) -> Optional[float]:
        if not timer_str or ":" not in timer_str:
            return None
        try:
            parts = timer_str.split(":")
            return int(parts[0]) * 60 + int(parts[1])
        except (ValueError, IndexError):
            return None

    @staticmethod
    def determine_phase_from_timer(timer_str: Optional[str]) -> Optional[str]:
        secs = _ScoreTracker.parse_timer(timer_str)
        if secs is None:
            return None
        if secs > MATCH_AUTO_DURATION:
            return "teleop"
        if secs > 0:
            return "auto"
        return None

    @staticmethod
    def get_roi(frame: np.ndarray, x1: float, y1: float,
                x2: float, y2: float) -> np.ndarray:
        h, w = frame.shape[:2]
        return frame[int(y1 * h):int(y2 * h), int(x1 * w):int(x2 * w)]

    # ── batch processing ─────────────────────────────────────
    def process_frames_batch(self, frames_data: List[Tuple[float, np.ndarray, str]]) -> List[ScoreEvent]:
        if not frames_data:
            return []
        cfg = self.config

        red_rois = [self.get_roi(f, cfg.red_x1, cfg.red_y1, cfg.red_x2, cfg.red_y2)
                    for _, f, _ in frames_data]
        blue_rois = [self.get_roi(f, cfg.blue_x1, cfg.blue_y1, cfg.blue_x2, cfg.blue_y2)
                     for _, f, _ in frames_data]
        timer_rois = [self.get_roi(f, cfg.timer_x1, cfg.timer_y1, cfg.timer_x2, cfg.timer_y2)
                      for _, f, _ in frames_data]

        red_processed = self.gpu_processor.preprocess_batch(red_rois)
        blue_processed = self.gpu_processor.preprocess_batch(blue_rois)
        timer_processed = self.gpu_processor.preprocess_batch(timer_rois)

        red_scores = self.ocr_processor.process_batch(
            red_processed, [f"RED_{i}" for i in range(len(red_rois))])
        blue_scores = self.ocr_processor.process_batch(
            blue_processed, [f"BLUE_{i}" for i in range(len(blue_rois))])

        for s in red_scores + blue_scores:
            self.ocr_attempts += 1
            if s is not None:
                self.ocr_successes += 1
            else:
                self.ocr_failures += 1

        match_times: List[Optional[str]] = []
        for troi in timer_processed:
            if TESSERACT_AVAILABLE:
                try:
                    text = pytesseract.image_to_string(
                        Image.fromarray(troi),
                        config=r'--oem 3 --psm 7 -c tessedit_char_whitelist=0123456789:'
                    ).strip()
                    match_times.append(text if ":" in text else None)
                except Exception:
                    match_times.append(None)
            else:
                match_times.append(None)

        events: List[ScoreEvent] = []
        for i, (ts, _frame, phase) in enumerate(frames_data):
            rs, bs, mt = red_scores[i], blue_scores[i], match_times[i]
            if phase is not None:
                if rs is None and self.last_red is not None:
                    rs = self.last_red
                if bs is None and self.last_blue is not None:
                    bs = self.last_blue
            if phase is None:
                phase = self.determine_phase_from_timer(mt)
            ev = ScoreEvent(timestamp=ts, red_score=rs, blue_score=bs,
                            match_time=mt, match_phase=phase)
            self.readings.append(ev)
            self._detect_scoring(ev)
            events.append(ev)
        return events

    def _detect_scoring(self, event: ScoreEvent):
        max_plausible, max_jump = 300, 30
        for alliance, score_attr in [("red", "red_score"), ("blue", "blue_score")]:
            score = getattr(event, score_attr)
            last = self.last_red if alliance == "red" else self.last_blue
            if score is None:
                continue
            if score > max_plausible:
                setattr(event, score_attr, None)
                continue
            if last is not None:
                diff = score - last
                if diff > max_jump:
                    fixed = False
                    s = str(score)
                    if "0" in s:
                        for i, ch in enumerate(s):
                            if ch == "0":
                                ns = s[:i] + s[i + 1:]
                                if ns:
                                    nv = int(ns)
                                    if 0 <= nv - last <= max_jump and 0 <= nv <= max_plausible:
                                        score = nv
                                        setattr(event, score_attr, nv)
                                        fixed = True
                                        break
                    if not fixed:
                        setattr(event, score_attr, None)
                        continue
                if diff < -20:
                    setattr(event, score_attr, None)
                    continue

        # Record scoring events
        for alliance, score_attr in [("red", "red_score"), ("blue", "blue_score")]:
            score = getattr(event, score_attr)
            last = self.last_red if alliance == "red" else self.last_blue
            if score is not None and last is not None and score != last:
                self.scoring_moments.append(ScoringMoment(
                    timestamp=event.timestamp, alliance=alliance,
                    points_gained=score - last, new_total=score,
                    match_time=event.match_time, match_phase=event.match_phase))

        if event.red_score is not None:
            self.last_red = event.red_score
        if event.blue_score is not None:
            self.last_blue = event.blue_score

    def shutdown(self):
        self.ocr_processor.shutdown()


# ──────────────────────────────────────────────────────────────
# Video source helpers
# ──────────────────────────────────────────────────────────────

def _resolve_stream_url(youtube_url: str, *,
                        cookies: Optional[str] = None,
                        cookies_from_browser: Optional[str] = None,
                        quiet: bool = False) -> str:
    """Use yt-dlp to get a direct stream URL, with optional cookie support."""
    if not quiet:
        print("🔗 Resolving stream URL…")

    cmd: List[str] = [
        "yt-dlp",
        "-f", "best[height>=720]/best",
        "-g",
    ]
    if cookies:
        cmd.extend(["--cookies", cookies])
    if cookies_from_browser:
        cmd.extend(["--cookies-from-browser", cookies_from_browser])
    cmd.append(youtube_url)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        url = result.stdout.strip()
        if not quiet:
            print(" Got stream URL")
        return url
    except FileNotFoundError:
        raise RuntimeError("yt-dlp not found. Install it: pip install yt-dlp")
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"yt-dlp failed: {e.stderr}")


def _find_match_start(source: str, config: ScoreRegionConfig, *,
                      use_gpu: bool = True, debug: bool = False,
                      quiet: bool = False) -> Optional[float]:
    reader = OptimizedVideoReader(source)
    duration = reader.total_frames / reader.fps if reader.total_frames > 0 else 180

    if not quiet:
        print(f"\n Phase 1: Finding match in video…")
        print(f"Video duration: ~{duration:.0f}s ({reader.total_frames} frames @ {reader.fps:.1f} fps)")

    tracker = _ScoreTracker(config, debug=debug, use_gpu=use_gpu)
    middle = duration / 2
    search_start = max(0, middle - 30)
    search_end = min(duration, middle + 30)

    if not quiet:
        print(f"Searching for timer around middle ({middle:.0f}s ± 30s)…")

    found_time: Optional[float] = None
    found_value: Optional[float] = None
    t = search_start

    while t <= search_end:
        frame = reader.get_frame(t)
        if frame is None:
            t += INITIAL_SAMPLE_INTERVAL
            continue
        troi = tracker.get_roi(frame, config.timer_x1, config.timer_y1,
                               config.timer_x2, config.timer_y2)
        if TESSERACT_AVAILABLE:
            processed = tracker.gpu_processor._preprocess_single(troi, "default")
            try:
                text = pytesseract.image_to_string(
                    Image.fromarray(processed),
                    config=r'--oem 3 --psm 7 -c tessedit_char_whitelist=0123456789:'
                ).strip()
                if ":" in text:
                    secs = tracker.parse_timer(text)
                    if secs is not None:
                        found_time, found_value = t, secs
                        if not quiet:
                            print(f"   Found timer '{text}' ({secs}s) at t={t:.1f}s")
                        break
            except Exception:
                pass
        t += INITIAL_SAMPLE_INTERVAL

    reader.release()
    tracker.shutdown()

    if found_time is None:
        if not quiet:
            print(" Could not find match timer")
        return None

    if found_value > MATCH_AUTO_DURATION:
        elapsed = MATCH_TELEOP_DURATION - found_value
        est = found_time - (MATCH_AUTO_DURATION + MATCH_TRANSITION_DURATION + elapsed)
    else:
        est = found_time - (MATCH_AUTO_DURATION - found_value)

    if not quiet:
        print(f"  Estimated match start: t={est:.1f}s")
    return est


def _calculate_boundaries(match_start: float) -> MatchBoundaries:
    ae = match_start + MATCH_AUTO_DURATION
    ts = ae + MATCH_TRANSITION_DURATION
    te = ts + MATCH_TELEOP_DURATION
    return MatchBoundaries(match_start=match_start, auto_end=ae,
                           teleop_start=ts, teleop_end=te)


# ──────────────────────────────────────────────────────────────
# Calibration (static, works standalone)
# ──────────────────────────────────────────────────────────────

def calibrate(source: str) -> Optional[ScoreRegionConfig]:
    """
    Interactive calibration mode.  Opens an OpenCV window so the user can
    draw rectangles over the score regions.

    Returns
    -------
    ScoreRegionConfig or None if the user quit without selecting regions.
    """
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video source: {source}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    if total_frames > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, total_frames // 2)
    ret, frame = cap.read()
    if not ret:
        raise RuntimeError("Could not read frame")

    current_frame = total_frames // 2 if total_frames > 0 else 0
    h, w = frame.shape[:2]
    duration = total_frames / fps if total_frames > 0 else 0

    print(f"\nFrame size: {w}x{h}")
    print(f"Video: {total_frames} frames, ~{duration:.0f}s")
    print(f"\nCalibration Mode:")
    print(f"  LEFT/RIGHT = ±1s | UP/DOWN = ±30s | ,/. = ±1 frame | 0-9 = jump")
    print(f"  r = RED region | b = BLUE region | t = TIMER region | q = done\n")

    regions: Dict[str, Tuple[float, float, float, float]] = {}
    current_label: Optional[str] = None
    drawing = False
    start_point: Optional[Tuple[int, int]] = None
    current_rect = None

    def seek_to(fn: int):
        nonlocal frame, current_frame
        fn = max(0, min(fn, total_frames - 1) if total_frames > 0 else fn)
        cap.set(cv2.CAP_PROP_POS_FRAMES, fn)
        ok, nf = cap.read()
        if ok:
            frame, current_frame = nf, fn

    def mouse_cb(event, x, y, flags, param):
        nonlocal drawing, start_point, current_rect
        if event == cv2.EVENT_LBUTTONDOWN:
            drawing, start_point = True, (x, y)
        elif event == cv2.EVENT_MOUSEMOVE and drawing:
            current_rect = (start_point, (x, y))
        elif event == cv2.EVENT_LBUTTONUP:
            drawing = False
            if current_label and start_point:
                r = (min(start_point[0], x) / w, min(start_point[1], y) / h,
                     max(start_point[0], x) / w, max(start_point[1], y) / h)
                regions[current_label] = r
                print(f"  {current_label}: ({r[0]:.3f}, {r[1]:.3f}, {r[2]:.3f}, {r[3]:.3f})")

    cv2.namedWindow("Calibration")
    cv2.setMouseCallback("Calibration", mouse_cb)

    while True:
        disp = frame.copy()
        colours = {"red": (0, 0, 255), "blue": (255, 0, 0), "timer": (0, 255, 0)}
        for lbl, (x1, y1, x2, y2) in regions.items():
            c = colours.get(lbl, (255, 255, 255))
            cv2.rectangle(disp, (int(x1 * w), int(y1 * h)),
                          (int(x2 * w), int(y2 * h)), c, 2)
            cv2.putText(disp, lbl, (int(x1 * w), int(y1 * h) - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, c, 1)
        if drawing and current_rect:
            cv2.rectangle(disp, current_rect[0], current_rect[1], (0, 255, 255), 2)

        info = (f"Mode: {current_label or 'none'} | "
                f"Frame {current_frame}/{total_frames} | "
                f"{current_frame / fps:.1f}s / {duration:.0f}s")
        cv2.putText(disp, info, (10, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        cv2.imshow("Calibration", disp)

        key = cv2.waitKey(1) & 0xFF
        skip1 = int(fps)
        skip30 = int(fps * 30)

        if key in (81, 2):
            seek_to(current_frame - skip1)
        elif key in (83, 3):
            seek_to(current_frame + skip1)
        elif key in (82, 0):
            seek_to(current_frame + skip30)
        elif key in (84, 1):
            seek_to(current_frame - skip30)
        elif key == ord(","):
            seek_to(current_frame - 1)
        elif key == ord("."):
            seek_to(current_frame + 1)
        elif key in range(ord("0"), ord("9") + 1) and total_frames > 0:
            seek_to(int(total_frames * (key - ord("0")) / 10))
        elif key == ord("r"):
            current_label = "red"
            print("  Select RED score region…")
        elif key == ord("b"):
            current_label = "blue"
            print("  Select BLUE score region…")
        elif key == ord("t"):
            current_label = "timer"
            print("  Select TIMER region…")
        elif key == ord("q"):
            break

    cv2.destroyAllWindows()
    cap.release()

    if not regions:
        return None

    kwargs: Dict[str, float] = {}
    mapping = {"red": ("red_x1", "red_y1", "red_x2", "red_y2"),
               "blue": ("blue_x1", "blue_y1", "blue_x2", "blue_y2"),
               "timer": ("timer_x1", "timer_y1", "timer_x2", "timer_y2")}
    for lbl, keys in mapping.items():
        if lbl in regions:
            for k, v in zip(keys, regions[lbl]):
                kwargs[k] = v

    cfg = ScoreRegionConfig(**kwargs)
    print(f"\nCalibrated config:\n{cfg}")
    return cfg


# ──────────────────────────────────────────────────────────────
# Public API — FRCScoreTracker
# ──────────────────────────────────────────────────────────────

class FRCScoreTracker:
    """
    High-level, library-friendly interface for tracking FRC match scores.

    Parameters
    ----------
    url : str, optional
        YouTube URL (will be resolved via yt-dlp).
    file : str, optional
        Path to a local video file. Exactly one of *url* / *file* is required.
    config : ScoreRegionConfig, optional
        Pre-calibrated score region coordinates.
    interval : float
        Sampling interval in seconds (default 1.0).
    batch_size : int
        Frames per processing batch (default 64).
    use_gpu : bool
        Enable GPU acceleration (default True).
    debug : bool
        Extra debug output (default False).
    verbose : bool
        Show detailed OCR failure information (default False).
    show_preview : bool
        Show live OpenCV preview window (default False).
    output_prefix : str or None
        If set, automatically export CSVs with this prefix after run().
    cookies : str or None
        Path to a Netscape-format cookies.txt for yt-dlp.
    cookies_from_browser : str or None
        Browser name to extract cookies from (e.g. "firefox", "chrome").
    quiet : bool
        Suppress most console output (default False).
    """

    def __init__(
            self,
            *,
            url: Optional[str] = None,
            file: Optional[str] = None,
            config: Optional[ScoreRegionConfig] = None,
            interval: float = 1.0,
            batch_size: int = 64,
            use_gpu: bool = True,
            debug: bool = False,
            verbose: bool = False,
            show_preview: bool = False,
            output_prefix: Optional[str] = None,
            cookies: Optional[str] = None,
            cookies_from_browser: Optional[str] = None,
            quiet: bool = False,
    ):
        if not url and not file:
            raise ValueError("Provide either url= or file=")
        if url and file:
            raise ValueError("Provide only one of url= or file=")

        self.url = url
        self.file = file
        self.config = config or ScoreRegionConfig()
        self.interval = interval
        self.batch_size = batch_size
        self.use_gpu = use_gpu
        self.debug = debug
        self.verbose = verbose
        self.show_preview = show_preview
        self.output_prefix = output_prefix
        self.cookies = cookies
        self.cookies_from_browser = cookies_from_browser
        self.quiet = quiet

    # ── public entry points ──────────────────────────────────

    def run(self) -> TrackingResult:
        """Run the full tracking pipeline and return a TrackingResult."""
        if self.use_gpu:
            check_gpu_support(quiet=self.quiet)

        source = self._resolve_source()
        return self._process(source)

    @staticmethod
    def calibrate(source: str) -> Optional[ScoreRegionConfig]:
        """Open interactive calibration window. Returns ScoreRegionConfig."""
        return calibrate(source)

    # ── internals ────────────────────────────────────────────

    def _resolve_source(self) -> str:
        if self.file:
            p = Path(self.file)
            if not p.exists():
                raise FileNotFoundError(f"Video file not found: {self.file}")
            return str(p)

        url = self.url
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        return _resolve_stream_url(
            url,
            cookies=self.cookies,
            cookies_from_browser=self.cookies_from_browser,
            quiet=self.quiet,
        )

    def _process(self, source: str) -> TrackingResult:
        # Phase 1 — find match
        match_start = _find_match_start(
            source, self.config, use_gpu=self.use_gpu,
            debug=self.debug, quiet=self.quiet)
        if match_start is None:
            return TrackingResult(
                readings=[], scoring_moments=[], boundaries=None,
                ocr_attempts=0, ocr_successes=0, ocr_failures=0,
                elapsed_seconds=0.0, frames_processed=0)

        boundaries = _calculate_boundaries(match_start)

        if not self.quiet:
            print(f"\n{'=' * 60}")
            print(f"Match Phase Boundaries")
            print(f"{'=' * 60}")
            print(f"Auto:       {boundaries.match_start:.1f}s – {boundaries.auto_end:.1f}s")
            print(f"Transition: {boundaries.auto_end:.1f}s – {boundaries.teleop_start:.1f}s")
            print(f"Teleop:     {boundaries.teleop_start:.1f}s – {boundaries.teleop_end:.1f}s")
            print(f"{'=' * 60}\n")

        # Phase 2 — track scores
        tracker = _ScoreTracker(self.config, debug=self.debug,
                                batch_size=self.batch_size,
                                use_gpu=self.use_gpu, verbose=self.verbose)
        reader = OptimizedVideoReader(source, cache_size=self.batch_size * 8)

        if not self.quiet:
            print(f"  GPU: {' ' + (GPU_TYPE or '') if self.use_gpu and GPU_AVAILABLE else '✗'}")
            print(f"  Batch: {self.batch_size} | Interval: {self.interval}s")
            print(f"  Resolution: {reader.width}×{reader.height} @ {reader.fps:.1f} fps\n")

        windows = [
            (boundaries.match_start, boundaries.auto_end, "auto"),
            (boundaries.auto_end, boundaries.teleop_start, "transition"),
            (boundaries.teleop_start, boundaries.teleop_end, "teleop"),
        ]

        processed = 0
        t0 = time.time()

        try:
            for ws, we, phase in windows:
                if not self.quiet:
                    print(f"\n Processing {phase.upper()} ({ws:.1f}s – {we:.1f}s)…")
                ct = ws
                while ct <= we:
                    batch_ts = []
                    bt = ct
                    while bt <= we and len(batch_ts) < self.batch_size:
                        batch_ts.append(bt)
                        bt += self.interval
                    if not batch_ts:
                        break
                    frames = reader.get_frames_batch(batch_ts)
                    fwp = [(ts, f, phase) for ts, f in frames]
                    if fwp:
                        evts = tracker.process_frames_batch(fwp)
                        processed += len(evts)
                        if not self.quiet and evts:
                            last = evts[-1]
                            el = time.time() - t0
                            spd = processed / el if el else 0
                            print(f"\r  t={last.timestamp:>7.1f}s  "
                                  f"R:{last.red_score or '?':>4}  "
                                  f"B:{last.blue_score or '?':>4}  "
                                  f"Evts:{len(tracker.scoring_moments):>3}  "
                                  f"{spd:.1f} fps", end="", flush=True)
                    ct = batch_ts[-1] + self.interval
        except KeyboardInterrupt:
            if not self.quiet:
                print("\n\n  Stopped by user")
        finally:
            reader.release()
            tracker.shutdown()

        elapsed = time.time() - t0
        if not self.quiet:
            print(f"\n\n  {processed} frames in {elapsed:.1f}s ({processed / elapsed:.1f} fps)")

        result = TrackingResult(
            readings=tracker.readings,
            scoring_moments=tracker.scoring_moments,
            boundaries=boundaries,
            ocr_attempts=tracker.ocr_attempts,
            ocr_successes=tracker.ocr_successes,
            ocr_failures=tracker.ocr_failures,
            elapsed_seconds=elapsed,
            frames_processed=processed,
        )

        # Auto-export if prefix given
        if self.output_prefix:
            result.export_events_csv(f"{self.output_prefix}_events.csv")
            result.export_readings_csv(f"{self.output_prefix}_readings.csv")
            if not self.quiet:
                print(f" Exported CSVs with prefix '{self.output_prefix}'")

        return result


# ──────────────────────────────────────────────────────────────
# CLI (preserved — this file can still be run directly)
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FRC Match Score Tracker (Library + CLI)",
        formatter_class=argparse.RawDescriptionHelpFormatter)

    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="YouTube URL")
    src.add_argument("--file", help="Local video file")

    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--output", default="frc_scores")
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--no-gpu", action="store_true")
    parser.add_argument("--calibrate", action="store_true")
    parser.add_argument("--cookies", help="Path to cookies.txt for yt-dlp")
    parser.add_argument("--cookies-from-browser",
                        help="Browser to extract cookies from (e.g. firefox)")

    args = parser.parse_args()

    if args.calibrate:
        if args.url:
            url = args.url if args.url.startswith(("http://", "https://")) else "https://" + args.url
            source = _resolve_stream_url(url, cookies=args.cookies,
                                         cookies_from_browser=args.cookies_from_browser)
        else:
            source = args.file
        calibrate(source)
        return

    tracker = FRCScoreTracker(
        url=args.url,
        file=args.file,
        interval=args.interval,
        batch_size=args.batch_size,
        use_gpu=not args.no_gpu,
        debug=args.debug,
        verbose=args.verbose,
        show_preview=args.preview,
        output_prefix=args.output,
        cookies=args.cookies,
        cookies_from_browser=args.cookies_from_browser,
    )

    result = tracker.run()

    # Print summary
    print(f"\n{'=' * 60}")
    print(f"Score Tracking Summary")
    print(f"{'=' * 60}")
    print(f"Frames processed: {result.frames_processed}")
    print(f"Scoring events: {len(result.scoring_moments)}")
    if result.ocr_attempts:
        print(f"OCR success rate: {result.ocr_success_rate:.1f}%")
    print(f"Final — Red: {result.final_red}  Blue: {result.final_blue}")

    if result.scoring_moments:
        print(f"\nLast 20 events:")
        print(f"  {'Time':>8s}  {'Match':>6s}  {'Phase':<7s}  "
              f"{'Alliance':<6s}  {'Pts':>4s}  {'Total':>5s}")
        print(f"  {'-' * 48}")
        for m in result.scoring_moments[-20:]:
            print(f"  {m.timestamp:>7.1f}s  {m.match_time or '':>6s}  "
                  f"{m.match_phase or '?':<7s}  {m.alliance:<6s}  "
                  f"+{m.points_gained:>3d}  {m.new_total:>5d}")


if __name__ == "__main__":
    main()