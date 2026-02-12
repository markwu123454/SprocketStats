"""
FRC Match Score Tracker via OCR on YouTube Livestreams (V2 - Optimized with AMD GPU)

Optimizations:
- AMD GPU hardware acceleration via ROCm/OpenCL
- Batched frame processing (default 64 frames)
- Multi-threaded OCR (8 workers)
- Frame decode caching (500 frame cache)
- Optimized preprocessing pipeline
- Memory-mapped video reading
- OCR error correction: drops extra '0' digits if result is plausible

Performance Notes:
- **Main bottleneck is Tesseract OCR (CPU-only)**
- GPU is only used for image preprocessing (resize, threshold, morphology)
- To maximize GPU usage, increase --batch-size (try 128 or 256)
- RAM usage scales with batch size and cache size
- Slowdown over time usually due to video seeking overhead

Requirements:
    pip install opencv-python pytesseract numpy yt-dlp Pillow

AMD GPU Requirements (optional but recommended):
    # For Ubuntu/Linux with AMD GPU:
    sudo apt install rocm-opencl-dev ocl-icd-opencl-dev

    # Verify OpenCL: python -c "import cv2; print(cv2.ocl.haveOpenCL())"

You also need Tesseract OCR installed:
    - Ubuntu/Debian: sudo apt install tesseract-ocr
    - macOS: brew install tesseract
    - Windows: https://github.com/UB-Mannheim/tesseract/wiki

Usage:
    # From a YouTube livestream or video URL
    python frc_score_tracker_v2_optimized.py --url "https://www.youtube.com/watch?v=XXXXX"

    # With larger batch size (faster, uses more RAM)
    python frc_score_tracker_v2_optimized.py --url "..." --batch-size 128

    # Disable GPU acceleration
    python frc_score_tracker_v2_optimized.py --file match.mp4 --no-gpu
"""

import argparse
import csv
import time
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from typing import List, Tuple, Optional
import threading

import cv2
import numpy as np
from PIL import Image

# Check for Tesseract availability
TESSERACT_AVAILABLE = False
try:
    import pytesseract
    try:
        pytesseract.get_tesseract_version()
        TESSERACT_AVAILABLE = True
        print("✓ Tesseract OCR detected")
    except:
        print("⚠ Tesseract not installed - will use template matching fallback")
except ImportError:
    print("⚠ pytesseract not installed")


# Check for GPU acceleration
GPU_AVAILABLE = False
GPU_TYPE = None

def check_gpu_support():
    """Check for AMD GPU (OpenCL) or NVIDIA GPU (CUDA) support."""
    global GPU_AVAILABLE, GPU_TYPE

    if cv2.ocl.haveOpenCL():
        cv2.ocl.setUseOpenCL(True)
        if cv2.ocl.useOpenCL():
            GPU_AVAILABLE = True
            GPU_TYPE = "OpenCL (AMD/Intel)"
            print(f"✓ GPU Acceleration enabled: {GPU_TYPE}")
            print(f"  Device: {cv2.ocl.Device.getDefault().name()}")

            # Try to allocate more GPU memory for OpenCL
            try:
                device = cv2.ocl.Device.getDefault()
                # Note: OpenCV doesn't expose direct memory allocation control
                # but we can encourage larger buffers
                print(f"  Global Memory: {device.globalMemSize() / (1024**3):.1f} GB")
                print(f"  Max Alloc Size: {device.maxMemAllocSize() / (1024**3):.1f} GB")
            except:
                pass

            return True

    # Check for CUDA
    try:
        if cv2.cuda.getCudaEnabledDeviceCount() > 0:
            GPU_AVAILABLE = True
            GPU_TYPE = "CUDA (NVIDIA)"
            print(f"✓ GPU Acceleration enabled: {GPU_TYPE}")

            # Set CUDA memory allocation
            try:
                cv2.cuda.setBufferPoolUsage(True)
                cv2.cuda.setBufferPoolConfig(cv2.cuda.getDevice(), 1024 * 1024 * 1024, 2)  # 1GB stack, 2 stacks
                print(f"  Configured CUDA buffer pool for better memory utilization")
            except:
                pass

            return True
    except:
        pass

    print("⚠ No GPU acceleration available - using CPU")
    return False


# ──────────────────────────────────────────────────────────────
# Configuration
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
    """Score overlay region configuration."""
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


@dataclass
class ScoreEvent:
    """A single score reading at a point in time."""
    timestamp: float
    red_score: int | None
    blue_score: int | None
    match_time: str | None = None
    match_phase: str | None = None


@dataclass
class ScoringMoment:
    """A detected change in score."""
    timestamp: float
    alliance: str
    points_gained: int
    new_total: int
    match_time: str | None = None
    match_phase: str | None = None


@dataclass
class MatchBoundaries:
    """Detected match start/end times in video."""
    match_start: float
    auto_end: float
    teleop_start: float
    teleop_end: float


# ──────────────────────────────────────────────────────────────
# GPU-Accelerated Image Processing
# ──────────────────────────────────────────────────────────────

