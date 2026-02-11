"""
FRC Match Score Tracker via OCR on YouTube Livestreams (V2 - Smart Sampling)

Two-pass approach:
1. Sample middle of video to detect match timer and find match start
2. Sample densely only during active match phases (auto, transition, teleop)

Requirements:
    pip install opencv-python pytesseract numpy yt-dlp Pillow

You also need Tesseract OCR installed:
    - Ubuntu/Debian: sudo apt install tesseract-ocr
    - macOS: brew install tesseract
    - Windows: https://github.com/UB-Mannheim/tesseract/wiki

Usage:
    # From a YouTube livestream or video URL
    python frc_score_tracker_v2.py --url "https://www.youtube.com/watch?v=XXXXX"

    # From a local video file
    python frc_score_tracker_v2.py --file match.mp4

    # With custom score region (see --help)
    python frc_score_tracker_v2.py --url "..." --calibrate
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

import cv2
import numpy as np
from PIL import Image

# Check for Tesseract availability
TESSERACT_AVAILABLE = False
try:
    import pytesseract
    # Try to run tesseract to see if it's installed
    try:
        pytesseract.get_tesseract_version()
        TESSERACT_AVAILABLE = True
        print("Tesseract OCR detected - using Tesseract")
    except:
        print("Tesseract not installed - will use template matching fallback")
        print("Note: Template matching requires one-time calibration")
except ImportError:
    print("pytesseract not installed - will use template matching fallback")
    print("Install pytesseract if you want to use Tesseract: pip install pytesseract")


# ──────────────────────────────────────────────────────────────
# Configuration — adjust these for the 2026 game overlay
# ──────────────────────────────────────────────────────────────

# Match phase durations (in seconds) - adjust for specific game year
MATCH_AUTO_DURATION = 15        # Autonomous period
MATCH_TRANSITION_DURATION = 3   # Dead time between auto and teleop (timer may not show)
MATCH_TELEOP_DURATION = 135     # Teleoperated period (2:15)

# Total match duration for reference
MATCH_TOTAL_DURATION = MATCH_AUTO_DURATION + MATCH_TRANSITION_DURATION + MATCH_TELEOP_DURATION

# Match detection parameters
INITIAL_SAMPLE_INTERVAL = 5.0   # Seconds between samples when searching for match
MATCH_START_SEARCH_WINDOW = 30.0  # Seconds before detected timer to search for exact start
FRAME_PRECISION_SEARCH = 0.1    # Seconds between samples when finding exact match start


@dataclass
class ScoreRegionConfig:
    """
    Defines where the score overlay is on screen, as fractions of
    the total frame width/height. Adjust these to match the 2026
    broadcast overlay.

    Use --calibrate mode to find the right values.
    """
    # Red alliance score region (fraction of frame)
    red_x1: float = 0.528
    red_y1: float = 0.058
    red_x2: float = 0.595
    red_y2: float = 0.117

    # Blue alliance score region (fraction of frame)
    blue_x1: float = 0.409
    blue_y1: float = 0.058
    blue_x2: float = 0.472
    blue_y2: float = 0.119

    # Match timer region (optional, for syncing timestamps)
    timer_x1: float = 0.466
    timer_y1: float = 0.056
    timer_x2: float = 0.534
    timer_y2: float = 0.114


@dataclass
class ScoreEvent:
    """A single score reading at a point in time."""
    timestamp: float  # seconds into the video/stream
    red_score: int | None
    blue_score: int | None
    match_time: str | None = None  # OCR'd match timer if available
    match_phase: str | None = None  # "auto", "transition", "teleop", or None


@dataclass
class ScoringMoment:
    """A detected change in score."""
    timestamp: float
    alliance: str  # "red" or "blue"
    points_gained: int
    new_total: int
    match_time: str | None = None
    match_phase: str | None = None


class TemplateMatchingOCR:
    """
    Template matching for digit recognition.
    Best for fixed fonts like FRC overlays - fast and accurate.
    """

    def __init__(self, template_dir: str = "digit_templates"):
        self.templates = {}
        self.template_dir = Path(template_dir)

        # Try to load existing templates
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
            print(f"Loaded {len(self.templates)} digit templates from {self.template_dir}")

    def extract_number(self, roi: np.ndarray, debug: bool = False) -> int | None:
        """
        Extract number using template matching.
        Returns None if templates not available or no match found.
        """
        if not self.templates:
            return None

        # Simple approach: try each digit 0-9 and count best matches
        # For multi-digit numbers, we match the whole number at different scales

        # Convert to grayscale and threshold
        if len(roi.shape) == 3:
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        else:
            gray = roi

        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if np.mean(thresh) < 127:
            thresh = cv2.bitwise_not(thresh)

        # Try to match full numbers 0-300
        best_match = None
        best_score = 0.0

        # For simplicity, just try direct correlation for 1-3 digit numbers
        # This is a basic implementation - can be improved
        for num in range(0, 301):
            # Create template for this number by combining digit templates
            num_str = str(num)
            if not all(int(d) in self.templates for d in num_str):
                continue

            # Combine digit templates horizontally
            digit_imgs = [self.templates[int(d)] for d in num_str]
            combined = np.hstack(digit_imgs) if len(digit_imgs) > 1 else digit_imgs[0]

            # Resize to roughly match ROI height
            if combined.shape[0] > 0:
                scale = thresh.shape[0] / combined.shape[0]
                new_w = int(combined.shape[1] * scale)
                new_h = thresh.shape[0]
                if new_w > 0 and new_h > 0:
                    resized = cv2.resize(combined, (new_w, new_h))

                    # Match
                    if resized.shape[1] <= thresh.shape[1] and resized.shape[0] <= thresh.shape[0]:
                        result = cv2.matchTemplate(thresh, resized, cv2.TM_CCOEFF_NORMED)
                        _, max_val, _, _ = cv2.minMaxLoc(result)

                        if max_val > best_score:
                            best_score = max_val
                            best_match = num

        if best_match is not None and best_score > 0.7:
            if debug:
                print(f"  [Template] Matched {best_match} (score: {best_score:.2f})")
            return best_match

        return None


@dataclass
class MatchBoundaries:
    """Detected match start/end times in video."""
    match_start: float  # Video timestamp where match begins (auto starts)
    auto_end: float     # Video timestamp where auto ends
    teleop_start: float # Video timestamp where teleop begins
    teleop_end: float   # Video timestamp where teleop ends (match over)


class ScoreTracker:
    def __init__(self, config: ScoreRegionConfig | None = None, debug: bool = False):
        self.config = config or ScoreRegionConfig()
        self._debug = debug
        self.readings: list[ScoreEvent] = []
        self.scoring_moments: list[ScoringMoment] = []
        self.last_red: int | None = None
        self.last_blue: int | None = None

        # Match state tracking
        self.match_phase: str | None = None
        self.match_active: bool = False

        # Initialize template matching if Tesseract not available
        self.template_ocr = None
        if not TESSERACT_AVAILABLE:
            self.template_ocr = TemplateMatchingOCR()
            if not self.template_ocr.templates:
                print("\nWARNING: No digit templates found!")
                print("Template matching won't work without calibration.")
                print("Run with --calibrate-templates to create templates.")

    def parse_timer(self, timer_str: str | None) -> float | None:
        """Parse a timer string like '2:15' or '0:04' into total seconds."""
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
        """
        Determine match phase from timer value.

        Timer behavior:
        - Auto:   0:15 → 0:00
        - Transition: Timer may not display or show 0:00
        - Teleop: 2:15 → 0:00
        """
        timer_secs = self.parse_timer(timer_str)

        if timer_secs is None:
            return None

        if timer_secs > MATCH_AUTO_DURATION:
            # Timer > 0:15, must be teleop (counts from 2:15)
            return "teleop"
        elif timer_secs > 0:
            # Timer is 0:01 to 0:15 — auto period
            return "auto"
        else:
            # Timer is 0:00 — could be transition or end
            return None

    def preprocess_for_ocr(self, roi: np.ndarray, strategy: str = "default") -> np.ndarray:
        """
        Preprocess a cropped score region for better OCR accuracy.
        FRC overlays typically have white/light text on a colored background.

        Args:
            roi: Region of interest
            strategy: Preprocessing strategy - "default", "adaptive", "color", "morphology"
        """
        # Trim border pixels to remove overlay divider lines
        h, w = roi.shape[:2]
        margin_x = max(2, int(w * 0.1))
        margin_y = max(1, int(h * 0.1))
        roi = roi[margin_y:h - margin_y, margin_x:w - margin_x]

        # Upscale for better OCR on small regions
        scale = 4
        roi = cv2.resize(roi, None, fx=scale, fy=scale,
                         interpolation=cv2.INTER_CUBIC)

        if strategy == "default":
            # Convert to grayscale
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

            # Threshold — OTSU works well for high-contrast overlays
            _, thresh = cv2.threshold(gray, 0, 255,
                                      cv2.THRESH_BINARY + cv2.THRESH_OTSU)

            # If the text is light on dark, invert so text is black on white
            if np.mean(thresh) < 127:
                thresh = cv2.bitwise_not(thresh)

        elif strategy == "adaptive":
            # Adaptive thresholding for uneven lighting
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            thresh = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2
            )
            if np.mean(thresh) < 127:
                thresh = cv2.bitwise_not(thresh)

        elif strategy == "color":
            # Extract specific color channels that might have better contrast
            # Try blue channel (often good for white text on colored backgrounds)
            b, g, r = cv2.split(roi)

            # Use the channel with highest contrast
            gray = b  # Start with blue
            _, thresh = cv2.threshold(gray, 0, 255,
                                      cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            if np.mean(thresh) < 127:
                thresh = cv2.bitwise_not(thresh)

        elif strategy == "morphology":
            # Morphological operations to clean up noise
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            _, thresh = cv2.threshold(gray, 0, 255,
                                      cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            if np.mean(thresh) < 127:
                thresh = cv2.bitwise_not(thresh)

            # Remove small noise
            kernel = np.ones((2, 2), np.uint8)
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
            # Thicken characters slightly
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        else:
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            _, thresh = cv2.threshold(gray, 0, 255,
                                      cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            if np.mean(thresh) < 127:
                thresh = cv2.bitwise_not(thresh)

        # Add white padding around the image
        pad = 20
        thresh = cv2.copyMakeBorder(thresh, pad, pad, pad, pad,
                                    cv2.BORDER_CONSTANT, value=255)

        return thresh

    def extract_number(self, roi: np.ndarray, label: str = "",
                       last_known: int | None = None) -> int | None:
        """Run OCR on a preprocessed ROI and extract an integer with smart recovery.

        Uses multiple strategies:
        1. Template matching (if Tesseract unavailable or as fallback)
        2. Try different preprocessing methods with Tesseract
        3. Try multiple Tesseract PSM modes
        4. Smart recovery for common OCR errors
        5. Fallback to last known value

        Args:
            roi: Region of interest to process
            label: Label for debug output
            last_known: Last known score for this alliance (for validation)
        """
        result = None

        # Try template matching first if Tesseract not available
        if not TESSERACT_AVAILABLE and self.template_ocr:
            result = self.template_ocr.extract_number(roi, debug=self._debug)
            if result is not None:
                return result

        # Try Tesseract if available
        if TESSERACT_AVAILABLE:
            # Try multiple preprocessing strategies
            strategies = ["default", "adaptive", "morphology", "color"]
            all_results = []

            for strategy in strategies:
                processed = self.preprocess_for_ocr(roi, strategy=strategy)

                # Try multiple PSM modes
                for psm in [8, 7, 13, 6]:
                    custom_config = (f'--oem 3 --psm {psm} '
                                    f'-c tessedit_char_whitelist=0123456789')
                    try:
                        text = pytesseract.image_to_string(
                            Image.fromarray(processed), config=custom_config
                        ).strip()

                        if self._debug and strategy == "default":
                            print(f"  [DEBUG OCR] {label} psm={psm} "
                                  f"raw='{text}' repr={repr(text)}")

                        if text.isdigit() and len(text) > 0:
                            value = int(text)
                            all_results.append((value, strategy, psm))

                    except Exception as e:
                        if self._debug and strategy == "default":
                            print(f"  [DEBUG OCR] {label} psm={psm} error: {e}")

            if all_results:
                # Find most common result (voting)
                value_counts = Counter([v for v, _, _ in all_results])

                # Get candidates sorted by frequency
                candidates = []
                for value, count in value_counts.most_common():
                    # Apply smart recovery and validation
                    recovered = self._smart_recover(value, last_known, label)
                    if recovered is not None:
                        candidates.append((recovered, count))

                if candidates:
                    # Return most common valid result
                    best_value, _ = candidates[0]

                    # Log if we used a non-default strategy
                    for value, strategy, psm in all_results:
                        if value == best_value and strategy != "default" and self._debug:
                            print(f"  [OCR] {label} used {strategy} strategy: {best_value}")
                            break

                    return best_value

        # If Tesseract failed and we have template matching, try it as fallback
        if result is None and TESSERACT_AVAILABLE and self.template_ocr:
            result = self.template_ocr.extract_number(roi, debug=self._debug)
            if result is not None and self._debug:
                print(f"  [Template Fallback] {label} = {result}")

        return result

    def _smart_recover(self, value: int, last_known: int | None, label: str = "") -> int | None:
        """Apply smart recovery patterns to fix common OCR errors."""

        # If value is already plausible, return it
        if 0 <= value <= 300:
            return value

        # Pattern 1: Trailing zero (920 -> 92, 830 -> 83, 1230 -> 123)
        if value > 300:
            str_val = str(value)
            if str_val.endswith('0'):
                recovered = int(str_val[:-1])
                if 0 <= recovered <= 300:
                    if self._debug:
                        print(f"  [RECOVER] {label} {value} -> {recovered} (removed trailing 0)")
                    return recovered

        # Pattern 2: Extra leading digit (230 -> 23 or 30, 1200 -> 120 or 200)
        if value > 300:
            str_val = str(value)
            # Try removing first digit
            if len(str_val) >= 2:
                candidate1 = int(str_val[1:])
                if 0 <= candidate1 <= 300:
                    # Validate with last_known if available
                    if last_known is None or abs(candidate1 - last_known) <= 30:
                        if self._debug:
                            print(f"  [RECOVER] {label} {value} -> {candidate1} (removed first digit)")
                        return candidate1

            # Try removing last digit
            if len(str_val) >= 2:
                candidate2 = int(str_val[:-1])
                if 0 <= candidate2 <= 300:
                    if last_known is None or abs(candidate2 - last_known) <= 30:
                        if self._debug:
                            print(f"  [RECOVER] {label} {value} -> {candidate2} (removed last digit)")
                        return candidate2

        # Pattern 3: Doubled digits (882 -> 82, 775 -> 75)
        if value > 300:
            str_val = str(value)
            if len(str_val) == 3:
                # Check if first two digits are the same
                if str_val[0] == str_val[1]:
                    recovered = int(str_val[1:])
                    if 0 <= recovered <= 300:
                        if self._debug:
                            print(f"  [RECOVER] {label} {value} -> {recovered} (removed doubled digit)")
                        return recovered

        return None

    def extract_timer(self, roi: np.ndarray) -> str | None:
        """Extract match timer text (e.g., '2:15' or '1:30')."""
        processed = self.preprocess_for_ocr(roi)
        custom_config = r'--oem 3 --psm 7 -c tessedit_char_whitelist=0123456789:'

        try:
            text = pytesseract.image_to_string(
                Image.fromarray(processed), config=custom_config
            ).strip()
            if ':' in text:
                return text
        except Exception:
            pass

        return None

    def get_roi(self, frame: np.ndarray,
                x1: float, y1: float, x2: float, y2: float) -> np.ndarray:
        """Extract a region of interest from a frame using fractional coords."""
        h, w = frame.shape[:2]
        return frame[int(y1 * h):int(y2 * h), int(x1 * w):int(x2 * w)]

    def process_frame(self, frame: np.ndarray, timestamp: float,
                      match_phase: str | None = None) -> ScoreEvent:
        """Process a single frame and extract scores."""
        cfg = self.config

        red_roi = self.get_roi(frame, cfg.red_x1, cfg.red_y1,
                               cfg.red_x2, cfg.red_y2)
        blue_roi = self.get_roi(frame, cfg.blue_x1, cfg.blue_y1,
                                cfg.blue_x2, cfg.blue_y2)
        timer_roi = self.get_roi(frame, cfg.timer_x1, cfg.timer_y1,
                                 cfg.timer_x2, cfg.timer_y2)

        # Pass last_known values to help with OCR recovery
        red_score = self.extract_number(red_roi, label="RED", last_known=self.last_red)
        blue_score = self.extract_number(blue_roi, label="BLUE", last_known=self.last_blue)
        match_time = self.extract_timer(timer_roi)

        # During active match, scores should ALWAYS have a value
        # If OCR completely failed, use last known value
        if match_phase is not None:
            if red_score is None and self.last_red is not None:
                red_score = self.last_red
                if self._debug:
                    print(f"  [FALLBACK] Using last RED score: {red_score}")
            if blue_score is None and self.last_blue is not None:
                blue_score = self.last_blue
                if self._debug:
                    print(f"  [FALLBACK] Using last BLUE score: {blue_score}")

        # Use provided match_phase or detect from timer
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

        # Detect score changes
        self._detect_scoring(event)

        return event

    def _detect_scoring(self, event: ScoreEvent):
        """Compare with last known scores to detect scoring moments."""
        # Validate and filter implausible readings
        max_plausible = 300
        max_jump = 30  # max points in one sample interval

        for alliance, score, last in [
            ("red", event.red_score, self.last_red),
            ("blue", event.blue_score, self.last_blue),
        ]:
            if score is None:
                continue

            # Reject scores above max plausible
            if score > max_plausible:
                if self._debug:
                    print(f"\n  [FILTER] {alliance} {score} > "
                          f"{max_plausible}, rejected")
                if alliance == "red":
                    event.red_score = None
                else:
                    event.blue_score = None
                continue

            # Reject large upward jumps (likely OCR misread)
            if last is not None:
                diff = score - last
                if diff > max_jump:
                    if self._debug:
                        print(f"\n  [FILTER] {alliance} jump "
                              f"{last}->{score} (+{diff}), rejected")
                    if alliance == "red":
                        event.red_score = None
                    else:
                        event.blue_score = None
                    continue

                # Allow small decreases (fouls/penalties) but reject large drops (OCR errors)
                # FRC penalties are typically 3-15 points, rarely more than 20
                if diff < -20:  # Changed from rejecting all decreases
                    if self._debug:
                        print(f"\n  [FILTER] {alliance} large decrease "
                              f"{last}->{score} ({diff}), rejected")
                    if alliance == "red":
                        event.red_score = None
                    else:
                        event.blue_score = None
                    continue

        # Now record valid scoring events (including negative scoring from penalties)
        if event.red_score is not None and self.last_red is not None:
            diff = event.red_score - self.last_red
            if diff != 0:  # Record both positive and negative changes
                self.scoring_moments.append(ScoringMoment(
                    timestamp=event.timestamp,
                    alliance="red",
                    points_gained=diff,  # Can be negative for penalties
                    new_total=event.red_score,
                    match_time=event.match_time,
                    match_phase=event.match_phase,
                ))

        if event.blue_score is not None and self.last_blue is not None:
            diff = event.blue_score - self.last_blue
            if diff != 0:  # Record both positive and negative changes
                self.scoring_moments.append(ScoringMoment(
                    timestamp=event.timestamp,
                    alliance="blue",
                    points_gained=diff,  # Can be negative for penalties
                    new_total=event.blue_score,
                    match_time=event.match_time,
                    match_phase=event.match_phase,
                ))

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
        print(f"Exported {len(self.scoring_moments)} scoring events to {path}")

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
        """Print a summary of detected scoring events."""
        print(f"\n{'='*60}")
        print(f"Score Tracking Summary")
        print(f"{'='*60}")
        print(f"Total frames processed: {len(self.readings)}")
        print(f"Scoring events detected: {len(self.scoring_moments)}")

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


# ──────────────────────────────────────────────────────────────
# Match detection and smart sampling
# ──────────────────────────────────────────────────────────────

def find_match_start(source: str, config: ScoreRegionConfig,
                     debug: bool = False) -> float | None:
    """
    Two-pass approach to find exact match start:
    1. Sample middle of video to find any valid timer
    2. Estimate match start and search around that area for timer transition

    Timer behavior observed:
    - Pre-match: timer shows 0:00
    - Match starts: timer jumps to 0:14 (1 second into auto)
    - We look for this 0:00 → 0:14 transition or first appearance of 0:14/0:15

    Returns: Video timestamp (seconds) where match starts, or None if not found
    """
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print("ERROR: Could not open video source")
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if total_frames > 0 else 180  # assume 3min if unknown

    print(f"\nPhase 1: Finding match in video...")
    print(f"Video duration: ~{duration:.0f}s ({total_frames} frames @ {fps:.1f} fps)")

    tracker = ScoreTracker(config, debug=debug)

    # Step 1: Sample middle of video to find ANY timer
    middle_time = duration / 2
    search_start = max(0, middle_time - 30)  # Search ±30s around middle
    search_end = min(duration, middle_time + 30)

    print(f"Searching for timer around middle of video ({middle_time:.0f}s ± 30s)...")

    first_timer_found = None
    first_timer_value = None
    current_time = search_start

    while current_time <= search_end:
        frame_num = int(current_time * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = cap.read()

        if not ret:
            current_time += INITIAL_SAMPLE_INTERVAL
            continue

        timer_roi = tracker.get_roi(frame, config.timer_x1, config.timer_y1,
                                   config.timer_x2, config.timer_y2)
        match_time = tracker.extract_timer(timer_roi)
        timer_secs = tracker.parse_timer(match_time)

        if match_time and ':' in match_time and timer_secs is not None:
            first_timer_found = current_time
            first_timer_value = timer_secs
            print(f"  Found timer '{match_time}' ({timer_secs}s) at t={current_time:.1f}s")
            break

        current_time += INITIAL_SAMPLE_INTERVAL

    if first_timer_found is None:
        print("ERROR: Could not find match timer in video")
        cap.release()
        return None

    # Step 2: Estimate match start and search around that area
    # If we found timer at X seconds showing T seconds remaining:
    # - If T > 15s, we're in teleop, match started ~(135 - T) seconds ago
    # - If T <= 15s, we're in auto, match started ~(15 - T) seconds ago

    if first_timer_value > MATCH_AUTO_DURATION:
        # We're in teleop
        elapsed_in_teleop = MATCH_TELEOP_DURATION - first_timer_value
        time_since_match_start = MATCH_AUTO_DURATION + MATCH_TRANSITION_DURATION + elapsed_in_teleop
        estimated_match_start = first_timer_found - time_since_match_start
        print(f"\nPhase 2: Timer shows teleop ({first_timer_value}s)")
        print(f"  Estimating match started ~{time_since_match_start:.0f}s ago")
        print(f"  Estimated match start: t={estimated_match_start:.1f}s")
    else:
        # We're in auto
        elapsed_in_auto = MATCH_AUTO_DURATION - first_timer_value
        estimated_match_start = first_timer_found - elapsed_in_auto
        print(f"\nPhase 2: Timer shows auto ({first_timer_value}s)")
        print(f"  Estimating match started ~{elapsed_in_auto:.0f}s ago")
        print(f"  Estimated match start: t={estimated_match_start:.1f}s")

    # Step 3: Search around estimated start for timer transition
    # Look for: 0:00 → 0:14/0:15 transition or first appearance of 0:14/0:15
    search_start = max(0, estimated_match_start - 10)  # ±10s window
    search_end = estimated_match_start + 10

    print(f"  Searching for match start in window {search_start:.1f}s - {search_end:.1f}s...")

    # Scan at 0.5s intervals first to find general area
    current_time = search_start
    transition_candidates = []

    while current_time <= search_end:
        frame_num = int(current_time * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = cap.read()

        if not ret:
            current_time += 0.5
            continue

        timer_roi = tracker.get_roi(frame, config.timer_x1, config.timer_y1,
                                   config.timer_x2, config.timer_y2)
        match_time = tracker.extract_timer(timer_roi)
        timer_secs = tracker.parse_timer(match_time)

        if timer_secs is not None:
            # Look for timer showing 0:14 or 0:15 (start of auto)
            if 13 <= timer_secs <= 15:
                transition_candidates.append((current_time, timer_secs, match_time))
                if debug:
                    print(f"    Candidate: t={current_time:.1f}s, timer={match_time}")

        current_time += 0.5

    cap.release()

    if transition_candidates:
        # Use the earliest candidate (should be closest to actual start)
        best_match_start, best_timer_value, best_timer_str = transition_candidates[0]
        print(f"\n✓ Match start detected at t={best_match_start:.1f}s (timer={best_timer_str})")
        return best_match_start
    else:
        # Fallback: use estimated start
        print(f"\n⚠ Could not find timer transition, using estimate t={estimated_match_start:.1f}s")
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
# Video source helpers
# ──────────────────────────────────────────────────────────────

def get_stream_url(youtube_url: str) -> str:
    """Use yt-dlp to get a direct stream URL for OpenCV."""
    print(f"Resolving stream URL for: {youtube_url}")
    try:
        result = subprocess.run(
            [
                'yt-dlp',
                '--js-runtimes', 'deno',
                '--remote-components', 'ejs:github',
                '--cookies', 'cookies.txt',
                '-f', 'best[height>=720]/best',
                '-g',
                youtube_url,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        url = result.stdout.strip()
        print(f"Got stream URL (length {len(url)})")
        return url
    except FileNotFoundError:
        print("ERROR: yt-dlp not found. Install it: pip install yt-dlp")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: yt-dlp failed: {e.stderr}")
        sys.exit(1)


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
# Main processing with smart sampling
# ──────────────────────────────────────────────────────────────

def process_video_smart(source: str, config: ScoreRegionConfig,
                        sample_interval: float = 1.0,
                        output_prefix: str = "frc_scores",
                        show_preview: bool = False,
                        debug: bool = False):
    """
    Smart two-pass video processing:
    1. Find match start by sampling middle of video
    2. Process only during active match phases at specified interval
    """

    # Phase 1: Find match start
    match_start = find_match_start(source, config, debug=debug)
    if match_start is None:
        print("ERROR: Could not detect match start. Try --calibrate to verify regions.")
        return

    # Calculate phase boundaries
    boundaries = calculate_match_boundaries(match_start)

    print(f"\n{'='*60}")
    print(f"Match Phase Boundaries (video timestamps)")
    print(f"{'='*60}")
    print(f"Auto start:      {boundaries.match_start:.1f}s")
    print(f"Auto end:        {boundaries.auto_end:.1f}s")
    print(f"Transition:      {boundaries.auto_end:.1f}s - {boundaries.teleop_start:.1f}s")
    print(f"Teleop start:    {boundaries.teleop_start:.1f}s")
    print(f"Teleop end:      {boundaries.teleop_end:.1f}s")
    print(f"Total duration:  {boundaries.teleop_end - boundaries.match_start:.1f}s")
    print(f"{'='*60}\n")

    # Phase 2: Process match with dense sampling
    tracker = ScoreTracker(config, debug=debug)

    if debug:
        debug_dir = Path("debug_frames")
        debug_dir.mkdir(exist_ok=True)
        print(f"Debug mode: saving ROI images to {debug_dir}/")

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print("ERROR: Could not open video source")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"\nPhase 3: Processing match...")
    print(f"Stream resolution: {frame_w}x{frame_h}")
    print(f"Sampling interval: {sample_interval}s")
    print(f"Video FPS: {fps:.1f}")
    print("Press Ctrl+C to stop early\n")

    processed = 0

    # Define sampling windows: (start_time, end_time, phase_name)
    sampling_windows = [
        (boundaries.match_start, boundaries.auto_end, "auto"),
        (boundaries.auto_end, boundaries.teleop_start, "transition"),
        (boundaries.teleop_start, boundaries.teleop_end, "teleop"),
    ]

    try:
        for window_start, window_end, phase in sampling_windows:
            print(f"\nProcessing {phase.upper()} phase "
                  f"({window_start:.1f}s - {window_end:.1f}s)...")

            current_time = window_start

            while current_time <= window_end:
                frame_num = int(current_time * fps)
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
                ret, frame = cap.read()

                if not ret:
                    print(f"\n  Warning: Could not read frame at t={current_time:.1f}s")
                    current_time += sample_interval
                    continue

                event = tracker.process_frame(frame, current_time, match_phase=phase)
                processed += 1

                # Save debug images for first few frames of each phase
                if debug and processed <= 3:
                    cfg = config
                    h, w = frame.shape[:2]
                    red_roi = tracker.get_roi(frame, cfg.red_x1, cfg.red_y1,
                                              cfg.red_x2, cfg.red_y2)
                    blue_roi = tracker.get_roi(frame, cfg.blue_x1, cfg.blue_y1,
                                               cfg.blue_x2, cfg.blue_y2)
                    timer_roi = tracker.get_roi(frame, cfg.timer_x1, cfg.timer_y1,
                                                cfg.timer_x2, cfg.timer_y2)

                    cv2.imwrite(str(debug_dir / f"{phase}_f{processed:03d}_red_raw.png"), red_roi)
                    cv2.imwrite(str(debug_dir / f"{phase}_f{processed:03d}_blue_raw.png"), blue_roi)
                    cv2.imwrite(str(debug_dir / f"{phase}_f{processed:03d}_timer_raw.png"), timer_roi)
                    cv2.imwrite(str(debug_dir / f"{phase}_f{processed:03d}_red_processed.png"),
                                tracker.preprocess_for_ocr(red_roi))
                    cv2.imwrite(str(debug_dir / f"{phase}_f{processed:03d}_blue_processed.png"),
                                tracker.preprocess_for_ocr(blue_roi))

                # Print live updates
                status = (f"\r  t={current_time:>7.1f}s  "
                          f"Red: {event.red_score or '?':>4}  "
                          f"Blue: {event.blue_score or '?':>4}  "
                          f"Timer: {event.match_time or '?':>6}  "
                          f"Events: {len(tracker.scoring_moments)}")
                print(status, end='', flush=True)

                if show_preview:
                    cfg = config
                    h, w = frame.shape[:2]
                    display = frame.copy()
                    # Draw score regions
                    cv2.rectangle(display,
                                  (int(cfg.red_x1 * w), int(cfg.red_y1 * h)),
                                  (int(cfg.red_x2 * w), int(cfg.red_y2 * h)),
                                  (0, 0, 255), 2)
                    cv2.rectangle(display,
                                  (int(cfg.blue_x1 * w), int(cfg.blue_y1 * h)),
                                  (int(cfg.blue_x2 * w), int(cfg.blue_y2 * h)),
                                  (255, 0, 0), 2)
                    # Show scores
                    cv2.putText(display,
                                f"R:{event.red_score or '?'} "
                                f"B:{event.blue_score or '?'} "
                                f"[{phase}]",
                                (10, 30), cv2.FONT_HERSHEY_SIMPLEX,
                                1, (0, 255, 0), 2)
                    cv2.imshow('Score Tracker', display)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break

                current_time += sample_interval

    except KeyboardInterrupt:
        print("\n\nStopped by user.")

    cap.release()
    if show_preview:
        cv2.destroyAllWindows()

    print(f"\n\nProcessed {processed} frames across "
          f"{boundaries.teleop_end - boundaries.match_start:.1f}s of match")

    # Export results
    tracker.export_csv(f"{output_prefix}_events.csv")
    tracker.export_readings_csv(f"{output_prefix}_readings.csv")
    tracker.print_summary()


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FRC Match Score Tracker via OCR (V2 - Smart Sampling)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Track scores from a YouTube video (auto-detects match start)
  python frc_score_tracker_v2.py --url "https://youtube.com/watch?v=..."

  # Track from a local file, with preview
  python frc_score_tracker_v2.py --file match.mp4 --preview

  # Calibrate score regions
  python frc_score_tracker_v2.py --url "https://..." --calibrate

  # Faster sampling (every 0.5s) for high-frequency scoring
  python frc_score_tracker_v2.py --file match.mp4 --interval 0.5

Match Phase Configuration:
  Edit these global variables at the top of the script:
  - MATCH_AUTO_DURATION = 15       (auto period in seconds)
  - MATCH_TRANSITION_DURATION = 3  (dead time between auto/teleop)
  - MATCH_TELEOP_DURATION = 135    (teleop period in seconds)
        """
    )

    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument('--url', help='YouTube URL (video or livestream)')
    source_group.add_argument('--file', help='Local video file path')

    parser.add_argument('--interval', type=float, default=1.0,
                        help='Seconds between frame samples during match (default: 1.0)')
    parser.add_argument('--output', default='frc_scores',
                        help='Output CSV prefix (default: frc_scores)')
    parser.add_argument('--preview', action='store_true',
                        help='Show live preview window')
    parser.add_argument('--debug', action='store_true',
                        help='Save debug images of cropped ROIs to debug_frames/')
    parser.add_argument('--calibrate', action='store_true',
                        help='Enter calibration mode to find score regions')

    # Allow overriding score regions from CLI
    parser.add_argument('--red-region', type=float, nargs=4,
                        metavar=('X1', 'Y1', 'X2', 'Y2'),
                        help='Red score region as fractions')
    parser.add_argument('--blue-region', type=float, nargs=4,
                        metavar=('X1', 'Y1', 'X2', 'Y2'),
                        help='Blue score region as fractions')

    args = parser.parse_args()

    # Resolve video source
    if args.url:
        source = get_stream_url(args.url)
    else:
        source = args.file
        if not Path(source).exists():
            print(f"ERROR: File not found: {source}")
            sys.exit(1)

    # Calibration mode
    if args.calibrate:
        calibration_mode(source)
        return

    # Build config
    config = ScoreRegionConfig()
    if args.red_region:
        config.red_x1, config.red_y1, config.red_x2, config.red_y2 = \
            args.red_region
    if args.blue_region:
        config.blue_x1, config.blue_y1, config.blue_x2, config.blue_y2 = \
            args.blue_region

    # Run smart processing
    process_video_smart(
        source=source,
        config=config,
        sample_interval=args.interval,
        output_prefix=args.output,
        show_preview=args.preview,
        debug=args.debug,
    )


if __name__ == '__main__':
    main()