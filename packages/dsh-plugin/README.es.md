# @memlens/dsh-plugin

El plugin de DeepSeek Harness de memlens.

**Estado:** etapas 1 a 4. El plugin abre el almacén de memoria, da a cada agente su contexto de
memoria, sus herramientas de memoria y el aviso, y ejecuta la compactación en segundo plano. La
consola del plugin queda fuera de este paquete.

## Superficie de memoria

El plugin registra un contexto de ejecución para cada agente. El contexto mantiene la porción de
memoria y se mantiene estable entre los disparadores aceptados: una sesión nueva, una compactación
correcta del harness y un tiempo de inactividad por encima del TTL del modelo.

El plugin registra estas herramientas en el contexto de cada agente:

| Herramienta   | Agente principal | Hijo (propuesta) | Hijo (lectura) |
| ------------- | ---------------- | ---------------- | -------------- |
| memory_note   | sí               | sí, propuesta    | no             |
| memory_find   | sí               | sí               | sí             |
| memory_open   | sí               | sí               | sí             |
| memory_map    | sí               | sí               | sí             |
| memory_forget | sí               | no               | no             |
| memory_review | sí               | no               | no             |

Un hijo `off` no recibe herramienta de memoria ni contexto de memoria. Una propuesta de un hijo se
recoge bajo el id de sesión del hijo, y el padre recibe una línea de informe por propuesta cuando el
hijo termina.

El aviso cuenta las llamadas a herramientas y los turnos del agente principal. Un límite alcanzado
inyecta una línea, y una escritura de nota o un aviso reinicia ambos contadores.

El trabajador en segundo plano inicia una compactación en el umbral de suciedad y en el límite de
inactividad del almacén. El trabajador llama a la ruta LLM configurada y respeta sus límites de
llamadas.

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

La versión probada es DeepSeek Harness `0.2.2-rc.3`. El manifiesto acepta `>=0.2.1-0`. Una prueba de
carga de `0.2.1-rc.5` pasa: el plugin registra su servicio y lo libera limpio. La superficie de
memoria completa solo tiene pruebas en `0.2.2-rc.3`.
