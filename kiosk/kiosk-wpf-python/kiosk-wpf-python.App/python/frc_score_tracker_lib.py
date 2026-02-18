"""
FRC Match Score Tracker via OCR on YouTube Livestreams — Library Version (Refactored)

This module exposes the full functionality of the FRC score tracker as a
Python library with flexible region tracking - you can track any number of
numeric or text regions, not just red/blue/timer.

Quick-start
-----------
    from frc_score_tracker_lib import FRCScoreTracker, ScoreRegionConfig, Region

    # Use defaults (red, blue, timer)
    tracker = FRCScoreTracker(
        url="https://www.youtube.com/watch?v=XXXXX",
        interval=1.0,
        batch_size=64,
    )
    result = tracker.run()
    print(result.scoring_moments)

With custom regions
-------------------
    config = ScoreRegionConfig(regions=[
        Region("red", 0.528, 0.058, 0.595, 0.117, "number"),
        Region("blue", 0.409, 0.058, 0.472, 0.119, "number"),
        Region("timer", 0.466, 0.056, 0.534, 0.114, "text"),
        Region("bonus", 0.300, 0.100, 0.350, 0.150, "number"),  # Custom!
    ])
    tracker = FRCScoreTracker(file="match.mp4", config=config)
    result = tracker.run()

Calibration (interactive)
-------------------------
    FRCScoreTracker.calibrate("match.mp4")
    # Opens OpenCV window; use number keys to add regions
    # Press 'n' for new region, type name, select area
    # Prints ScoreRegionConfig when done
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
                print(f"✓ GPU Acceleration enabled: {GPU_TYPE}")
                try:
                    device = cv2.ocl.Device.getDefault()
                    print(f"  Device: {device.name()}")
                    print(f"  Global Memory: {device.globalMemSize() / (1024 ** 3):.1f} GB")
                    print(f"  Max Alloc Size: {device.maxMemAllocSize() / (1024 ** 3):.1f} GB")
                except Exception:
                    pass
            return True

    try:
        if cv2.cuda.getCudaEnabledDeviceCount() > 0:
            GPU_AVAILABLE = True
            GPU_TYPE = "CUDA (NVIDIA)"
            if not quiet:
                print(f"✓ GPU Acceleration enabled: {GPU_TYPE}")
                try:
                    cv2.cuda.setBufferPoolUsage(True)
                    cv2.cuda.setBufferPoolConfig(cv2.cuda.getDevice(), 1024 * 1024 * 1024, 2)
                except Exception:
                    pass
            return True
    except Exception:
        pass

    if not quiet:
        print("✗ No GPU acceleration available — using CPU")
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
class Region:
    """A single tracked region with normalized coordinates."""
    name: str
    x1: float
    y1: float
    x2: float
    y2: float
    type: str = "number"  # "number" or "text"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Region":
        return cls(**d)


@dataclass
class ScoreRegionConfig:
    """Score overlay region configuration with flexible regions."""
    regions: List[Region] = field(default_factory=list)

    def __post_init__(self):
        # Provide default regions if none specified
        if not self.regions:
            self.regions = [
                Region("red", 0.528, 0.058, 0.595, 0.117, "number"),
                Region("blue", 0.409, 0.058, 0.472, 0.119, "number"),
                Region("timer", 0.466, 0.056, 0.534, 0.114, "text"),
            ]
            self.regions = [
                Region("red", 0.533, 0.060, 0.592, 0.116, "number"),
                Region("blue", 0.408, 0.060, 0.468, 0.115, "number"),
                Region("timer", 0.471, 0.063, 0.528, 0.114, "text"),
                Region("red_coral", 0.925, 0.069, 0.967, 0.104, "number"),
                Region("blue_coral", 0.034, 0.069, 0.076, 0.106, "number"),
                Region("red_algae", 0.847, 0.071, 0.887, 0.102, "number"),
                Region("blue_algae", 0.112, 0.069, 0.152, 0.103, "number"),
            ]

    def get_region(self, name: str) -> Optional[Region]:
        """Get a region by name."""
        for r in self.regions:
            if r.name == name:
                return r
        return None

    def add_region(self, name: str, x1: float, y1: float, x2: float, y2: float,
                   region_type: str = "number") -> None:
        """Add a new region to track."""
        self.regions.append(Region(name, x1, y1, x2, y2, region_type))

    def to_dict(self) -> Dict[str, Any]:
        return {"regions": [r.to_dict() for r in self.regions]}

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ScoreRegionConfig":
        if "regions" in d:
            regions = [Region.from_dict(r) for r in d["regions"]]
            return cls(regions=regions)
        # Legacy support - convert old format to new
        legacy_regions = []
        for prefix in ["red", "blue", "timer"]:
            x1_key = f"{prefix}_x1"
            if x1_key in d:
                region_type = "text" if prefix == "timer" else "number"
                legacy_regions.append(Region(
                    prefix,
                    d[f"{prefix}_x1"],
                    d[f"{prefix}_y1"],
                    d[f"{prefix}_x2"],
                    d[f"{prefix}_y2"],
                    region_type
                ))
        return cls(regions=legacy_regions) if legacy_regions else cls()


@dataclass
class ScoreEvent:
    """A single score reading at a point in time."""
    timestamp: float
    values: Dict[str, Optional[Any]]  # region_name -> value
    match_phase: Optional[str] = None

    def __getitem__(self, key: str) -> Optional[Any]:
        """Allow dict-like access: event['red']"""
        return self.values.get(key)

    def get(self, key: str, default=None) -> Optional[Any]:
        """Get with default value."""
        return self.values.get(key, default)


@dataclass
class ScoringMoment:
    """A detected change in a tracked value."""
    timestamp: float
    region_name: str
    old_value: Optional[Any]
    new_value: Any
    match_phase: Optional[str] = None

    @property
    def points_gained(self) -> Optional[int]:
        """For numeric regions, calculate the delta."""
        if isinstance(self.old_value, (int, float)) and isinstance(self.new_value, (int, float)):
            return int(self.new_value - self.old_value)
        return None


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
    tracked_regions: List[str]  # Names of all tracked regions

    # Convenience helpers ─────────────────────────────────────
    def get_final_value(self, region_name: str) -> Optional[Any]:
        """Get the final value for a specific region."""
        for reading in reversed(self.readings):
            val = reading.get(region_name)
            if val is not None:
                return val
        return None

    @property
    def final_values(self) -> Dict[str, Optional[Any]]:
        """Get final values for all tracked regions."""
        return {name: self.get_final_value(name) for name in self.tracked_regions}

    @property
    def ocr_success_rate(self) -> float:
        return (self.ocr_successes / self.ocr_attempts * 100) if self.ocr_attempts else 0.0

    def export_events_csv(self, path: str) -> None:
        """Export scoring moments to CSV."""
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["video_timestamp_s", "match_phase", "region_name",
                        "old_value", "new_value", "delta"])
            for m in self.scoring_moments:
                delta = m.points_gained if m.points_gained is not None else ""
                w.writerow([f"{m.timestamp:.1f}", m.match_phase or "",
                            m.region_name, m.old_value or "", m.new_value, delta])

    def export_readings_csv(self, path: str) -> None:
        """Export all readings to CSV."""
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            header = ["video_timestamp_s", "match_phase"] + self.tracked_regions
            w.writerow(header)
            for r in self.readings:
                row = [f"{r.timestamp:.1f}", r.match_phase or ""]
                row.extend([r.get(name, "") for name in self.tracked_regions])
                w.writerow(row)


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
                      region_types: List[str]) -> List[Optional[Any]]:
        """Process a batch of ROIs based on their types (number/text)."""
        if not TESSERACT_AVAILABLE:
            return [None] * len(rois)
        futures = [self.executor.submit(self._extract_value, roi, rtype)
                   for roi, rtype in zip(rois, region_types)]
        return [f.result() for f in futures]

    def _extract_value(self, roi: np.ndarray, region_type: str) -> Optional[Any]:
        """Extract either a number or text based on region type."""
        if region_type == "number":
            return self._extract_number(roi)
        else:  # text
            return self._extract_text(roi)

    def _extract_number(self, roi: np.ndarray) -> Optional[int]:
        """Extract numeric value from ROI."""
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

    def _extract_text(self, roi: np.ndarray) -> Optional[str]:
        """Extract text value from ROI (e.g., timer)."""
        gpu_proc = GPUImageProcessor(use_gpu=GPU_AVAILABLE)
        processed = gpu_proc._preprocess_single(roi, "default")

        try:
            text = pytesseract.image_to_string(
                Image.fromarray(processed),
                config=r'--oem 3 --psm 7 -c tessedit_char_whitelist=0123456789:'
            ).strip()
            return text if text else None
        except Exception:
            return None

    def shutdown(self):
        self.executor.shutdown(wait=True)


# ──────────────────────────────────────────────────────────────
# Template Matching OCR (fallback)
# ──────────────────────────────────────────────────────────────

class TemplateMatchingOCR:
    def __init__(self, min_confidence: float = 0.65):
        self.known_glyphs: list[tuple[np.ndarray, int]] = []
        self.min_confidence = min_confidence

    # ─────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────

    def extract_number(self, roi: np.ndarray) -> Optional[int]:
        bin_img = self._binarize(roi)
        glyphs = self._segment_glyphs(bin_img)

        if not glyphs:
            return None

        digits = []
        for g in glyphs:
            d, conf = self._classify_glyph(g)
            if d is None or conf < self.min_confidence:
                return None
            digits.append(str(d))

        try:
            return int("".join(digits))
        except ValueError:
            return None

    # ─────────────────────────────────────────────
    # Core logic
    # ─────────────────────────────────────────────

    def _classify_glyph(self, glyph: np.ndarray) -> tuple[Optional[int], float]:
        glyph = self._normalize(glyph)

        best_digit, best_score = None, -1.0

        for known_img, digit in self.known_glyphs:
            score = self._similarity(glyph, known_img)
            if score > best_score:
                best_digit, best_score = digit, score

        # If confident, reuse label
        if best_score >= self.min_confidence:
            return best_digit, best_score

        # Otherwise: attempt digit inference by topology
        inferred = self._infer_digit_shape(glyph)
        if inferred is not None:
            self.known_glyphs.append((glyph, inferred))
            return inferred, 1.0

        return None, 0.0

    # ─────────────────────────────────────────────
    # Image utilities
    # ─────────────────────────────────────────────

    def _binarize(self, roi: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if roi.ndim == 3 else roi
        _, thresh = cv2.threshold(gray, 0, 255,
                                  cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if np.mean(thresh) < 127:
            thresh = cv2.bitwise_not(thresh)
        return thresh

    def _segment_glyphs(self, bin_img: np.ndarray) -> list[np.ndarray]:
        contours, _ = cv2.findContours(
            bin_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        glyphs = []
        h = bin_img.shape[0]

        for c in contours:
            x, y, w, h_c = cv2.boundingRect(c)
            if h_c < h * 0.45:
                continue
            glyphs.append((x, bin_img[y:y + h_c, x:x + w]))

        glyphs.sort(key=lambda g: g[0])
        return [g[1] for g in glyphs]

    def _normalize(self, img: np.ndarray) -> np.ndarray:
        img = cv2.resize(img, (28, 28))
        img = img.astype(np.float32) / 255.0
        return img

    def _similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        return cv2.matchTemplate(
            a, b, cv2.TM_CCOEFF_NORMED
        )[0][0]

    # ─────────────────────────────────────────────
    # Shape-based digit inference (no templates)
    # ─────────────────────────────────────────────

    def _infer_digit_shape(self, glyph: np.ndarray) -> Optional[int]:
        """Infer digit using simple topology rules."""
        g = (glyph > 0.5).astype(np.uint8)

        contours, hierarchy = cv2.findContours(
            g, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
        )

        holes = 0
        if hierarchy is not None:
            holes = sum(1 for h in hierarchy[0] if h[3] != -1)

        h, w = g.shape
        aspect = w / h

        if holes == 2:
            return 8
        if holes == 1:
            if aspect > 0.8:
                return 0
            return 9
        if holes == 0:
            if aspect < 0.35:
                return 1
            if aspect > 0.75:
                return 2
            return None

        return None



# ──────────────────────────────────────────────────────────────
# Internal Score Tracker
# ──────────────────────────────────────────────────────────────

class _ScoreTracker:
    def __init__(self, config: ScoreRegionConfig, *,
                 debug: bool = False, batch_size: int = 64,
                 use_gpu: bool = True, verbose: bool = False, recognition_mode: str = "ocr", ):
        self.config = config
        self._debug = debug
        self._verbose = verbose
        self.readings: List[ScoreEvent] = []
        self.scoring_moments: List[ScoringMoment] = []
        self.last_values: Dict[str, Optional[Any]] = {r.name: None for r in config.regions}
        self.match_phase: Optional[str] = None
        self.match_active: bool = False
        self.recognition_mode = recognition_mode

        self.gpu_processor = GPUImageProcessor(use_gpu=use_gpu)
        self.batch_size = batch_size
        self.ocr_processor = None
        self.template_ocr = None

        if self.recognition_mode in ("ocr", "auto"):
            if TESSERACT_AVAILABLE:
                self.ocr_processor = BatchOCRProcessor(max_workers=8, verbose=verbose)

        if self.recognition_mode in ("template", "auto"):
            self.template_ocr = TemplateMatchingOCR()

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
    def get_roi(frame: np.ndarray, region: Region) -> np.ndarray:
        h, w = frame.shape[:2]
        return frame[int(region.y1 * h):int(region.y2 * h),
        int(region.x1 * w):int(region.x2 * w)]

    # ── batch processing ─────────────────────────────────────
    def process_frames_batch(self, frames_data: List[Tuple[float, np.ndarray, str]]) -> List[ScoreEvent]:
        if not frames_data:
            return []

        # Extract ROIs for all regions
        all_rois: Dict[str, List[np.ndarray]] = {}
        for region in self.config.regions:
            all_rois[region.name] = [
                self.get_roi(frame, region) for _, frame, _ in frames_data
            ]

        # Preprocess all ROIs
        processed_rois: Dict[str, List[np.ndarray]] = {}
        for region in self.config.regions:
            processed_rois[region.name] = self.gpu_processor.preprocess_batch(
                all_rois[region.name]
            )

        # OCR all regions
        ocr_results: Dict[str, List[Optional[Any]]] = {}
        for region in self.config.regions:
            region_types = [region.type] * len(processed_rois[region.name])
            results = []

            for roi, rtype in zip(processed_rois[region.name], region_types):
                value = None

                if self.recognition_mode in ("ocr", "auto"):
                    if self.ocr_processor:
                        value = self.ocr_processor._extract_value(roi, rtype)

                if value is None and self.recognition_mode in ("template", "auto"):
                    if self.template_ocr:
                        if rtype == "number":
                            value = self.template_ocr.extract_number(roi)
                        else:
                            value = self.template_ocr.extract_text(roi)

                results.append(value)

            ocr_results[region.name] = results

            # Track OCR stats
            for result in results:
                self.ocr_attempts += 1
                if result is not None:
                    self.ocr_successes += 1
                else:
                    self.ocr_failures += 1

        # Build events
        events: List[ScoreEvent] = []
        for i, (ts, _frame, phase) in enumerate(frames_data):
            values = {}
            for region in self.config.regions:
                value = ocr_results[region.name][i]
                # If we failed to read and have a last value during match, use it
                if value is None and phase is not None:
                    value = self.last_values.get(region.name)
                values[region.name] = value

            # Determine phase from timer if available
            timer_region = self.config.get_region("timer")
            if timer_region and phase is None:
                timer_value = values.get("timer")
                phase = self.determine_phase_from_timer(timer_value)

            ev = ScoreEvent(timestamp=ts, values=values, match_phase=phase)
            self.readings.append(ev)
            self._detect_changes(ev)
            events.append(ev)

        return events

    def _detect_changes(self, event: ScoreEvent):
        """Detect changes in any tracked region."""
        max_plausible = 300
        max_jump = 30

        # Validate and fix numeric values
        for region in self.config.regions:
            if region.type != "number":
                continue

            value = event.values.get(region.name)
            last_value = self.last_values.get(region.name)

            if value is None:
                continue

            # Sanity check
            if value > max_plausible:
                event.values[region.name] = None
                continue

            if last_value is not None:
                diff = value - last_value

                # Check for unrealistic jump
                if diff > max_jump:
                    # Try to fix spurious '0'
                    fixed = False
                    s = str(value)
                    if "0" in s:
                        for i, ch in enumerate(s):
                            if ch == "0":
                                ns = s[:i] + s[i + 1:]
                                if ns:
                                    nv = int(ns)
                                    if 0 <= nv - last_value <= max_jump and 0 <= nv <= max_plausible:
                                        value = nv
                                        event.values[region.name] = nv
                                        fixed = True
                                        break
                    if not fixed:
                        event.values[region.name] = None
                        continue

                # Check for backward movement
                if diff < -20:
                    event.values[region.name] = None
                    continue

        # Record changes
        for region in self.config.regions:
            value = event.values.get(region.name)
            last_value = self.last_values.get(region.name)

            if value is not None and last_value is not None and value != last_value:
                self.scoring_moments.append(ScoringMoment(
                    timestamp=event.timestamp,
                    region_name=region.name,
                    old_value=last_value,
                    new_value=value,
                    match_phase=event.match_phase
                ))

        # Update last values
        for region in self.config.regions:
            value = event.values.get(region.name)
            if value is not None:
                self.last_values[region.name] = value

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
            print("✓ Got stream URL")
        return url
    except FileNotFoundError:
        raise RuntimeError("yt-dlp not found. Install it: pip install yt-dlp")
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"yt-dlp failed: {e.stderr}")


def _find_match_start(source: str, config: ScoreRegionConfig, *,
                      use_gpu: bool = True, debug: bool = False,
                      quiet: bool = False) -> Optional[float]:
    """Find match start by looking for a timer region."""
    reader = OptimizedVideoReader(source)
    duration = reader.total_frames / reader.fps if reader.total_frames > 0 else 180

    if not quiet:
        print(f"\n🔍 Phase 1: Finding match in video…")
        print(f"   Video duration: ~{duration:.0f}s ({reader.total_frames} frames @ {reader.fps:.1f} fps)")

    # Find a timer region to use for detection
    timer_region = config.get_region("timer")
    if not timer_region:
        if not quiet:
            print("⚠️  No 'timer' region defined - cannot auto-detect match start")
        reader.release()
        return None

    tracker = _ScoreTracker(config, debug=debug, use_gpu=use_gpu)
    middle = duration / 2
    search_start = max(0, middle - 30)
    search_end = min(duration, middle + 30)

    if not quiet:
        print(f"   Searching for timer around middle ({middle:.0f}s ± 30s)…")

    found_time: Optional[float] = None
    found_value: Optional[float] = None
    t = search_start

    while t <= search_end:
        frame = reader.get_frame(t)
        if frame is None:
            t += INITIAL_SAMPLE_INTERVAL
            continue

        troi = tracker.get_roi(frame, timer_region)
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
                            print(f"   ✓ Found timer '{text}' ({secs}s) at t={t:.1f}s")
                        break
            except Exception:
                pass
        t += INITIAL_SAMPLE_INTERVAL

    reader.release()
    tracker.shutdown()

    if found_time is None:
        if not quiet:
            print("   ✗ Could not find match timer")
        return None

    if found_value > MATCH_AUTO_DURATION:
        elapsed = MATCH_TELEOP_DURATION - found_value
        est = found_time - (MATCH_AUTO_DURATION + MATCH_TRANSITION_DURATION + elapsed)
    else:
        est = found_time - (MATCH_AUTO_DURATION - found_value)

    if not quiet:
        print(f"   ✓ Estimated match start: t={est:.1f}s")
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
    Interactive calibration mode. Opens an OpenCV window so the user can
    draw rectangles over any regions they want to track.

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

    print(f"\n{'=' * 60}")
    print(f"Calibration Mode")
    print(f"{'=' * 60}")
    print(f"Frame size: {w}x{h}")
    print(f"Video: {total_frames} frames, ~{duration:.0f}s")
    print(f"\nNavigation:")
    print(f"  LEFT/RIGHT = ±1s | UP/DOWN = ±30s")
    print(f"  ,/. = ±1 frame | 0-9 = jump to 0%-90%")
    print(f"\nRegion Selection:")
    print(f"  n = Add new region (you'll be prompted for name & type)")
    print(f"  d = Delete region (click on it)")
    print(f"  q = Done (save and exit)")
    print(f"\nQuick presets:")
    print(f"  r = Add 'red' (number) | b = Add 'blue' (number)")
    print(f"  t = Add 'timer' (text)")
    print(f"{'=' * 60}\n")

    regions: List[Region] = []
    current_region_name: Optional[str] = None
    current_region_type: str = "number"
    drawing = False
    start_point: Optional[Tuple[int, int]] = None
    current_rect = None

    # Color cycle for different regions
    colors = [
        (0, 0, 255),  # Red
        (255, 0, 0),  # Blue
        (0, 255, 0),  # Green
        (255, 255, 0),  # Cyan
        (255, 0, 255),  # Magenta
        (0, 255, 255),  # Yellow
        (128, 128, 255),  # Light red
        (255, 128, 128),  # Light blue
    ]

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
            # Check if clicking on existing region to delete
            if current_region_name == "DELETE":
                for i, region in enumerate(regions):
                    x1, y1 = int(region.x1 * w), int(region.y1 * h)
                    x2, y2 = int(region.x2 * w), int(region.y2 * h)
                    if x1 <= x <= x2 and y1 <= y <= y2:
                        print(f"  ✗ Deleted region '{region.name}'")
                        regions.pop(i)
                        break
            elif current_region_name:
                drawing, start_point = True, (x, y)

        elif event == cv2.EVENT_MOUSEMOVE and drawing:
            current_rect = (start_point, (x, y))

        elif event == cv2.EVENT_LBUTTONUP and drawing:
            drawing = False
            if current_region_name and current_region_name != "DELETE" and start_point:
                x1_norm = min(start_point[0], x) / w
                y1_norm = min(start_point[1], y) / h
                x2_norm = max(start_point[0], x) / w
                y2_norm = max(start_point[1], y) / h

                new_region = Region(
                    current_region_name,
                    x1_norm, y1_norm, x2_norm, y2_norm,
                    current_region_type
                )
                regions.append(new_region)
                print(f"  ✓ Added '{current_region_name}' ({current_region_type}): "
                      f"({x1_norm:.3f}, {y1_norm:.3f}, {x2_norm:.3f}, {y2_norm:.3f})")
                current_rect = None

    cv2.namedWindow("Calibration")
    cv2.setMouseCallback("Calibration", mouse_cb)

    while True:
        disp = frame.copy()

        # Draw all regions
        for i, region in enumerate(regions):
            color = colors[i % len(colors)]
            x1, y1 = int(region.x1 * w), int(region.y1 * h)
            x2, y2 = int(region.x2 * w), int(region.y2 * h)
            cv2.rectangle(disp, (x1, y1), (x2, y2), color, 2)
            label = f"{region.name} ({region.type})"
            cv2.putText(disp, label, (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        # Draw current selection
        if drawing and current_rect:
            cv2.rectangle(disp, current_rect[0], current_rect[1], (0, 255, 255), 2)

        # Info text
        mode_text = current_region_name if current_region_name else "Navigate"
        if current_region_name and current_region_name != "DELETE":
            mode_text += f" ({current_region_type})"

        info = (f"Mode: {mode_text} | "
                f"Frame {current_frame}/{total_frames} | "
                f"{current_frame / fps:.1f}s / {duration:.0f}s | "
                f"Regions: {len(regions)}")
        cv2.putText(disp, info, (10, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        cv2.imshow("Calibration", disp)

        key = cv2.waitKey(1) & 0xFF
        skip1 = int(fps)
        skip30 = int(fps * 30)

        # Navigation
        if key in (81, 2):  # Left
            seek_to(current_frame - skip1)
        elif key in (83, 3):  # Right
            seek_to(current_frame + skip1)
        elif key in (82, 0):  # Up
            seek_to(current_frame + skip30)
        elif key in (84, 1):  # Down
            seek_to(current_frame - skip30)
        elif key == ord(","):
            seek_to(current_frame - 1)
        elif key == ord("."):
            seek_to(current_frame + 1)
        elif key in range(ord("0"), ord("9") + 1) and total_frames > 0:
            seek_to(int(total_frames * (key - ord("0")) / 10))

        # Region management
        elif key == ord("n"):
            print("\n  Enter region name: ", end="", flush=True)
            cv2.destroyWindow("Calibration")
            name = input().strip()
            if name:
                print("  Type (n)umber or (t)ext? [n]: ", end="", flush=True)
                type_choice = input().strip().lower()
                current_region_type = "text" if type_choice == "t" else "number"
                current_region_name = name
                print(f"  → Draw rectangle for '{name}' ({current_region_type})")
            cv2.namedWindow("Calibration")
            cv2.setMouseCallback("Calibration", mouse_cb)

        elif key == ord("r"):
            current_region_name = "red"
            current_region_type = "number"
            print("  → Select RED score region (number)…")

        elif key == ord("b"):
            current_region_name = "blue"
            current_region_type = "number"
            print("  → Select BLUE score region (number)…")

        elif key == ord("t"):
            current_region_name = "timer"
            current_region_type = "text"
            print("  → Select TIMER region (text)…")

        elif key == ord("d"):
            current_region_name = "DELETE"
            print("  → Click on a region to delete it…")

        elif key == ord("q"):
            break

    cv2.destroyAllWindows()
    cap.release()

    if not regions:
        print("\n✗ No regions defined")
        return None

    config = ScoreRegionConfig(regions=regions)
    print(f"\n{'=' * 60}")
    print(f"Calibrated Configuration")
    print(f"{'=' * 60}")
    for region in config.regions:
        print(f"{region.name:12s} ({region.type:6s}): "
              f"({region.x1:.3f}, {region.y1:.3f}, {region.x2:.3f}, {region.y2:.3f})")
    print(f"{'=' * 60}\n")
    return config


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
            recognition_mode: str = "ocr",
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
        self.recognition_mode = recognition_mode
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
        # Phase 1 — find match (if timer region exists)
        match_start = _find_match_start(
            source, self.config, use_gpu=self.use_gpu,
            debug=self.debug, quiet=self.quiet)

        if match_start is None:
            if not self.quiet:
                print("⚠️  Skipping match boundary detection - processing entire video")
            boundaries = None
            # Process entire video
            reader = OptimizedVideoReader(source, cache_size=self.batch_size * 8)
            duration = reader.total_frames / reader.fps if reader.total_frames > 0 else 180
            windows = [(0, duration, None)]
            reader.release()
        else:
            boundaries = _calculate_boundaries(match_start)
            if not self.quiet:
                print(f"\n{'=' * 60}")
                print(f"Match Phase Boundaries")
                print(f"{'=' * 60}")
                print(f"Auto:       {boundaries.match_start:.1f}s – {boundaries.auto_end:.1f}s")
                print(f"Transition: {boundaries.auto_end:.1f}s – {boundaries.teleop_start:.1f}s")
                print(f"Teleop:     {boundaries.teleop_start:.1f}s – {boundaries.teleop_end:.1f}s")
                print(f"{'=' * 60}\n")
            windows = [
                (boundaries.match_start, boundaries.auto_end, "auto"),
                (boundaries.auto_end, boundaries.teleop_start, "transition"),
                (boundaries.teleop_start, boundaries.teleop_end, "teleop"),
            ]

        # Phase 2 — track all regions
        tracker = _ScoreTracker(self.config, debug=self.debug,
                                batch_size=self.batch_size,
                                use_gpu=self.use_gpu, verbose=self.verbose, recognition_mode=self.recognition_mode)
        reader = OptimizedVideoReader(source, cache_size=self.batch_size * 8)

        if not self.quiet:
            print(f"\n{'=' * 60}")
            print(f"Tracking Configuration")
            print(f"{'=' * 60}")
            print(f"Regions tracked: {len(self.config.regions)}")
            for region in self.config.regions:
                print(f"  • {region.name} ({region.type})")
            print(f"\nProcessing:")
            print(f"  GPU: {'✓ ' + (GPU_TYPE or '') if self.use_gpu and GPU_AVAILABLE else '✗ CPU only'}")
            print(f"  Batch size: {self.batch_size}")
            print(f"  Interval: {self.interval}s")
            print(f"  Resolution: {reader.width}×{reader.height} @ {reader.fps:.1f} fps")
            print(f"{'=' * 60}\n")

        processed = 0
        t0 = time.time()

        try:
            for ws, we, phase in windows:
                if not self.quiet:
                    phase_name = phase.upper() if phase else "FULL VIDEO"
                    print(f"\n⚙️  Processing {phase_name} ({ws:.1f}s – {we:.1f}s)…")
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

                            # Build status line with all tracked values
                            status_parts = [f"t={last.timestamp:>7.1f}s"]
                            for region in self.config.regions:
                                val = last.get(region.name, "?")
                                if isinstance(val, int):
                                    status_parts.append(f"{region.name}:{val:>4}")
                                else:
                                    status_parts.append(f"{region.name}:{str(val)[:6]:>6}")
                            status_parts.append(f"Changes:{len(tracker.scoring_moments):>3}")
                            status_parts.append(f"{spd:.1f} fps")

                            print(f"\r  {' | '.join(status_parts)}", end="", flush=True)
                    ct = batch_ts[-1] + self.interval
        except KeyboardInterrupt:
            if not self.quiet:
                print("\n\n⚠️  Stopped by user")
        finally:
            reader.release()
            tracker.shutdown()

        elapsed = time.time() - t0
        if not self.quiet:
            print(f"\n\n✓ {processed} frames in {elapsed:.1f}s ({processed / elapsed:.1f} fps)")

        result = TrackingResult(
            readings=tracker.readings,
            scoring_moments=tracker.scoring_moments,
            boundaries=boundaries,
            ocr_attempts=tracker.ocr_attempts,
            ocr_successes=tracker.ocr_successes,
            ocr_failures=tracker.ocr_failures,
            elapsed_seconds=elapsed,
            frames_processed=processed,
            tracked_regions=[r.name for r in self.config.regions],
        )

        # Auto-export if prefix given
        if self.output_prefix:
            result.export_events_csv(f"{self.output_prefix}_events.csv")
            result.export_readings_csv(f"{self.output_prefix}_readings.csv")
            if not self.quiet:
                print(f"✓ Exported CSVs with prefix '{self.output_prefix}'")

        return result


# ──────────────────────────────────────────────────────────────
# CLI (preserved — this file can still be run directly)
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FRC Match Score Tracker (Library + CLI) - Flexible Region Tracking",
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
    parser.add_argument(
        "--recognition",
        choices=["ocr", "template", "auto"],
        default="ocr",
        help="Text recognition mode"
    )

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
        recognition_mode=args.recognition
    )

    result = tracker.run()

    # Print summary
    print(f"\n{'=' * 60}")
    print(f"Tracking Summary")
    print(f"{'=' * 60}")
    print(f"Frames processed: {result.frames_processed}")
    print(f"Value changes detected: {len(result.scoring_moments)}")
    if result.ocr_attempts:
        print(f"OCR success rate: {result.ocr_success_rate:.1f}%")

    print(f"\nFinal values:")
    for name, value in result.final_values.items():
        print(f"  {name}: {value}")

    if result.scoring_moments:
        print(f"\nLast 20 changes:")
        print(f"  {'Time':>8s}  {'Phase':<7s}  {'Region':<12s}  {'Old':>6s}  {'New':>6s}  {'Delta':>6s}")
        print(f"  {'-' * 60}")
        for m in result.scoring_moments[-20:]:
            delta = f"+{m.points_gained}" if m.points_gained else ""
            print(f"  {m.timestamp:>7.1f}s  {m.match_phase or '?':<7s}  "
                  f"{m.region_name:<12s}  {str(m.old_value):>6s}  "
                  f"{str(m.new_value):>6s}  {delta:>6s}")


if __name__ == "__main__":
    main()
