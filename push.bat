@echo off
REM Push script for Windows - uses stored GitHub credentials
REM Ensure you've run setup-github.bat first to configure credentials

echo === Pushing to GitHub ===

REM Stage all changes
git add .

REM Commit with timestamp
git commit -m "Update: %date% %time%" 2>nul || (
  echo Nothing to commit
)

REM Push to origin
git push -u origin main

if errorlevel 1 (
  echo ERROR: Push failed. Check your credentials with setup-github.bat
  pause
  exit /b 1
) else (
  echo Push completed successfully!
  pause
)
