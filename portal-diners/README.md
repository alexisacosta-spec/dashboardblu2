# Portal Gerencial Diners Club — BLU 2.0

## Instalación (solo la primera vez)

1. Abre **Terminal** (búscalo en Spotlight con ⌘+Space)
2. Arrastra la carpeta `portal-diners` a la Terminal para navegar a ella, o escribe:
   ```
   cd ruta/a/portal-diners
   ```
3. Ejecuta el instalador:
   ```
   bash instalar.sh
   ```

> Si macOS dice "no se puede abrir porque el desarrollador no es de confianza":  
> Ve a **Preferencias del Sistema → Seguridad → Permitir de todas formas**

---

## Uso diario

**Para iniciar el portal:**
```
bash iniciar.sh
```
El navegador se abrirá automáticamente en `http://localhost:3000`

---

## Credenciales iniciales (admin)

| Campo | Valor |
|-------|-------|
| Email | admin@dinersclub.com.ec |
| Contraseña | Admin2026! |

> ⚠️ Cambia esta contraseña después del primer acceso

---

## Compartir con los gerentes (red local / VPN)

1. Inicia el servidor con `bash iniciar.sh`
2. En la consola verás algo como:
   ```
   Red: http://192.168.1.45:3000
   ```
3. Comparte esa URL con los gerentes — deben estar en la **misma red WiFi o VPN de Diners**
4. Ellos acceden desde su navegador, tú debes tener el Mac encendido

---

## Cargar datos desde Excel

1. Ingresa como **admin**
2. En el sidebar: **Cargar Excel**
3. Arrastra o selecciona tu archivo `.xlsx`
4. El sistema importa automáticamente solo:
   - Tasks con estado `Closed`
   - Con horas completadas > 0
   - Excluyendo empresa `Diners`
   - Agrupando categorías vacías como `Sin Clasificar`

---

## Perfiles de usuario

| Perfil | Horas | Costos | Gestión usuarios | Cargar Excel |
|--------|-------|--------|------------------|--------------|
| Gerente | ✅ | ❌ | ❌ | ❌ |
| Gerente con costos | ✅ | ✅ | ❌ | ❌ |
| Administrador | ✅ | ✅ | ✅ | ✅ |

---

## Configurar email real (opcional)

Edita el archivo `.env` y cambia:
```
DEV_MODE=false
MAIL_USER=tu_correo@gmail.com
MAIL_PASS=tu_contrasena_de_aplicacion
```

Para Gmail, usa una **Contraseña de aplicación**:
1. Activa verificación en 2 pasos en tu cuenta Google
2. Ve a Seguridad → Contraseñas de aplicación
3. Genera una para "Correo / Mac"
4. Pega esa contraseña en `MAIL_PASS`

> Mientras `DEV_MODE=true`, el OTP se muestra en la consola — útil para pruebas

---

## Estructura de archivos

```
portal-diners/
├── server.js        ← Servidor (no modificar)
├── dashboard.html   ← Interface del portal (no modificar)
├── portal.db        ← Base de datos (se crea automáticamente)
├── .env             ← Tu configuración de email
├── instalar.sh      ← Instalador (ejecutar una vez)
├── iniciar.sh       ← Arranque diario
└── README.md        ← Este archivo
```