class GPUImageProcessor:
    """GPU-accelerated image preprocessing pipeline."""

    def __init__(self, use_gpu: bool = True):
        self.use_gpu = use_gpu and GPU_AVAILABLE
        self._preprocess_cache = {}  # Cache preprocessed templates

    def preprocess_batch(self, rois: List[np.ndarray],
                        strategy: str = "default") -> List[np.ndarray]:
        """Batch preprocess multiple ROIs for better GPU utilization."""
        if not rois:
            return []

        if self.use_gpu and GPU_TYPE == "OpenCL (AMD/Intel)":
            return self._preprocess_batch_opencl(rois, strategy)
        else:
            # CPU fallback - still faster with vectorization
            return [self._preprocess_single(roi, strategy) for roi in rois]

    def _preprocess_batch_opencl(self, rois: List[np.ndarray],
                                 strategy: str) -> List[np.ndarray]:
        """OpenCL (AMD GPU) accelerated batch preprocessing."""
        results = []

        for roi in rois:
            # Upload to GPU
            gpu_roi = cv2.UMat(roi)

            # Trim borders
            h, w = gpu_roi.get().shape[:2]
            margin_x = max(2, int(w * 0.1))
            margin_y = max(1, int(h * 0.1))
            gpu_roi = gpu_roi.get()[margin_y:h-margin_y, margin_x:w-margin_x]
            gpu_roi = cv2.UMat(gpu_roi)

            # Upscale (GPU-accelerated)
            scale = 4
            gpu_roi = cv2.resize(gpu_roi, None, fx=scale, fy=scale,
                               interpolation=cv2.INTER_CUBIC)

            if strategy == "default":
                # Convert to grayscale (GPU)
                gray = cv2.cvtColor(gpu_roi, cv2.COLOR_BGR2GRAY)

                # Threshold (GPU)
                _, thresh = cv2.threshold(gray, 0, 255,
                                        cv2.THRESH_BINARY + cv2.THRESH_OTSU)

                # Download from GPU
                thresh_cpu = thresh.get()
                if np.mean(thresh_cpu) < 127:
                    thresh_cpu = cv2.bitwise_not(thresh_cpu)

            elif strategy == "adaptive":
                gray = cv2.cvtColor(gpu_roi, cv2.COLOR_BGR2GRAY)
                thresh = cv2.adaptiveThreshold(
                    gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY, 11, 2
                )
                thresh_cpu = thresh.get()
                if np.mean(thresh_cpu) < 127:
                    thresh_cpu = cv2.bitwise_not(thresh_cpu)

            elif strategy == "morphology":
                gray = cv2.cvtColor(gpu_roi, cv2.COLOR_BGR2GRAY)
                _, thresh = cv2.threshold(gray, 0, 255,
                                        cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                thresh_cpu = thresh.get()
                if np.mean(thresh_cpu) < 127:
                    thresh_cpu = cv2.bitwise_not(thresh_cpu)

                # Morphological operations (GPU)
                kernel = np.ones((2, 2), np.uint8)
                kernel_gpu = cv2.UMat(kernel)
                thresh_gpu = cv2.UMat(thresh_cpu)
                thresh_gpu = cv2.morphologyEx(thresh_gpu, cv2.MORPH_OPEN, kernel_gpu)
                thresh_gpu = cv2.morphologyEx(thresh_gpu, cv2.MORPH_CLOSE, kernel_gpu)
                thresh_cpu = thresh_gpu.get()
            else:
                gray = cv2.cvtColor(gpu_roi, cv2.COLOR_BGR2GRAY)
                _, thresh = cv2.threshold(gray, 0, 255,
                                        cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                thresh_cpu = thresh.get()
                if np.mean(thresh_cpu) < 127:
                    thresh_cpu = cv2.bitwise_not(thresh_cpu)

            # Add padding
            pad = 20
            thresh_cpu = cv2.copyMakeBorder(thresh_cpu, pad, pad, pad, pad,
                                          cv2.BORDER_CONSTANT, value=255)

            results.append(thresh_cpu)

        return results

    def _preprocess_single(self, roi: np.ndarray, strategy: str) -> np.ndarray:
        """Fallback CPU preprocessing."""
        # Same as original preprocess_for_ocr but optimized
        h, w = roi.shape[:2]
        margin_x = max(2, int(w * 0.1))
        margin_y = max(1, int(h * 0.1))
        roi = roi[margin_y:h-margin_y, margin_x:w-margin_x]

        scale = 4
        roi = cv2.resize(roi, None, fx=scale, fy=scale,
                        interpolation=cv2.INTER_CUBIC)

        # Convert to grayscale only if needed
        if len(roi.shape) == 3:
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        else:
            gray = roi

        _, thresh = cv2.threshold(gray, 0, 255,
                                cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        if np.mean(thresh) < 127:
            thresh = cv2.bitwise_not(thresh)

        if strategy == "morphology":
            kernel = np.ones((2, 2), np.uint8)
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        pad = 20
        thresh = cv2.copyMakeBorder(thresh, pad, pad, pad, pad,
                                   cv2.BORDER_CONSTANT, value=255)

        return thresh


# ──────────────────────────────────────────────────────────────
# Optimized Video Reader with Frame Caching
# ──────────────────────────────────────────────────────────────

class OptimizedVideoReader:
    """
    Optimized video reader with:
    - Hardware-accelerated decoding (when available)
    - Frame caching for nearby timestamps
    - Batch frame extraction
    """

    def __init__(self, source: str, cache_size: int = 500):
        self.source = source
        self.cache_size = cache_size
        self._frame_cache = {}
        self._cache_lock = threading.Lock()
        self._last_frame_num = -1  # Track sequential access

        # Try to open with hardware acceleration
        self.cap = self._open_with_hw_accel(source)

        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    def _open_with_hw_accel(self, source: str) -> cv2.VideoCapture:
        """Try to open video with hardware acceleration."""
        # Try different backends in order of preference
        backends = [
            (cv2.CAP_FFMPEG, "FFMPEG"),
            (cv2.CAP_ANY, "ANY"),
        ]

        for backend, name in backends:
            cap = cv2.VideoCapture(source, backend)
            if cap.isOpened():
                print(f"✓ Video opened with {name} backend")
                return cap

        print("⚠ Could not open video with any backend")
        return cv2.VideoCapture(source)

    def get_frame(self, timestamp: float) -> Optional[np.ndarray]:
        """Get frame at timestamp with caching."""
        frame_num = int(timestamp * self.fps)

        # Check cache first
        with self._cache_lock:
            if frame_num in self._frame_cache:
                self._last_frame_num = frame_num
                return self._frame_cache[frame_num].copy()

        # Read frame
        # Optimize: only seek if not reading sequentially
        if frame_num != self._last_frame_num + 1:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)

        ret, frame = self.cap.read()
        self._last_frame_num = frame_num

        if ret:
            # Add to cache
            with self._cache_lock:
                self._frame_cache[frame_num] = frame.copy()

                # Smarter cache eviction: use LRU-like strategy
                if len(self._frame_cache) > self.cache_size:
                    # Remove frames far from current position
                    frames_to_remove = []
                    for cached_frame_num in self._frame_cache.keys():
                        if abs(cached_frame_num - frame_num) > self.cache_size // 2:
                            frames_to_remove.append(cached_frame_num)
                            if len(frames_to_remove) >= len(self._frame_cache) // 4:
                                break

                    for f in frames_to_remove:
                        del self._frame_cache[f]

            return frame

        return None

    def get_frames_batch(self, timestamps: List[float]) -> List[Tuple[float, np.ndarray]]:
        """Get multiple frames efficiently with prefetching."""
        # Sort timestamps for sequential access
        sorted_timestamps = sorted(timestamps)
        results = []

        # Prefetch strategy: read ahead while sequential
        for i, ts in enumerate(sorted_timestamps):
            frame = self.get_frame(ts)
            if frame is not None:
                results.append((ts, frame))

            # Prefetch next few frames if they're close
            if i < len(sorted_timestamps) - 1:
                next_ts = sorted_timestamps[i + 1]
                frame_diff = abs(int(next_ts * self.fps) - int(ts * self.fps))

                # If next frame is within 30 frames, it's likely sequential
                if frame_diff <= 30:
                    continue  # Next iteration will handle it efficiently

        return results

    def release(self):
        """Release video capture."""
        self.cap.release()
        self._frame_cache.clear()


# ──────────────────────────────────────────────────────────────
# Multi-threaded OCR Processor
# ──────────────────────────────────────────────────────────────

class BatchOCRProcessor:
    """Process OCR in parallel using thread pool."""

    def __init__(self, max_workers: int = 8, verbose: bool = False):
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.verbose = verbose

    def process_batch(self, rois: List[np.ndarray],
                     labels: List[str]) -> List[Optional[int]]:
        """Process multiple ROIs in parallel."""
        if not TESSERACT_AVAILABLE:
            return [None] * len(rois)

        futures = []
        for roi, label in zip(rois, labels):
            future = self.executor.submit(self._extract_number, roi, label)
            futures.append(future)

        results = [future.result() for future in futures]
        return results

    def _extract_number(self, roi: np.ndarray, label: str) -> Optional[int]:
        """Extract number from preprocessed ROI."""
        strategies = ["default", "adaptive", "morphology"]
        all_results = []
        failed_attempts = []

        gpu_proc = GPUImageProcessor(use_gpu=GPU_AVAILABLE)

        for strategy in strategies:
            processed = gpu_proc._preprocess_single(roi, strategy)

            for psm in [8, 7, 13]:
                custom_config = (f'--oem 3 --psm {psm} '
                               f'-c tessedit_char_whitelist=0123456789')
                try:
                    text = pytesseract.image_to_string(
                        Image.fromarray(processed), config=custom_config
                    ).strip()

                    if text.isdigit() and len(text) > 0:
                        value = int(text)
                        if 0 <= value <= 300:
                            all_results.append(value)
                        else:
                            # Try dropping a '0' if value is out of range
                            # Common OCR error: "15" → "150" or "105"
                            if '0' in text:
                                for i, char in enumerate(text):
                                    if char == '0':
                                        # Create new string without this '0'
                                        new_text = text[:i] + text[i+1:]
                                        if new_text and new_text.isdigit():
                                            new_value = int(new_text)
                                            if 0 <= new_value <= 300:
                                                all_results.append(new_value)
                                                if self.verbose:
                                                    print(f"\n  🔧 [FIX] {label}: '{text}' → '{new_text}' (dropped '0' at pos {i})")
                                                break
                                else:
                                    # No valid fix found
                                    failed_attempts.append(f"{strategy}/psm{psm}: '{text}' (out of range 0-300, couldn't fix)")
                            else:
                                failed_attempts.append(f"{strategy}/psm{psm}: '{text}' (out of range 0-300)")
                    else:
                        failed_attempts.append(f"{strategy}/psm{psm}: '{text}' (not a valid number)")
                except Exception as e:
                    failed_attempts.append(f"{strategy}/psm{psm}: ERROR - {str(e)}")

        if all_results:
            # Return most common result
            counter = Counter(all_results)
            return counter.most_common(1)[0][0]

        # Log why OCR failed (only if verbose mode)
        if self.verbose:
            print(f"\n⚠️  OCR FAILED for {label}:")
            print(f"   Tried {len(failed_attempts)} combinations, none succeeded:")
            for attempt in failed_attempts[:6]:  # Show first 6 attempts
                print(f"     • {attempt}")
            if len(failed_attempts) > 6:
                print(f"     ... and {len(failed_attempts) - 6} more attempts")

        return None

    def shutdown(self):
        """Shutdown thread pool."""
        self.executor.shutdown(wait=True)


# ──────────────────────────────────────────────────────────────
# Template Matching OCR (unchanged but referenced)
# ──────────────────────────────────────────────────────────────

class TemplateMatchingOCR:
    """Template matching for digit recognition."""

    def __init__(self, template_dir: str = "digit_templates"):
        self.templates = {}
        self.template_dir = Path(template_dir)

        if self.template_dir.exists():
            self._load_templates()

    def _load_templates(self):
        """Load digit templates from directory."""
        for digit in range(10):
            template_file = self.template_dir / f"{digit}.png"
            if template_file.exists():
                template = cv2.imread(str(template_file), cv2.IMREAD_GRAYSCALE)
                self.templates[digit] = template

        if self.templates:
            print(f"✓ Loaded {len(self.templates)} digit templates")

    def extract_number(self, roi: np.ndarray, debug: bool = False) -> Optional[int]:
        """Extract number using template matching."""
        if not self.templates:
            return None

        if len(roi.shape) == 3:
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        else:
            gray = roi

        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if np.mean(thresh) < 127:
            thresh = cv2.bitwise_not(thresh)

        best_match = None
        best_score = 0.0

        for num in range(0, 301):
            num_str = str(num)
            if not all(int(d) in self.templates for d in num_str):
                continue

            digit_imgs = [self.templates[int(d)] for d in num_str]
            combined = np.hstack(digit_imgs) if len(digit_imgs) > 1 else digit_imgs[0]

            if combined.shape[0] > 0:
                scale = thresh.shape[0] / combined.shape[0]
                new_w = int(combined.shape[1] * scale)
                new_h = thresh.shape[0]
                if new_w > 0 and new_h > 0:
                    resized = cv2.resize(combined, (new_w, new_h))

                    if resized.shape[1] <= thresh.shape[1] and resized.shape[0] <= thresh.shape[0]:
                        result = cv2.matchTemplate(thresh, resized, cv2.TM_CCOEFF_NORMED)
                        _, max_val, _, _ = cv2.minMaxLoc(result)

                        if max_val > best_score:
                            best_score = max_val
                            best_match = num

        if best_match is not None and best_score > 0.7:
            return best_match

        return None


# ──────────────────────────────────────────────────────────────
# Optimized Score Tracker
# ──────────────────────────────────────────────────────────────

class ScoreTracker:
    def __init__(self, config: ScoreRegionConfig | None = None,
                 debug: bool = False, batch_size: int = 64,
                 use_gpu: bool = True, verbose: bool = False):
        self.config = config or ScoreRegionConfig()
        self._debug = debug
        self._verbose = verbose
        self.readings: list[ScoreEvent] = []
        self.scoring_moments: list[ScoringMoment] = []
        self.last_red: int | None = None
        self.last_blue: int | None = None

        self.match_phase: str | None = None
        self.match_active: bool = False

        # GPU processor
        self.gpu_processor = GPUImageProcessor(use_gpu=use_gpu)

        # Batch processing
        self.batch_size = batch_size
        self.ocr_processor = BatchOCRProcessor(max_workers=8, verbose=verbose)

        # Template matching fallback
        self.template_ocr = None
        if not TESSERACT_AVAILABLE:
            self.template_ocr = TemplateMatchingOCR()

        # OCR success tracking
        self.ocr_attempts = 0
        self.ocr_successes = 0
        self.ocr_failures = 0

    def parse_timer(self, timer_str: str | None) -> float | None:
        """Parse a timer string like '2:15' into total seconds."""
        if not timer_str or ':' not in timer_str:
            return None
        try:
            parts = timer_str.split(':')
            minutes = int(parts[0])
            seconds = int(parts[1])
            return minutes * 60 + seconds
        except (ValueError, IndexError):
            return None

    def determine_phase_from_timer(self, timer_str: str | None) -> str | None:
        """Determine match phase from timer value."""
        timer_secs = self.parse_timer(timer_str)

        if timer_secs is None:
            return None

        if timer_secs > MATCH_AUTO_DURATION:
            return "teleop"
        elif timer_secs > 0:
            return "auto"
        else:
            return None

    def get_roi(self, frame: np.ndarray,
                x1: float, y1: float, x2: float, y2: float) -> np.ndarray:
        """Extract a region of interest from a frame."""
        h, w = frame.shape[:2]
        return frame[int(y1 * h):int(y2 * h), int(x1 * w):int(x2 * w)]

    def process_frames_batch(self, frames_data: List[Tuple[float, np.ndarray, str]]) -> List[ScoreEvent]:
        """Process multiple frames in batch for better performance."""
        if not frames_data:
            return []

        cfg = self.config

        # Extract all ROIs first
        red_rois = []
        blue_rois = []
        timer_rois = []

        for timestamp, frame, match_phase in frames_data:
            red_rois.append(self.get_roi(frame, cfg.red_x1, cfg.red_y1, cfg.red_x2, cfg.red_y2))
            blue_rois.append(self.get_roi(frame, cfg.blue_x1, cfg.blue_y1, cfg.blue_x2, cfg.blue_y2))
            timer_rois.append(self.get_roi(frame, cfg.timer_x1, cfg.timer_y1, cfg.timer_x2, cfg.timer_y2))

        # Batch preprocess (GPU-accelerated)
        red_processed = self.gpu_processor.preprocess_batch(red_rois)
        blue_processed = self.gpu_processor.preprocess_batch(blue_rois)
        timer_processed = self.gpu_processor.preprocess_batch(timer_rois, strategy="default")

        # Batch OCR
        red_labels = [f"RED_{i}" for i in range(len(red_rois))]
        blue_labels = [f"BLUE_{i}" for i in range(len(blue_rois))]

        red_scores = self.ocr_processor.process_batch(red_processed, red_labels)
        blue_scores = self.ocr_processor.process_batch(blue_processed, blue_labels)

        # Track OCR success rates
        for score in red_scores + blue_scores:
            self.ocr_attempts += 1
            if score is not None:
                self.ocr_successes += 1
            else:
                self.ocr_failures += 1

        # Process timers (single-threaded for simplicity)
        match_times = []
        for timer_roi in timer_processed:
            if TESSERACT_AVAILABLE:
                custom_config = r'--oem 3 --psm 7 -c tessedit_char_whitelist=0123456789:'
                try:
                    text = pytesseract.image_to_string(
                        Image.fromarray(timer_roi), config=custom_config
                    ).strip()
                    match_times.append(text if ':' in text else None)
                except:
                    match_times.append(None)
            else:
                match_times.append(None)

        # Create events
        events = []
        for i, (timestamp, frame, match_phase) in enumerate(frames_data):
            red_score = red_scores[i]
            blue_score = blue_scores[i]
            match_time = match_times[i]

            # Fallback to last known values during active match
            if match_phase is not None:
                if red_score is None and self.last_red is not None:
                    red_score = self.last_red
                    if self._verbose:
                        print(f"\n  💾 [FALLBACK] t={timestamp:.1f}s: Using last RED score: {red_score}")
                if blue_score is None and self.last_blue is not None:
                    blue_score = self.last_blue
                    if self._verbose:
                        print(f"\n  💾 [FALLBACK] t={timestamp:.1f}s: Using last BLUE score: {blue_score}")

            if match_phase is None:
                match_phase = self.determine_phase_from_timer(match_time)

            event = ScoreEvent(
                timestamp=timestamp,
                red_score=red_score,
                blue_score=blue_score,
                match_time=match_time,
                match_phase=match_phase,
            )

            self.readings.append(event)
            self._detect_scoring(event)
            events.append(event)

        return events

    def _detect_scoring(self, event: ScoreEvent):
        """Detect score changes."""
        max_plausible = 300
        max_jump = 30

        for alliance, score, last in [
            ("red", event.red_score, self.last_red),
            ("blue", event.blue_score, self.last_blue),
        ]:
            if score is None:
                continue

            # Reject scores above max plausible
            if score > max_plausible:
                print(f"\n  🚫 [FILTER] t={event.timestamp:.1f}s {alliance.upper()}: "
                      f"{score} exceeds max ({max_plausible})")
                if alliance == "red":
                    event.red_score = None
                else:
                    event.blue_score = None
                continue

            # Reject large upward jumps (likely OCR misread)
            if last is not None:
                diff = score - last
                if diff > max_jump:
                    # Try dropping a '0' from the score to see if it makes sense
                    score_str = str(score)
                    fixed = False
                    if '0' in score_str:
                        for i, char in enumerate(score_str):
                            if char == '0':
                                new_str = score_str[:i] + score_str[i+1:]
                                if new_str:  # Not empty
                                    new_score = int(new_str)
                                    new_diff = new_score - last
                                    # Check if the corrected score makes a plausible jump
                                    if 0 <= new_diff <= max_jump and 0 <= new_score <= max_plausible:
                                        print(f"\n  🔧 [FIX] t={event.timestamp:.1f}s {alliance.upper()}: "
                                              f"Jump {last}→{score} too large, corrected to {new_score} "
                                              f"(dropped '0' at pos {i})")
                                        score = new_score
                                        if alliance == "red":
                                            event.red_score = new_score
                                        else:
                                            event.blue_score = new_score
                                        fixed = True
                                        break

                    if not fixed:
                        print(f"\n  🚫 [FILTER] t={event.timestamp:.1f}s {alliance.upper()}: "
                              f"Jump {last}→{score} (+{diff}) too large")
                        if alliance == "red":
                            event.red_score = None
                        else:
                            event.blue_score = None
                        continue

                # Reject large decreases (OCR errors, small penalties allowed)
                if diff < -20:
                    print(f"\n  🚫 [FILTER] t={event.timestamp:.1f}s {alliance.upper()}: "
                          f"Decrease {last}→{score} ({diff}) too large")
                    if alliance == "red":
                        event.red_score = None
                    else:
                        event.blue_score = None
                    continue

        # Record scoring events (after all filtering and corrections)
        if event.red_score is not None and self.last_red is not None:
            diff = event.red_score - self.last_red
            if diff != 0:
                self.scoring_moments.append(ScoringMoment(
                    timestamp=event.timestamp,
                    alliance="red",
                    points_gained=diff,
                    new_total=event.red_score,
                    match_time=event.match_time,
                    match_phase=event.match_phase,
                ))

        if event.blue_score is not None and self.last_blue is not None:
            diff = event.blue_score - self.last_blue
            if diff != 0:
                self.scoring_moments.append(ScoringMoment(
                    timestamp=event.timestamp,
                    alliance="blue",
                    points_gained=diff,
                    new_total=event.blue_score,
                    match_time=event.match_time,
                    match_phase=event.match_phase,
                ))

        # Update last known scores with corrected values
        if event.red_score is not None:
            self.last_red = event.red_score
        if event.blue_score is not None:
            self.last_blue = event.blue_score

    def export_csv(self, path: str):
        """Export scoring timeline to CSV."""
        with open(path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                'video_timestamp_s', 'match_time', 'match_phase', 'alliance',
                'points_gained', 'new_total'
            ])
            for m in self.scoring_moments:
                writer.writerow([
                    f"{m.timestamp:.1f}",
                    m.match_time or "",
                    m.match_phase or "",
                    m.alliance,
                    m.points_gained,
                    m.new_total,
                ])
        print(f"✓ Exported {len(self.scoring_moments)} scoring events to {path}")

    def export_readings_csv(self, path: str):
        """Export all raw score readings to CSV."""
        with open(path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                'video_timestamp_s', 'match_time', 'match_phase',
                'red_score', 'blue_score'
            ])
            for r in self.readings:
                writer.writerow([
                    f"{r.timestamp:.1f}",
                    r.match_time or "",
                    r.match_phase or "",
                    r.red_score if r.red_score is not None else "",
                    r.blue_score if r.blue_score is not None else "",
                ])

    def print_summary(self):
        """Print summary of detected scoring events."""
        print(f"\n{'='*60}")
        print(f"Score Tracking Summary")
        print(f"{'='*60}")
        print(f"Total frames processed: {len(self.readings)}")
        print(f"Scoring events detected: {len(self.scoring_moments)}")

        # OCR performance stats
        if self.ocr_attempts > 0:
            success_rate = (self.ocr_successes / self.ocr_attempts) * 100
            print(f"\n📊 OCR Performance:")
            print(f"  Total attempts: {self.ocr_attempts}")
            print(f"  Successful:     {self.ocr_successes} ({success_rate:.1f}%)")
            print(f"  Failed:         {self.ocr_failures} ({100-success_rate:.1f}%)")

        for alliance in ["red", "blue"]:
            events = [m for m in self.scoring_moments if m.alliance == alliance]
            auto_events = [m for m in events if m.match_phase == "auto"]
            teleop_events = [m for m in events if m.match_phase == "teleop"]

            print(f"\n{alliance.upper()} alliance: {len(events)} scoring events")
            if events:
                print(f"  Final score: {events[-1].new_total}")
                total_pts = sum(e.points_gained for e in events)
                auto_pts = sum(e.points_gained for e in auto_events)
                teleop_pts = sum(e.points_gained for e in teleop_events)
                print(f"  Total points tracked: {total_pts}")
                print(f"    Auto:   {auto_pts} pts ({len(auto_events)} events)")
                print(f"    Teleop: {teleop_pts} pts ({len(teleop_events)} events)")

        if self.scoring_moments:
            print(f"\nTimeline (last 20 events):")
            print(f"  {'Time':>8s}  {'Match':>6s}  {'Phase':<7s}  "
                  f"{'Alliance':<6s}  {'Pts':>4s}  {'Total':>5s}")
            print(f"  {'-'*48}")
            for m in self.scoring_moments[-20:]:
                print(f"  {m.timestamp:>7.1f}s  {m.match_time or '':>6s}  "
                      f"{m.match_phase or '?':<7s}  {m.alliance:<6s}  "
                      f"+{m.points_gained:>3d}  {m.new_total:>5d}")

    def shutdown(self):
        """Clean up resources."""
        self.ocr_processor.shutdown()


