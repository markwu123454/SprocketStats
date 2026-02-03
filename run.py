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


def get_lan_ip():
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]


def main(mode):
    project_root = os.path.abspath(os.path.dirname(__file__))
    frontend_dir = os.path.join(project_root, "frontend")
    backend_dir = os.path.join(project_root, "backend")

    if mode == "dev":
        frontend_proc = run_process("FRONTEND_DEV", ["npm", "run", "dev"], frontend_dir)

        lan_ip = get_lan_ip()
        print(f"[BACKEND] Starting on http://127.0.0.1:8000 and http://{lan_ip}:8000")

        backend_localhost = run_process(
            "BACKEND_LOCAL",
            ["uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--workers", "1", "--reload"],
            backend_dir
        )
        backend_lan = run_process(
            "BACKEND_LAN",
            ["uvicorn", "main:app", "--host", lan_ip, "--port", "8000", "--workers", "1", "--reload"],
            backend_dir
        )

    elif mode == "prod":
        build_proc = run_process("FRONTEND_BUILD", ["npm", "run", "build"], frontend_dir)
        build_proc.wait()
        frontend_proc = run_process(
            "FRONTEND_SERVE",
            ["npx", "serve", "dist", "-s", "--listen", "4173"],
            frontend_dir
        )

        backend_localhost = run_process(
            "BACKEND",
            ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"],
            backend_dir
        )
        backend_lan = None

    else:
        print("Usage: python run.py [dev|prod]")
        sys.exit(1)

    try:
        frontend_proc.wait()
        backend_localhost.wait()
        if backend_lan:
            backend_lan.wait()
    except KeyboardInterrupt:
        terminate_process(frontend_proc, "FRONTEND")
        terminate_process(backend_localhost, "BACKEND_LOCAL")
        if backend_lan:
            terminate_process(backend_lan, "BACKEND_LAN")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python run.py [dev|prod]")
        sys.exit(1)

    main(sys.argv[1].lower())