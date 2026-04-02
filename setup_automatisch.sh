#!/bin/bash

# Automatisches Setup-Skript für macOS
# Installiert Homebrew, Node.js und lädt Frontend-Abhängigkeiten

# Homebrew installieren, falls nicht vorhanden
if ! command -v brew &> /dev/null
then
    echo "Homebrew wird installiert..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "Homebrew ist bereits installiert."
fi

# Node.js installieren, falls nicht vorhanden
if ! command -v node &> /dev/null
then
    echo "Node.js wird installiert..."
    brew install node
else
    echo "Node.js ist bereits installiert."
fi

# Frontend-Abhängigkeiten installieren
if [ -f package.json ]; then
    echo "npm install wird ausgeführt..."
    npm install
else
    echo "Keine package.json gefunden. npm install wird übersprungen."
fi

echo "Setup abgeschlossen."