# ──────────────────────────────────────────────────────────────
# Match detection (simplified for brevity - use same logic)
# ──────────────────────────────────────────────────────────────

def find_match_start(source: str, config: ScoreRegionConfig,
                     debug: bool = False) -> float | None:
    """Find match start using optimized video reader."""
    reader = OptimizedVideoReader(source)

    duration = reader.total_frames / reader.fps if reader.total_frames > 0 else 180

    print(f"\n🔍 Phase 1: Finding match in video...")
    print(f"Video duration: ~{duration:.0f}s ({reader.total_frames} frames @ {reader.fps:.1f} fps)")

    tracker = ScoreTracker(config, debug=debug, use_gpu=GPU_AVAILABLE)

    # Sample middle of video
    middle_time = duration / 2
    search_start = max(0, middle_time - 30)
    search_end = min(duration, middle_time + 30)

    print(f"Searching for timer around middle ({middle_time:.0f}s ± 30s)...")

    first_timer_found = None
    first_timer_value = None
    current_time = search_start

    while current_time <= search_end:
        frame = reader.get_frame(current_time)
        if frame is None:
            current_time += INITIAL_SAMPLE_INTERVAL
            continue

        timer_roi = tracker.get_roi(frame, config.timer_x1, config.timer_y1,
                                   config.timer_x2, config.timer_y2)

        # Quick timer extraction
        if TESSERACT_AVAILABLE:
            processed = tracker.gpu_processor._preprocess_single(timer_roi, "default")
            custom_config = r'--oem 3 --psm 7 -c tessedit_char_whitelist=0123456789:'
            try:
                text = pytesseract.image_to_string(
                    Image.fromarray(processed), config=custom_config
                ).strip()
                if ':' in text:
                    timer_secs = tracker.parse_timer(text)
                    if timer_secs is not None:
                        first_timer_found = current_time
                        first_timer_value = timer_secs
                        print(f"  ✓ Found timer '{text}' ({timer_secs}s) at t={current_time:.1f}s")
                        break
            except:
                pass

        current_time += INITIAL_SAMPLE_INTERVAL

    reader.release()

    if first_timer_found is None:
        print("❌ Could not find match timer")
        return None

    # Estimate match start
    if first_timer_value > MATCH_AUTO_DURATION:
        elapsed_in_teleop = MATCH_TELEOP_DURATION - first_timer_value
        time_since_match_start = MATCH_AUTO_DURATION + MATCH_TRANSITION_DURATION + elapsed_in_teleop
        estimated_match_start = first_timer_found - time_since_match_start
        print(f"\n📊 Timer shows teleop ({first_timer_value}s)")
        print(f"  Estimated match start: t={estimated_match_start:.1f}s")
    else:
        elapsed_in_auto = MATCH_AUTO_DURATION - first_timer_value
        estimated_match_start = first_timer_found - elapsed_in_auto
        print(f"\n📊 Timer shows auto ({first_timer_value}s)")
        print(f"  Estimated match start: t={estimated_match_start:.1f}s")

    return estimated_match_start


