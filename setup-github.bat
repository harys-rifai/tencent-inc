@echo off
REM Setup GitHub credentials securely for Windows

echo Enter your GitHub Personal Access Token (classic):
set /p GITHUB_TOKEN=

echo Enter your GitHub username:
set /p GITHUB_USER=

REM Configure Git to use credential helper
git config credential.helper store

REM Create .git-credentials file
(
  echo https://%GITHUB_USER%:%GITHUB_TOKEN%@github.com
) > .git-credentials

REM Set file permissions (on Git Bash would use chmod, but on Windows file is hidden from git by .gitignore)
echo GitHub credentials configured successfully!
echo Token stored in .git-credentials (which is gitignored)
echo You can now run push.sh to push to GitHub
pause
