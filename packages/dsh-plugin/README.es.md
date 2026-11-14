# @memlens/dsh-plugin

El plugin de DeepSeek Harness de memlens.

**Estado:** etapa 1. El plugin abre el almacén de memoria y lee la configuración de cada sesión.
Todavía no da ninguna herramienta de memoria ni contexto de memoria.

## Entradas

- La entrada del host `@memlens/dsh-plugin` tiene el nombre de plugin `dsh-memlens`. El parche del
  paquete inserta la fila `memlens`.
- La entrada de preajuste `@memlens/dsh-plugin/preset` tiene el nombre de plugin `memlens/preset`. Un
  preajuste de agente la carga con la clave `profile`.

### Fila del host

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

### Fila del preajuste

Añade esta fila a la lista `plugins` de un preajuste de agente. La clave `profile` es obligatoria.

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: default
```

## Configuración

El plugin lee el archivo base `$XDG_CONFIG_HOME/memlens/config.toml`. El plugin no escribe este
archivo. Si el archivo no existe, se aplica el reemplazo integrado: el perfil `default`, los ámbitos
`*`, los presupuestos 20 y 10 y el ámbito `user:notes`.

La ruta del almacén viene primero de la configuración del plugin, después de `MEMLENS_STORE`,
después del archivo base.

Los ajustes se combinan en este orden: el preajuste, el parche del plugin, el perfil base. La clave
`profile` del preajuste selecciona el nombre del perfil.

El modelo de la sesión necesita al menos 65 536 tokens de contexto. El plugin detiene una sesión con
un modelo más pequeño.

Los metadatos de visualización están en `locale/<language>.json`. El icono es `icon.svg`.

## Compilar y probar

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## Versión

La versión probada es DeepSeek Harness `0.2.2-rc.3`. El manifiesto acepta `>=0.2.1-0`. Una versión
más antigua no está verificada.
