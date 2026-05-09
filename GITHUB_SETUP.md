# GitHub Push Setup

This repository uses a secure credential management system. **Never commit tokens or passwords to the repository.**

## Initial Setup

### Option 1: Credential Store (Recommended)

1. Run the setup script:
   ```bash
   ./setup-github.sh
   ```
   (Windows: `setup-github.bat`)

2. Enter your GitHub Personal Access Token (classic) with `repo` scope
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token with `repo` permissions

3. Enter your GitHub username

4. Credentials are stored in `.git-credentials` (which is gitignored)

### Option 2: SSH Keys

1. Generate SSH key: `ssh-keygen -t ed25519 -C "apps.bit.inv@gmail.com"`
2. Add public key to GitHub: Settings → SSH and GPG keys
3. Change remote URL: `git remote set-url origin git@github.com:harys-rifai/tencent-inc.git`

## Pushing Changes

After setup:
```bash
./push.sh
```

The script will:
- Stage all changes
- Create a commit with timestamp
- Push to GitHub using stored credentials

## Credential Files (gitignored)

- `.git-credentials` - Git credential store
- `.github_token` - Optional token file
- `inventory-app/.env` - Environment variables (includes DB passwords)
- `credentials.json` - Any credential files

## Troubleshooting

### "Invalid credentials" error
- Re-run `./setup-github.sh` to update your token
- Ensure token has `repo` scope
- Check token hasn't expired

### Credentials not being used
- Verify `.git-credentials` exists and contains your credentials
- Check Git config: `git config credential.helper` should show `store`
- Try: `git credential reject` to clear cached credentials, then re-run setup

### Windows Git Bash issues
- Ensure line endings are LF (not CRLF) in scripts
- Run `dos2unix setup-github.sh push.sh` if you get "command not found" errors

## Security Notes

- Token is stored in plain text in `.git-credentials` (local only, not synced)
- `.gitignore` prevents credential files from being committed
- Token must have `repo` scope for push access
- Rotate token if accidentally exposed
