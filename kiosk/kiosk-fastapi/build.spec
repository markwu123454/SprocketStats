# fastapi.spec
# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_submodules

hidden = (
    collect_submodules("sklearn")
    + collect_submodules("joblib")
    + collect_submodules("uvicorn")
    + collect_submodules("asyncpg")
)

a = Analysis(
    ["run.py"],
    pathex=["."],
    binaries=[],
    datas=[
        ("seasons", "seasons"),
        (".env.example", ".env"),
    ],
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "ttkbootstrap",
        "matplotlib",
    ],
    noarchive=False,
    optimize=1,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="fastapi",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    #console=False,   # no console for kiosk
)
