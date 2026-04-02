#!/bin/bash

# ====================================================
# 1. Erstelle vorher ein leeres Repository auf GitHub:
#    https://github.com/new
#    Name: intlyst-backend (oder ein anderer Name)
#    KEIN README oder .gitignore hinzufügen!
# ====================================================

# 2. Deine GitHub-Daten hier eintragen:
GITHUB_USERNAME="DEIN-USERNAME"
REPO_NAME="intlyst-backend"

# 3. Remote hinzufügen und pushen:
git remote add origin https://github.com/$GITHUB_USERNAME/$REPO_NAME.git
git branch -M main
git push -u origin main

echo "✅ Code wurde erfolgreich auf GitHub hochgeladen!"
echo "🔗 https://github.com/$GITHUB_USERNAME/$REPO_NAME"
