@echo off
setlocal
cd /d "%~dp0"
REM ============================================================
REM  Build PIK-R ID Card Generator -> dist\PIKR-IDCard-Generator.exe
REM
REM  PySide6 & onnxruntime hanya mendukung Python 3.10 - 3.13. Kalau komputer hanya
REM  punya Python lain (mis. 3.15), skrip ini mengambil Python 3.12 sendiri lewat "uv"
REM  (portabel, tidak mengubah Python bawaan komputer).
REM ============================================================

set "ROOT=%~dp0..\.tools"
set "UV=%ROOT%\uv\uv.exe"
set "PYEXE="

REM 1) Python 3.10-3.13 yang sudah terpasang
for %%V in (3.12 3.11 3.13 3.10) do (
    if not defined PYEXE (
        py -%%V -c "import sys" >nul 2>&1 && set "PYEXE=py -%%V"
    )
)

REM 2) Python portabel hasil unduhan sebelumnya
if not defined PYEXE (
    for /d %%D in ("%ROOT%\python\cpython-3.12*") do (
        if exist "%%D\python.exe" set "PYEXE="%%D\python.exe""
    )
)

REM 3) Unduh Python 3.12 lewat uv
if not defined PYEXE (
    if not exist "%UV%" (
        echo [INFO] Mengunduh uv ^(pengelola Python portabel^)...
        if not exist "%ROOT%\dl" mkdir "%ROOT%\dl"
        powershell -NoProfile -Command "Invoke-WebRequest -Uri https://github.com/astral-sh/uv/releases/download/0.5.11/uv-x86_64-pc-windows-msvc.zip -OutFile '%ROOT%\dl\uv.zip'; Expand-Archive -Force '%ROOT%\dl\uv.zip' '%ROOT%\uv'"
    )
    if not exist "%UV%" goto :nopython
    echo [INFO] Mengunduh Python 3.12 ^(sekali saja, sekitar 30 MB^)...
    set "UV_PYTHON_INSTALL_DIR=%ROOT%\python"
    "%UV%" python install 3.12
    for /d %%D in ("%ROOT%\python\cpython-3.12*") do (
        if exist "%%D\python.exe" set "PYEXE="%%D\python.exe""
    )
)

if not defined PYEXE goto :nopython
echo [INFO] Memakai: %PYEXE%
%PYEXE% --version

REM .venv lama yang dibuat dengan Python di luar 3.10 - 3.13 (mis. 3.15) harus dibuat ulang;
REM kalau tidak, pip memakai Python itu dan paket seperti onnxruntime "tidak ditemukan".
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)" >nul 2>&1
    if errorlevel 1 (
        echo [INFO] .venv lama memakai Python yang tidak didukung, dibuat ulang...
        rmdir /s /q ".venv"
    )
)

if not exist ".venv\Scripts\python.exe" (
    echo [1/4] Membuat virtual environment...
    %PYEXE% -m venv .venv
    if errorlevel 1 goto :fail
)
set "VPY=%~dp0.venv\Scripts\python.exe"
echo [INFO] venv:
"%VPY%" --version

echo [2/4] Memasang paket ^(unduhan besar, sabar; bisa diulang bila terputus^)...
set PIP_DEFAULT_TIMEOUT=300
"%VPY%" -m pip install --upgrade pip
"%VPY%" -m pip install -r requirements.txt
if errorlevel 1 goto :fail

echo [3/4] Menjalankan tes inti...
"%VPY%" test_core.py
if errorlevel 1 goto :fail

echo [4/4] Membuat .exe ...
"%VPY%" -m PyInstaller --noconfirm --onefile --windowed --name "PIKR-IDCard-Generator" --collect-all rapidocr_onnxruntime app.py
if errorlevel 1 goto :fail

echo.
echo Selesai: %~dp0dist\PIKR-IDCard-Generator.exe
pause
exit /b 0

:nopython
echo.
echo [ERROR] Python 3.10 - 3.13 tidak tersedia dan unduhan otomatis gagal.
echo         Pasang manual Python 3.12 dari https://www.python.org/downloads/release/python-3128/
echo         ^(centang "Add python.exe to PATH"^), lalu jalankan build.bat lagi.
pause
exit /b 1

:fail
echo.
echo [GAGAL] Lihat pesan di atas. Bila terputus saat mengunduh, jalankan build.bat lagi.
pause
exit /b 1
