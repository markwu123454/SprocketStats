# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('seasons', 'seasons'),
        ('.env.example', '.env'),
    ],
    hiddenimports=[
        'pandas',
        'numpy',
        'asyncpg',
        'ttkbootstrap',
        'certifi',
        'sklearn',
        'sklearn.ensemble._forest',
        'sklearn.tree._classes',
        'sklearn.utils._joblib',
        'joblib',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
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
    name='sprocketstat-analytics',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    codesign_identity="SprocketStats",
)
