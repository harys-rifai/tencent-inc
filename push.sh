#!/bin/bash

git remote add origin https://github.com/harys-rifai/tencent-inc.git 2>/dev/null || echo "Remote already exists, skipping..."
git branch -M main
git push -u origin main