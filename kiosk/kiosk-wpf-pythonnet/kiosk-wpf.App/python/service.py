import sys

busy = False
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


def set_busy(value: bool):
    global busy
    busy = value
    print(f"Busy set to {value}")


def is_busy() -> bool:
    return busy


def run_calculation(path: str) -> str:
    print(f"Running calculation on {path}")
    print("This is a normal print()")
    return f"Processed {path}"
