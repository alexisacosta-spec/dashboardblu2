#!/bin/bash
# Portal Gerencial Diners Club — BLU 2.0
# Doble clic o: bash iniciar.sh

# Ruta absoluta a la carpeta del proyecto
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Verificar Node.js
if ! command -v node &>/dev/null; then
  osascript -e 'display alert "Node.js no encontrado" message "Por favor ejecuta primero: bash instalar.sh" as critical'
  exit 1
fi

# Verificar node_modules
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  osascript -e 'display alert "Dependencias no instaladas" message "Por favor ejecuta primero: bash instalar.sh" as critical'
  exit 1
fi

# Obtener IP local
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "tu-ip-local")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║      PORTAL GERENCIAL DINERS — BLU 2.0       ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Iniciando servidor...                       ║"
echo "║                                              ║"
echo "║  Para detener: presiona Ctrl+C               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Abrir navegador después de 2 segundos
(sleep 2 && open "http://localhost:3000") &

# Iniciar servidor desde la carpeta correcta
node "$SCRIPT_DIR/server.js"
