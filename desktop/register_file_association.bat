@echo off
:: Registers .sigil file association for the current user
echo [*] Registering .sigil file association with SIGIL Reader...

set PYTHON_EXE=%~dp0..\.venv\Scripts\python.exe
if not exist "%PYTHON_EXE%" (
    set PYTHON_EXE=python
)
set LAUNCHER_PY=%~dp0sigil_reader.py

set EXE_PATH=%~dp0dist\SigilReader\SigilReader.exe
if exist "%EXE_PATH%" (
    reg add "HKCU\Software\Classes\.sigil" /ve /d "SIGIL.Document" /f
    reg add "HKCU\Software\Classes\SIGIL.Document" /ve /d "SIGIL Post-Quantum Encrypted Document" /f
    reg add "HKCU\Software\Classes\SIGIL.Document\DefaultIcon" /ve /d "shell32.dll,48" /f
    reg add "HKCU\Software\Classes\SIGIL.Document\shell\open\command" /ve /d "\"%EXE_PATH%\" \"%%1\"" /f
    echo [+] Registered compiled binary: %EXE_PATH%
) else (
    reg add "HKCU\Software\Classes\.sigil" /ve /d "SIGIL.Document" /f
    reg add "HKCU\Software\Classes\SIGIL.Document" /ve /d "SIGIL Post-Quantum Encrypted Document" /f
    reg add "HKCU\Software\Classes\SIGIL.Document\DefaultIcon" /ve /d "shell32.dll,48" /f
    reg add "HKCU\Software\Classes\SIGIL.Document\shell\open\command" /ve /d "\"%PYTHON_EXE%\" \"%LAUNCHER_PY%\" \"%%1\"" /f
    echo [+] Registered Python launcher: %LAUNCHER_PY%
)

echo [SUCCESS] .sigil files are now associated with SIGIL Reader!
echo Double-clicking any .sigil file will automatically launch SIGIL Reader.
pause