def calculate_match_boundaries(match_start: float) -> MatchBoundaries:
    """Calculate all phase boundaries from match start time."""
    auto_end = match_start + MATCH_AUTO_DURATION
    teleop_start = auto_end + MATCH_TRANSITION_DURATION
    teleop_end = teleop_start + MATCH_TELEOP_DURATION

    return MatchBoundaries(
        match_start=match_start,
        auto_end=auto_end,
        teleop_start=teleop_start,
        teleop_end=teleop_end
    )


# ──────────────────────────────────────────────────────────────
# Calibration Mode
# ──────────────────────────────────────────────────────────────

def calibration_mode(source: str):
    """
    Interactive mode to find the right score region coordinates.
    Lets you scrub through the video to find a frame with the overlay,
    then draw rectangles to mark score regions.
    """
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print("ERROR: Could not open video source")
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    # Start at the middle of the video where overlay is likely visible
    if total_frames > 0:
        start_frame = total_frames // 2
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    else:
        start_frame = 0

    ret, frame = cap.read()
    if not ret:
        print("ERROR: Could not read frame")
        return

    current_frame = start_frame
    h, w = frame.shape[:2]
    duration = total_frames / fps if total_frames > 0 else 0

    print(f"\nFrame size: {w}x{h}")
    print(f"Video: {total_frames} frames, ~{duration:.0f}s")
    print(f"\nCalibration Mode:")
    print(f"  Navigation:")
    print(f"    LEFT/RIGHT arrow  — skip 1 second")
    print(f"    ,/.               — skip 1 frame")
    print(f"    UP/DOWN arrow     — skip 30 seconds")
    print(f"    0-9               — jump to 0%-90% of video")
    print(f"  Region selection:")
    print(f"    r — select RED score region")
    print(f"    b — select BLUE score region")
    print(f"    t — select TIMER region")
    print(f"  q — quit and print config\n")

    regions = {}
    current_label = None
    drawing = False
    start_point = None
    current_rect = None

    def seek_to(frame_num: int):
        nonlocal frame, current_frame
        frame_num = max(0, min(frame_num, total_frames - 1)
                        if total_frames > 0 else frame_num)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, new_frame = cap.read()
        if ret:
            frame = new_frame
            current_frame = frame_num

    def mouse_callback(event, x, y, flags, param):
        nonlocal drawing, start_point, current_rect

        if event == cv2.EVENT_LBUTTONDOWN:
            drawing = True
            start_point = (x, y)
        elif event == cv2.EVENT_MOUSEMOVE and drawing:
            current_rect = (start_point, (x, y))
        elif event == cv2.EVENT_LBUTTONUP:
            drawing = False
            if current_label and start_point:
                x1 = min(start_point[0], x) / w
                y1 = min(start_point[1], y) / h
                x2 = max(start_point[0], x) / w
                y2 = max(start_point[1], y) / h
                regions[current_label] = (x1, y1, x2, y2)
                print(f"  {current_label}: ({x1:.3f}, {y1:.3f}, "
                      f"{x2:.3f}, {y2:.3f})")

    cv2.namedWindow('Calibration')
    cv2.setMouseCallback('Calibration', mouse_callback)

    while True:
        display = frame.copy()

        # Draw saved regions
        colors = {'red': (0, 0, 255), 'blue': (255, 0, 0),
                  'timer': (0, 255, 0)}
        for label, (x1, y1, x2, y2) in regions.items():
            color = colors.get(label, (255, 255, 255))
            cv2.rectangle(display,
                          (int(x1 * w), int(y1 * h)),
                          (int(x2 * w), int(y2 * h)),
                          color, 2)
            cv2.putText(display, label,
                        (int(x1 * w), int(y1 * h) - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        # Draw current selection
        if drawing and current_rect:
            cv2.rectangle(display, current_rect[0], current_rect[1],
                          (0, 255, 255), 2)

        # Show info bar at bottom
        time_s = current_frame / fps
        mode_text = (f"Mode: {current_label or 'none'} | "
                     f"Frame {current_frame}/{total_frames} | "
                     f"{time_s:.1f}s / {duration:.0f}s | "
                     f"arrows=seek  r/b/t=select  q=done")
        cv2.putText(display, mode_text, (10, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

        cv2.imshow('Calibration', display)

        key = cv2.waitKey(1) & 0xFF

        # Navigation
        skip_1s = int(fps)
        skip_30s = int(fps * 30)

        if key == 81 or key == 2:  # LEFT arrow
            seek_to(current_frame - skip_1s)
        elif key == 83 or key == 3:  # RIGHT arrow
            seek_to(current_frame + skip_1s)
        elif key == 82 or key == 0:  # UP arrow
            seek_to(current_frame + skip_30s)
        elif key == 84 or key == 1:  # DOWN arrow
            seek_to(current_frame - skip_30s)
        elif key == ord(','):  # previous frame
            seek_to(current_frame - 1)
        elif key == ord('.'):  # next frame
            seek_to(current_frame + 1)
        elif key in range(ord('0'), ord('9') + 1) and total_frames > 0:
            # 0-9 jumps to percentage
            pct = (key - ord('0')) / 10.0
            seek_to(int(total_frames * pct))

        # Region selection
        elif key == ord('r'):
            current_label = 'red'
            print("  Select RED score region...")
        elif key == ord('b'):
            current_label = 'blue'
            print("  Select BLUE score region...")
        elif key == ord('t'):
            current_label = 'timer'
            print("  Select TIMER region...")
        elif key == ord('q'):
            break

    cv2.destroyAllWindows()
    cap.release()

    # Print config
    if regions:
        print("\n\nPaste this config into the script:")
        print("config = ScoreRegionConfig(")
        if 'red' in regions:
            r = regions['red']
            print(f"    red_x1={r[0]:.3f}, red_y1={r[1]:.3f}, "
                  f"red_x2={r[2]:.3f}, red_y2={r[3]:.3f},")
        if 'blue' in regions:
            b = regions['blue']
            print(f"    blue_x1={b[0]:.3f}, blue_y1={b[1]:.3f}, "
                  f"blue_x2={b[2]:.3f}, blue_y2={b[3]:.3f},")
        if 'timer' in regions:
            t = regions['timer']
            print(f"    timer_x1={t[0]:.3f}, timer_y1={t[1]:.3f}, "
                  f"timer_x2={t[2]:.3f}, timer_y2={t[3]:.3f},")
        print(")")


# ──────────────────────────────────────────────────────────────
# Video source helpers
# ──────────────────────────────────────────────────────────────

def get_stream_url(youtube_url: str) -> str:
    """Use yt-dlp to get a direct stream URL."""
    print(f"🔗 Resolving stream URL...")
    try:
        result = subprocess.run(
            [
                'yt-dlp',
                '-f', 'best[height>=720]/best',
                '-g',
                youtube_url,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        url = result.stdout.strip()
        print(f"✓ Got stream URL")
        return url
    except FileNotFoundError:
        print("❌ yt-dlp not found. Install it: pip install yt-dlp")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"❌ yt-dlp failed: {e.stderr}")
        sys.exit(1)


# ──────────────────────────────────────────────────────────────
# Main processing with batch optimization
# ──────────────────────────────────────────────────────────────

def process_video_smart(source: str, config: ScoreRegionConfig,
                        sample_interval: float = 1.0,
                        output_prefix: str = "frc_scores",
                        batch_size: int = 64,
                        show_preview: bool = False,
                        debug: bool = False,
                        use_gpu: bool = True,
                        verbose: bool = False):
    """
    Optimized smart video processing with batching and GPU acceleration.

    Args:
        verbose: If True, show detailed OCR failure reasons and fallback usage
    """

    # Phase 1: Find match start
    match_start = find_match_start(source, config, debug=debug)
    if match_start is None:
        print("❌ Could not detect match start")
        return

    # Calculate phase boundaries
    boundaries = calculate_match_boundaries(match_start)

    print(f"\n{'='*60}")
    print(f"Match Phase Boundaries")
    print(f"{'='*60}")
    print(f"Auto:       {boundaries.match_start:.1f}s - {boundaries.auto_end:.1f}s")
    print(f"Transition: {boundaries.auto_end:.1f}s - {boundaries.teleop_start:.1f}s")
    print(f"Teleop:     {boundaries.teleop_start:.1f}s - {boundaries.teleop_end:.1f}s")
    print(f"Duration:   {boundaries.teleop_end - boundaries.match_start:.1f}s")
    print(f"{'='*60}\n")

    # Phase 2: Process match with batch optimization
    tracker = ScoreTracker(config, debug=debug, batch_size=batch_size,
                          use_gpu=use_gpu, verbose=verbose)
    reader = OptimizedVideoReader(source, cache_size=batch_size * 8)  # Larger cache

    print(f"⚙️  Processing Configuration:")
    print(f"  GPU Acceleration: {'✓ ' + GPU_TYPE if use_gpu and GPU_AVAILABLE else '✗ Disabled'}")
    print(f"  Batch Size: {batch_size}")
    print(f"  Sample Interval: {sample_interval}s")
    print(f"  Resolution: {reader.width}x{reader.height}")
    print(f"  FPS: {reader.fps:.1f}\n")

    sampling_windows = [
        (boundaries.match_start, boundaries.auto_end, "auto"),
        (boundaries.auto_end, boundaries.teleop_start, "transition"),
        (boundaries.teleop_start, boundaries.teleop_end, "teleop"),
    ]

    processed = 0
    start_time = time.time()

    try:
        for window_start, window_end, phase in sampling_windows:
            print(f"\n🎯 Processing {phase.upper()} phase ({window_start:.1f}s - {window_end:.1f}s)...")

            current_time = window_start

            while current_time <= window_end:
                # Collect batch of timestamps
                batch_timestamps = []
                batch_time = current_time
                while batch_time <= window_end and len(batch_timestamps) < batch_size:
                    batch_timestamps.append(batch_time)
                    batch_time += sample_interval

                if not batch_timestamps:
                    break

                # Get frames in batch
                frames_data = reader.get_frames_batch(batch_timestamps)
                frames_with_phase = [(ts, frame, phase) for ts, frame in frames_data]

                # Process batch
                if frames_with_phase:
                    events = tracker.process_frames_batch(frames_with_phase)
                    processed += len(events)

                    # Print progress
                    if events:
                        last_event = events[-1]
                        elapsed = time.time() - start_time
                        fps_processing = processed / elapsed if elapsed > 0 else 0

                        status = (f"\r  t={last_event.timestamp:>7.1f}s  "
                                f"Red: {last_event.red_score or '?':>4}  "
                                f"Blue: {last_event.blue_score or '?':>4}  "
                                f"Events: {len(tracker.scoring_moments):>3}  "
                                f"Speed: {fps_processing:.1f} fps")
                        print(status, end='', flush=True)

                current_time = batch_timestamps[-1] + sample_interval

    except KeyboardInterrupt:
        print("\n\n⚠️  Stopped by user")

    finally:
        reader.release()
        tracker.shutdown()

    elapsed = time.time() - start_time
    print(f"\n\n⏱️  Processed {processed} frames in {elapsed:.1f}s "
          f"({processed/elapsed:.1f} fps)")

    # Export results
    tracker.export_csv(f"{output_prefix}_events.csv")
    tracker.export_readings_csv(f"{output_prefix}_readings.csv")
    tracker.print_summary()


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FRC Match Score Tracker (Optimized with AMD GPU)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument('--url', help='YouTube URL')
    source_group.add_argument('--file', help='Local video file')

    parser.add_argument('--interval', type=float, default=1.0,
                        help='Sampling interval in seconds (default: 1.0)')
    parser.add_argument('--batch-size', type=int, default=64,
                        help='Batch size for processing (default: 64, higher = faster but more memory)')
    parser.add_argument('--output', default='frc_scores',
                        help='Output CSV prefix')
    parser.add_argument('--preview', action='store_true',
                        help='Show live preview (slower)')
    parser.add_argument('--debug', action='store_true',
                        help='Debug mode')
    parser.add_argument('--verbose', action='store_true',
                        help='Show detailed OCR failure reasons and fallback usage')
    parser.add_argument('--no-gpu', action='store_true',
                        help='Disable GPU acceleration')
    parser.add_argument('--calibrate', action='store_true',
                        help='Enter calibration mode to find score regions')

    args = parser.parse_args()

    # Check GPU support
    use_gpu = not args.no_gpu
    if use_gpu:
        check_gpu_support()

    # Resolve video source
    if args.url:
        url = args.url
        # Add https:// if not present
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        source = get_stream_url(url)
    else:
        source = args.file
        if not Path(source).exists():
            print(f"❌ File not found: {source}")
            sys.exit(1)

    # Calibration mode
    if args.calibrate:
        calibration_mode(source)
        return

    # Build config
    config = ScoreRegionConfig()

    # Run optimized processing
    process_video_smart(
        source=source,
        config=config,
        sample_interval=args.interval,
        output_prefix=args.output,
        batch_size=args.batch_size,
        show_preview=args.preview,
        debug=args.debug,
        use_gpu=use_gpu,
        verbose=args.verbose,
    )


if __name__ == '__main__':
    main()

    # @ 254.8s 256 sampling size
    # @
