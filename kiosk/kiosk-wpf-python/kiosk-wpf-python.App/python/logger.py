import sys


class Logger:
    """
    Hierarchical logger with ANSI formatting and indentation support.

    Features:
    - Automatic indentation tracking
    - Context managers for nested sections
    - Semantic log levels (header, step, substep, success, warn, error)
    - Statistics and key-value logging
    """

    # ANSI codes
    RESET   = "\x1b[0m"
    BOLD    = "\x1b[1m"
    DIM     = "\x1b[38;5;245m"
    RED     = "\x1b[1;31m"
    GREEN   = "\x1b[1;32m"
    YELLOW  = "\x1b[1;33m"
    BLUE    = "\x1b[1;34m"
    MAGENTA = "\x1b[1;35m"
    PURPLE  = "\x1b[38;2;145;92;201m"
    CYAN    = "\x1b[1;36m"
    WHITE   = "\x1b[1;37m"

    BAR = "=" * 44

    def __init__(self):
        self.indent_level = 0
        self.indent_size = 2

    def _write(self, text, end="\n"):
        """Write to stderr with current indentation."""
        indent = " " * (self.indent_level * self.indent_size)
        sys.stderr.write(indent + text + end)
        sys.stderr.flush()

    def raw(self, *args, sep=" ", end="\n"):
        """Print-like interface without indentation."""
        text = sep.join(map(str, args))
        if text or end.strip():
            sys.stderr.write(text + end)
            sys.stderr.flush()

    def header(self, title):
        """Print a prominent section header."""
        self.raw(f"\n{self.PURPLE}{self.BAR}")
        self.raw(f"  {title}")
        self.raw(f"{self.PURPLE}{self.BAR}{self.RESET}")
        self.indent_level = 0

    def step(self, msg):
        """Print a top-level action step."""
        self._write(f"{self.BLUE}>{self.RESET} {msg}")

    def substep(self, msg):
        """Print an indented sub-detail."""
        self._write(f"{self.DIM}|_{self.RESET} {msg}")

    def stat(self, label, value):
        """Print a key -> value statistic."""
        self._write(f"{self.DIM}{label}:{self.RESET} {self.YELLOW}{value}{self.RESET}")

    def success(self, msg):
        """Print a success message."""
        self._write(f"{self.GREEN}[OK]{self.RESET} {msg}")

    def warn(self, msg):
        """Print a warning message."""
        self._write(f"{self.YELLOW}[!!]{self.RESET} {msg}")

    def error(self, msg):
        """Print an error message."""
        self._write(f"{self.RED}[ERR]{self.RESET} {msg}")

    def done(self, summary=None):
        """Print a section footer."""
        if summary:
            self.raw(f"\n{self.GREEN}{self.BAR}")
            self.raw(f"  [OK] Done -- {summary}")
            self.raw(f"{self.GREEN}{self.BAR}{self.RESET}\n")
        else:
            self.raw(f"\n{self.GREEN}{self.BAR}")
            self.raw(f"  [OK] Done")
            self.raw(f"{self.BAR}{self.RESET}\n")
        self.indent_level = 0

    def indent(self, levels=1):
        """Increase indentation level."""
        self.indent_level += levels
        return self

    def dedent(self, levels=1):
        """Decrease indentation level."""
        self.indent_level = max(0, self.indent_level - levels)
        return self

    def section(self, title=None):
        """Context manager for indented sections."""
        return LogSection(self, title)

    def banner(self):
        """Print the application banner."""
        self.raw(f"{self.PURPLE} $$$$$$\\  $$$$$$$\\  $$$$$$$\\   $$$$$$\\   $$$$$$\\  $$\\   $$\\ $$$$$$$$\\ $$$$$$$$\\   $$$$$$\\ $$$$$$$$\\  $$$$$$\\ $$$$$$$$\\  $$$$$$\\  {self.RESET}")
        self.raw(f"{self.PURPLE}$$  __$$\\ $$  __$$\\ $$  __$$\\ $$  __$$\\ $$  __$$\\ $$ | $$  |$$  _____|\\__$$  __| $$  __$$\\\\__$$  __|$$  __$$\\\\__$$  __|$$  __$$\\ {self.RESET}")
        self.raw(f"{self.PURPLE}$$ /  \\__|$$ |  $$ |$$ |  $$ |$$ /  $$ |$$ /  \\__|$$ |$$  / $$ |         $$ |    $$ /  \\__|  $$ |   $$ /  $$ |  $$ |   $$ /  \\__|{self.RESET}")
        self.raw(f"{self.PURPLE}\\$$$$$$\\  $$$$$$$  |$$$$$$$  |$$ |  $$ |$$ |      $$$$$  /  $$$$$\\       $$ |    \\$$$$$$\\    $$ |   $$$$$$$$ |  $$ |   \\$$$$$$\\  {self.RESET}")
        self.raw(f"{self.PURPLE} \\____$$\\ $$  ____/ $$  __$$< $$ |  $$ |$$ |      $$  $$<   $$  __|      $$ |     \\____$$\\   $$ |   $$  __$$ |  $$ |    \\____$$\\ {self.RESET}")
        self.raw(f"{self.PURPLE}$$\\   $$ |$$ |      $$ |  $$ |$$ |  $$ |$$ |  $$\\ $$ |\\$$\\  $$ |         $$ |    $$\\   $$ |  $$ |   $$ |  $$ |  $$ |   $$\\   $$ |{self.RESET}")
        self.raw(f"{self.PURPLE}\\$$$$$$  |$$ |      $$ |  $$ | $$$$$$  |\\$$$$$$  |$$ | \\$$\\ $$$$$$$$\\    $$ |    \\$$$$$$  |  $$ |   $$ |  $$ |  $$ |   \\$$$$$$  |{self.RESET}")
        self.raw(f"{self.PURPLE} \\______/ \\__|      \\__|  \\__| \\______/  \\______/ \\__|  \\__|\\________|   \\__|     \\______/   \\__|   \\__|  \\__|  \\__|    \\______/ {self.RESET}")


class LogSection:
    """Context manager for indented log sections."""

    def __init__(self, logger, title=None):
        self.logger = logger
        self.title = title

    def __enter__(self):
        if self.title:
            self.logger.step(self.title)
        self.logger.indent()
        return self.logger

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.logger.dedent()
        return False


class ProgressBar:
    """
    ASCII progress bar with dynamic per-update text.
    """

    def __init__(self, logger, total, width=30, prefix=None):
        self.logger = logger
        self.total = max(1, total)
        self.width = width
        self.prefix = prefix or ""
        self.current = 0
        self.message = ""
        self._last_len = 0

    def update(self, value, message=None):
        self.current = min(value, self.total)
        if message is not None:
            self.message = str(message)
        self._render()

    def advance(self, step=1, message=None):
        self.update(self.current + step, message)

    def _render(self):
        ratio = self.current / self.total
        filled = int(self.width * ratio)
        bar = "#" * filled + "-" * (self.width - filled)
        percent = int(ratio * 100)

        indent = " " * (self.logger.indent_level * self.logger.indent_size)

        parts = []
        if self.prefix:
            parts.append(self.prefix)
        parts.append(f"[{bar}]")
        parts.append(f"{percent:3d}%")
        if self.message:
            parts.append(f"- {self.message}")

        line = indent + " ".join(parts)

        # ANSI-safe overwrite - move to start first, then clear, then write
        sys.stderr.write("\x1b[A\r\x1b[K")
        sys.stderr.write(line)
        sys.stderr.flush()

        self._last_len = len(line)

        if self.current >= self.total:
            sys.stderr.write("\n")
            sys.stderr.flush()

