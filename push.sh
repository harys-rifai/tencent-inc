#!/bin/bash
# Push script - uses stored GitHub credentials
# Ensure you've run ./setup-github.sh first to configure your credentials

set -e

echo "=== Pushing to GitHub ==="

# Ensure we're on main branch
git branch -M main

# Add all changes
git add .

# Commit with timestamp
git commit -m "Update: $(date '+%Y-%m-%d %H:%M:%S')" || echo "Nothing to commit"

# Push to origin
git push -u origin main

echo "✓ Push completed successfully!"