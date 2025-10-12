# Build Scripts

Scripts automatizados para compilar la aplicación en diferentes plataformas.

## 🚀 Scripts Disponibles

### 1. **Quick Build** (Recomendado para desarrollo)
```bash
pnpm run build:quick
# o directamente:
bash scripts/quick-build.sh
```
**Qué hace:**
- Recompila módulos nativos (node-pty) para tu versión de Node.js
- Compila Next.js para producción
- ⚡ Más rápido porque NO crea paquetes de Electron

**Usar cuando:** Quieres probar la versión de producción de Next.js sin empaquetar Electron.

---

### 2. **Build Completo** (Detección automática de plataforma)
```bash
pnpm run build
# o
pnpm run build:all
# o directamente:
bash scripts/build-all-platforms.sh
```
**Qué hace:**
- Detecta tu plataforma actual (Linux/macOS/Windows)
- Recompila módulos nativos automáticamente
- Compila Next.js
- Crea el paquete de Electron para tu plataforma

**Usar cuando:** Quieres crear un instalador/ejecutable completo para tu sistema operativo.

---

### 3. **Build para Linux** (Solo en Linux)
```bash
pnpm run build:linux
# o directamente:
bash scripts/build-linux.sh
```
**Qué hace:**
- Recompila módulos nativos
- Compila Next.js
- Crea paquetes de Electron para Linux: AppImage, .deb, .rpm, .tar.gz

---

### 4. **Rebuild de Módulos Nativos** (node-pty)
```bash
pnpm run build:native
# o directamente:
bash scripts/rebuild-native.sh
```
**Qué hace:**
- Solo recompila node-pty para la versión actual de Node.js
- Crea el enlace simbólico Debug -> Release necesario

**Usar cuando:**
- Cambias de versión de Node.js
- node-pty da errores de MODULE_VERSION mismatch
- Después de `pnpm install`

---

## 🔧 Solución de Problemas

### Error: "MODULE_NOT_FOUND: pty.node"
```bash
pnpm run build:native
```

### Error: "compiled against different Node.js version"
```bash
pnpm run build:native
```

### El build falla al recopilar páginas
```bash
# Limpiar y rebuild completo
rm -rf .next node_modules/node-pty/build
pnpm install
pnpm run build:native
pnpm run build
```

---

## 📁 Estructura de Scripts

```
scripts/
├── rebuild-native.sh           # Recompila node-pty
├── quick-build.sh              # Build rápido (Next.js only)
├── build-linux.sh              # Build completo para Linux
├── build-all-platforms.sh      # Build multiplataforma (auto-detect)
└── README.md                   # Este archivo
```

---

## 🎯 Flujo de Trabajo Recomendado

### Desarrollo Diario
```bash
pnpm run dev              # Servidor de desarrollo
```

### Testing de Producción
```bash
pnpm run build:quick      # Build rápido
pnpm start                # Probar build
```

### Crear Distribución
```bash
pnpm run build:all        # Build completo con Electron
# Los instaladores aparecerán en: dist/
```

---

## 🐛 Debugging

Cada script tiene logs coloridos que muestran:
- ✅ Verde: Éxito
- ⚠️  Amarillo: Información/pasos
- ❌ Rojo: Errores

Si algo falla, los logs te dirán exactamente en qué paso ocurrió el problema.

---

## 📝 Notas

- Todos los scripts son idempotentes (puedes ejecutarlos múltiples veces sin problemas)
- Los scripts detectan automáticamente tu plataforma
- node-pty se recompila automáticamente en cada build para evitar problemas de versión
