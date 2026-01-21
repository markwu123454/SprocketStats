import subprocess
import threading
import os
import sys


def stream_output(process, name):
    try:
        for line in iter(process.stdout.readline, b''):
            print(f"[{name}] {line.decode().rstrip()}")
    except Exception:
        pass
    finally:
        process.stdout.close()


def run_process(name, cmd, cwd):
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        shell=(sys.platform == "win32")
    )
    thread = threading.Thread(target=stream_output, args=(proc, name), daemon=True)
    thread.start()
    return proc


def terminate_process(proc, name):
    if proc.poll() is None:
        print(f"Terminating {name}...")
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            print(f"Forcing kill on {name}")
            proc.kill()


def main(mode):
    project_root = os.path.abspath(os.path.dirname(__file__))
    frontend_dir = os.path.join(project_root, "frontend")
    backend_dir = os.path.join(project_root, "backend")

    if mode == "dev":
        frontend_proc = run_process("FRONTEND_DEV", ["npm", "run", "dev"], frontend_dir)
    elif mode == "prod":
        build_proc = run_process("FRONTEND_BUILD", ["npm", "run", "build"], frontend_dir)
        build_proc.wait()
        frontend_proc = run_process(
            "FRONTEND_SERVE",
            ["npx", "serve", "dist", "-s", "--listen", "4173"],
            frontend_dir
        )

    else:
        print("Usage: python run.py [dev|prod]")
        sys.exit(1)

    # removed , "--reload"
    backend_proc = run_process("BACKEND", ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"], backend_dir)

    try:
        frontend_proc.wait()
        backend_proc.wait()
    except KeyboardInterrupt:
        terminate_process(frontend_proc, "FRONTEND")
        terminate_process(backend_proc, "BACKEND")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python run.py [dev|prod]")
        sys.exit(1)

    main(sys.argv[1].lower())
