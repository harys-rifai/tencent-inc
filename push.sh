#!/bin/bash
# Clear any stale GitHub credentials
cmdkey /delete:git:https://github.com 2>/dev/null || true
git config --global credential.helper manager-core

git remote add origin https://github.com/harys-rifai/tencent-inc.git 2>/dev/null || git remote set-url origin https://github.com/harys-rifai/tencent-inc.git
git branch -M main
git push -u origin main