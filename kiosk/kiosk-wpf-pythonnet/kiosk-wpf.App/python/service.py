import sys
import time
import traceback

_log = None


class _CSharpStdout:
    def write(self, text):
        if _log and text.strip():
            _log(text.rstrip())

    def flush(self):
        pass  # required by file-like interface


def register_logger(cb):
    global _log
    _log = cb

    # Redirect stdout and stderr
    sys.stdout = _CSharpStdout()
    sys.stderr = _CSharpStdout()


def log(msg: str):
    if _log:
        _log(msg)


def run_calculation(path: str) -> str:
    print(f"Running calculation on {path}")
    print("This is a normal print()")
    time.sleep(5)
    return f"Processed {path}"


def exec_command(code: str):
    """
    Execute arbitrary Python code using full global and local scope.
    Exceptions are caught and printed with a red ANSI traceback.
    """
    try:
        # Use module globals so state persists across calls
        exec(code, globals(), globals())
    except Exception:
        print(f"\x1b[31m{traceback.format_exc()}\x1b[0m")


_set_busy_cb = None


def register_set_busy(cb):
    global _set_busy_cb
    _set_busy_cb = cb


def set_busy(value: bool):
    if _set_busy_cb:
        _set_busy_cb(value)
