#!/bin/bash
# Setup GitHub credentials securely
# Run this script once to configure your GitHub token

echo "Enter your GitHub Personal Access Token (classic):"
read -s GITHUB_TOKEN

echo "Enter your GitHub username:"
read GITHUB_USER

# Store credentials in Git's credential helper (persistent)
git config credential.helper store

# Save credentials to ~/.git-credentials (or local .git-credentials)
cat > .git-credentials << EOF
https://$GITHUB_USER:$GITHUB_TOKEN@github.com
EOF

chmod 600 .git-credentials

echo "GitHub credentials configured successfully!"
echo "Token stored in .git-credentials (which is gitignored)"
echo "You can now run ./push.sh to push to GitHub"
