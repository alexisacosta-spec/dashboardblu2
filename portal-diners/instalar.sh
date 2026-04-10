#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  INSTALADOR — Portal Gerencial Diners Club BLU 2.0
#  Ejecutar UNA SOLA VEZ desde Terminal:  bash instalar.sh
# ═══════════════════════════════════════════════════════════

set -e
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Portal Gerencial Diners Club — BLU 2.0     ║"
echo "║              Instalador macOS                ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. Verificar Node.js
echo "${BOLD}[1/4] Verificando Node.js...${NC}"
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  echo "${GREEN}✅ Node.js ya instalado: $NODE_VER${NC}"
else
  echo "${YELLOW}⚠️  Node.js no encontrado. Intentando instalar con Homebrew...${NC}"
  if ! command -v brew &>/dev/null; then
    echo "${RED}❌ Homebrew no está instalado.${NC}"
    echo ""
    echo "Por favor instala Node.js manualmente:"
    echo "  1. Ve a https://nodejs.org"
    echo "  2. Descarga la versión LTS"
    echo "  3. Instala y luego vuelve a ejecutar este script"
    echo ""
    exit 1
  fi
  brew install node
  echo "${GREEN}✅ Node.js instalado${NC}"
fi

# 2. Instalar dependencias
echo ""
echo "${BOLD}[2/4] Instalando dependencias del portal...${NC}"
cd "$(dirname "$0")"
npm install
echo "${GREEN}✅ Dependencias instaladas${NC}"

# 3. Dar permisos al script de arranque
echo ""
echo "${BOLD}[3/4] Configurando script de arranque...${NC}"
chmod +x iniciar.sh
echo "${GREEN}✅ Permisos configurados${NC}"

# 4. Verificar .env
echo ""
echo "${BOLD}[4/4] Verificando configuración...${NC}"
if [ ! -f ".env" ]; then
  echo "${RED}❌ Archivo .env no encontrado${NC}"
  exit 1
fi
echo "${GREEN}✅ Configuración encontrada${NC}"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║           ✅ Instalación completada           ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  Para iniciar el portal, ejecuta:            ║"
echo "║     bash iniciar.sh                          ║"
echo "║  O doble clic en iniciar.sh desde Finder     ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
