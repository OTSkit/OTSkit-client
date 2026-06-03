# E2E Test Suite

## Requisitos

- Node.js >= 18
- `npm run build` ejecutado en el directorio raíz
- Suite B requiere variables de entorno:
  - `OTS_JS_ORIGINAL_DIR`: ruta al cliente JS original (ej. `C:\tmp\ots-original`)
  - `OTS_PYTHON_BIN`: ejecutable Python ots (default: `ots`)

## Modos

```
node e2e/run.mjs corpus                           # Suite A: corpus histórico (sin red)
node e2e/run.mjs stamp <hash64hex>                # Sella + verifica nonce + cross-client
node e2e/run.mjs upgrade <proof.ots>              # Polling upgrade (hasta 24h)
node e2e/run.mjs verify <proof.ots> <hash64hex>   # Verifica + cross-client
node e2e/run.mjs calendars                        # Salud de los 4 calendarios
node e2e/run.mjs esplora                          # Salud de Blockstream + alternativas
node e2e/run.mjs full-cycle <hash64hex>           # Ciclo completo stamp→upgrade→verify
node e2e/run.mjs resume <hash64hex>               # Reanudar ciclo existente
```

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `OTS_JS_ORIGINAL_DIR` | (obligatorio para Suite B) | Ruta al cliente JS original |
| `OTS_PYTHON_BIN` | `ots` | Ejecutable del cliente Python |
| `E2E_DEBUG` | — | Muestra stack traces completos |
