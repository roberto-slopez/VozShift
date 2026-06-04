"""
Dev launcher for VozShift.

Run this instead of the bare `uvicorn ... --reload` command on Windows.

    py backend\run.py

Why this exists
---------------
On Windows, uvicorn's --reload worker is created with the multiprocessing
"spawn" start method. Spawn re-imports the __main__ module to locate its
target. When __main__ is the `uvicorn.exe` console script, re-running it calls
main() again and starts a SECOND reloader while the process is still
bootstrapping, raising:

    RuntimeError: An attempt has been made to start a new process before the
    current process has finished its bootstrapping phase.

Guarding the entry point with `if __name__ == "__main__":` (the idiom the error
message itself recommends) prevents the recursive spawn: when spawn re-imports
this file as "__mp_main__", the guarded block simply does not run.
"""

from pathlib import Path

if __name__ == "__main__":
    import uvicorn

    backend_dir = Path(__file__).resolve().parent

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        app_dir=str(backend_dir),
        reload_dirs=[str(backend_dir)],
    )
