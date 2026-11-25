# @memlens/dsh-plugin

[English](README.md) | [中文](README.zh.md) | [Deutsch](README.de.md) | Español | [Français](README.fr.md) | [日本語](README.ja.md) | [Português](README.pt.md) | [Русский](README.ru.md)

## Resumen

`@memlens/dsh-plugin` da a cada agente de DeepSeek Harness la memoria de memlens. La entrada del host
abre un almacén compartido. Da a cada agente activo el contexto de memoria, las herramientas de
memoria y el aviso. También inicia el worker en segundo plano que combina las notas antiguas en
líneas de resumen. La entrada del preset deja que un preset de agente seleccione su perfil de
memoria. El paquete monta la consola en la página Web del harness como panel lateral y como pestaña
de sesión.

## Tabla de contenidos

- [Usar este paquete](#use-this-package)
- [Entender la implementación](#understand-the-implementation)
- [Exploración adicional](#further-exploration)
- [Experiencia del modelo](#model-experience)
- [Limitaciones conocidas y trabajo aplazado](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Usar este paquete

### Instalarlo

Añade el paquete al perfil que usas:

```sh
dsh plugin --profile web add @memlens/dsh-plugin
```

El flag `--profile` nombra el perfil, por ejemplo `web` o `desktop`. El comando pasa el resto de sus
argumentos a pnpm en el directorio del perfil.

La entrada del host requiere el servicio LLM, porque el worker envía las llamadas de compactación a
través de él. La entrada del host declara el servicio de espacio de trabajo como opcional.

### Entradas

- La entrada del host es el módulo `@memlens/dsh-plugin`. El parche del bundle inserta la fila
  `memlens`, y un perfil sobrescribe ese id de fila.
- La entrada del preset es el módulo `@memlens/dsh-plugin/preset`. Un preset de agente la monta como
  fila `memlens/preset`.

La entrada del host declara el nombre `memlens`, y la entrada del preset declara `memlens/preset`.

#### Fila del host

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

#### Fila del preset

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
```

Una clave `profile` ausente selecciona el perfil `default`.

### Configurarlo

La tabla `config` de una fila contiene los ajustes de esa capa. El ejemplo de la fila del host:

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
      config:
        defaultProfile: work
        budget:
          here: 40
        compaction:
          provider: deepseek-official
          model: deepseek-flash
```

El ejemplo de la fila del preset:

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: work
    budget:
      here: 30
```

Cada clave es opcional. Un valor rechazado da la capa vacía, así que una fila mala no cambia ninguna
sesión.

El preset sobrescribe el parche del plugin. El parche del plugin sobrescribe el perfil base. La
clave `profile` del preset selecciona el nombre del perfil. El preset no acepta ninguna clave de
compactación ni ninguna clave del almacén.

El archivo base es `config.toml` en el directorio de configuración de la plataforma. Si el archivo está ausente, se aplica el
respaldo integrado: el perfil `default`, los ámbitos `*`, los presupuestos 20 y 10 y el ámbito
`project:misc`. Una sección ausente del archivo da su valor por defecto. Un archivo base inválido o
ilegible mantiene el almacén cerrado, y la sesión continúa.

La ruta del almacén viene primero del parche `store.path`, luego de `MEMLENS_STORE` y luego del
archivo base.

La compactación en segundo plano necesita una ruta de modelo, y el plugin nunca elige un modelo. Las
claves `provider` y `model` del ejemplo dan esa ruta. Los ids vienen de la ruta LLM de tu harness. Un
provider o un model ausente detiene cada pasada con el error
`The compaction model is not configured. Set provider and model.`

Consulta cada clave, su valor por defecto y ejemplos completos en
[Configuración](../../docs/configuration.md).

### Reglas de autoridad

El agente principal escribe una nota en el almacén. Un subagente hijo escribe una propuesta en su
lugar. Una escritura fuera de los ámbitos del perfil se convierte en una propuesta para una persona.
Un `forget` fuera de los ámbitos escribe una propuesta de ocultación.

Un hijo `off` no recibe ninguna herramienta de memoria y ningún contexto de memoria. Una propuesta
de un hijo se acumula bajo el id de sesión del hijo. El padre recibe una línea de informe por cada
propuesta cuando el hijo termina.

Solo la CLI y la consola modifican, censuran, aceptan y descartan. El almacén descarta una propuesta
caducada sin ninguna persona.

### Versión

La versión mínima aceptada es DeepSeek Harness `0.2.2-rc.3`. El manifiesto acepta `>=0.2.2-rc.3`.

-----

<a id="understand-the-implementation"></a>
## Entender la implementación

<details>
<summary>Detalles internos de la implementación, clic para expandir</summary>

Esta sección explica cómo el plugin mantiene el almacén y la superficie de cada agente. Lee
[Usar este paquete](#use-this-package) para el comportamiento observable.

### Diseño

El almacén es una base de datos SQLite que guarda las notas de cada sesión. El contexto de memoria,
las herramientas de memoria y el aviso usan el almacén. Esta sección llama superficie de un agente
al conjunto de estas partes. Montar la superficie significa registrar estas partes en el contexto de
un agente.

- **Un almacén para el host.** El host abre el almacén una vez y lo comparte con cada agente. La
  entrada del preset añade ajustes a un preset de agente y no inicia un segundo almacén.
- **La apertura puede fallar.** Abrir el almacén significa leer la configuración y conectar con la
  base de datos. Un directorio ausente, un bloqueo de la base de datos de otro proceso o un archivo
  de configuración inválido detiene la apertura. El plugin mantiene cada sesión, monta la superficie
  que responde con errores y vuelve a intentar la apertura tras una espera. Cada nuevo intento espera
  más que el anterior.
- **La superficie de cada agente.** El host y el agente poseen la superficie del agente, y cada
  registro termina con el contexto del agente. Un subagente hijo no recibe aviso, porque el aviso pide
  una escritura de memoria.
- **Un almacén que no está abierto.** El contexto y las herramientas responden con errores. Una
  sesión sin sección de contexto guardada no recibe texto de memoria, y la superficie no recibe aviso.
  La consola muestra el error del almacén.
- **Un almacén que se abre más tarde.** El plugin inicia el worker y monta la superficie otra vez para
  cada agente activo. Una sesión que empezó con un almacén no disponible recibe su memoria más tarde.
- **Un segundo montaje elimina primero la superficie antigua.** Los registros del host rechazan un
  segundo registro de un mismo nombre. Un montaje fallido se repite con un segundo entre intentos, un
  número pequeño de veces, así que un fallo transitorio no cuesta ninguna superficie. Un montaje
  agotado registra la pérdida. El código y el registro de depuración llaman respawn a este segundo
  montaje.
- **El worker inicia una pasada con un disparador.** Una pasada empieza cuando los rangos sucios
  alcanzan la cuenta del lote. También empieza cuando vence el tiempo de inactividad del almacén, y
  diez segundos después del inicio mientras hay trabajo en espera. El worker llama a la ruta
  configurada, respeta el límite de llamadas por hora y registra los eventos recientes en un diario.
- **La consola usa el servicio Remote.** El plugin registra el espacio de nombres de la consola solo
  cuando el servicio Typert está presente. La pestaña entonces lee y escribe la memoria sin ninguna
  ruta HTTP del plugin.

### Mapa del código fuente

| File                     | Role                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `src/index.ts`           | La entrada del host: el almacén, el worker, la superficie de cada agente, el montaje       |
| `src/preset.ts`          | La entrada del preset: el registro de configuración con ámbito                             |
| `src/config.ts`          | Los dos esquemas de ajustes del harness, con hojas permisivas                              |
| `src/service.ts`         | El almacén compartido y la configuración de cada preset de agente                          |
| `src/runtime.ts`         | La configuración base y el ámbito activo de un directorio de trabajo                       |
| `src/memory-context.ts`  | El contexto de memoria, la restauración desde el historial, el disparador de actualización |
| `src/memory-tools.ts`    | El conjunto de herramientas de cada modo de agente y el informe al padre de un hijo        |
| `src/nudge.ts`           | Los dos contadores, el reinicio al escribir una nota y la línea inyectada                  |
| `src/worker.ts`          | La pasada de compactación, la llamada al modelo por lote, el límite de tasa, el diario     |
| `src/tools/*.ts`         | Un esquema, una respuesta y un renderizador para cada herramienta de memoria               |
| `src/console/*.ts`       | Las lecturas de la consola, las acciones, el estado y el servicio Remote                   |
| `src/client/*.tsx`       | El montaje del panel lateral y de la pestaña de sesión                                     |
| `locale/<language>.json` | El título y la descripción de cada idioma en la lista de plugins                           |
| `icon.svg`               | El icono del panel                                                                         |

El cuerpo del cliente vive en `@memlens/ui`. Este paquete contiene el montaje y el servicio Remote.

</details>

-----

<a id="further-exploration"></a>
## Exploración adicional

Este paquete es la entrada al harness de la memoria. Lee estas páginas para el estado que monta.

- [Arquitectura](../../docs/architecture.md): el almacén, el contexto, las herramientas, el worker y
  las consolas en un solo lugar.
- [Herramientas del agente](../../docs/features/agent-tools.feature): el comportamiento de las
  herramientas de memoria.
- [Propuestas](../../docs/features/proposals.feature): los modos de subagente y el flujo de
  propuestas.
- [Contexto de memoria](../../docs/features/memory-context.feature): la instantánea y sus
  disparadores.
- [Aviso](../../docs/features/nudge.feature): los contadores y la línea.
- [Configuración](../../docs/configuration.md): cada clave, su valor por defecto y el orden de las
  capas.
- [Prompts](../../docs/prompts.md): los prompts del producto y el lugar de cada uno.
- [Glosario](../../docs/glossary.md): los términos de este paquete.

-----

<a id="model-experience"></a>
## Experiencia del modelo

### Prompt del sistema

#### Qué ve el modelo

El plugin registra el contexto de memoria para cada agente con `required: true` y el orden 220,
después de los contextos de runtime integrados. El harness escribe el texto como mensaje de contexto
de runtime, y escribe un mensaje nuevo solo cuando el texto cambia.

El texto es una sección `<memory>` con estas partes:

- `<how-to>` contiene el texto de política y el valor de `customPromptAppend`. La clave `customPrompt`
  sustituye toda la plantilla.
- `<directions>` contiene una línea por cada uno de los ámbitos más recientes del perfil, como
  `[<key>] <age> <summary>`. Los ámbitos más antiguos que el presupuesto se unen en una lista de
  claves.
- `<here>` contiene la frontera del ámbito activo, como `#<pos> <date> <body>` para una nota y
  `#<a>-<b> <start>..<end> <summary>` para un rango.

El texto de política declara la forma del árbol, las dos herramientas de lectura y las reglas de una
escritura. El [contrato de contexto](../../packages/core/src/domain/context.ts) contiene el texto, y
[Prompts](../../docs/prompts.md) nombra su lugar.

#### Efecto en los tokens

Un coste fijo en cada petición que contiene el contexto de memoria. El coste crece con los
presupuestos `here` y `directions` y con el valor de `customPromptAppend`.

#### Efecto en la caché KV

El texto de memoria está en el contexto de runtime al principio de la petición. Sigue igual a través
de los turnos de una sesión y de las escrituras de esa sesión. Esta sección es estable como prefijo
durante toda la sesión.

El plugin genera el texto de nuevo en una sesión nueva y en una compactación de la conversación hecha
por el harness. El texto cambia solo cuando cambian las notas, los presupuestos o el prompt
personalizado.

### Esquemas y resultados de las herramientas

#### Qué ve el modelo

Las definiciones de herramientas en el ámbito del agente, con las descripciones, los parámetros y los
esquemas de respuesta de `src/tools`. El conjunto de cada agente depende del modo del perfil:

| Tool            | Agente principal | Hijo `propose` | Hijo `read` |
| --------------- | ---------------- | -------------- | ----------- |
| `memory_note`   | sí               | sí, propuesta  | no          |
| `memory_find`   | sí               | sí             | sí          |
| `memory_open`   | sí               | sí             | sí          |
| `memory_map`    | sí               | sí             | sí          |
| `memory_forget` | sí               | no             | no          |
| `memory_review` | sí               | no             | no          |

Un hijo `off` no recibe ninguna herramienta y ningún contexto de memoria.

Cada llamada responde con un texto generado. La tabla da el texto de cada herramienta:

| Tool            | El texto que lee el modelo                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `memory_note`   | `saved <addr>`, o `Proposed to your parent: <body> (proposal <id>)`                                |
| `memory_find`   | Una línea por cada coincidencia, como `<addr>  <date>  <kind>  <body>`, o `No hit.`                |
| `memory_open`   | La entrada con su texto largo, una línea por cada hijo de un rango, o `The range holds no record.` |
| `memory_map`    | Una línea por cada ámbito, o una línea por cada rango de la frontera                               |
| `memory_forget` | `Done. A target outside the profile waits for a human.`                                            |
| `memory_review` | Una línea por cada registro vencido, o `reviewed <count> records, next <date>`                     |

#### Efecto en los tokens

Un coste fijo de esquema más una respuesta compacta por cada llamada. El informe al padre añade una
línea por cada propuesta abierta de un hijo cuando el hijo termina.

#### Efecto en la caché KV

Los esquemas son estables como prefijo mientras el conjunto de herramientas y el modo del perfil no
cambien. Una llamada y su respuesta se añaden después del prefijo reutilizable.

### Líneas de aviso

#### Qué ve el modelo

El plugin cuenta las llamadas de herramientas y los turnos del agente principal. Un contador que
alcanza su límite inyecta una línea con rol de usuario. La línea contiene `{n}`, y la cuenta ocupa su
lugar. Los textos por defecto son:

```text
[memory] {n} tool calls since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
[memory] {n} turns since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
```

La sección `[nudge]` de la configuración da las cuentas y los textos. Un límite de cero o menos
desactiva su contador.

#### Efecto en los tokens

Una línea corta en cada límite alcanzado. Una escritura de nota o un aviso reinicia ambos contadores,
así que las líneas siguen siendo raras.

#### Efecto en la caché KV

La línea se añade después del prefijo reutilizable, así que no invalida ninguna entrada anterior.

<a id="known-limitations-and-deferred-work"></a>
## Limitaciones conocidas y trabajo aplazado

Estos límites definen cuándo este paquete encaja mal o necesita un cuidado especial. Son restricciones
actuales del paquete, no una lista de tareas pendientes.

- **La compactación necesita una ruta configurada.** Una pasada sin provider o sin model falla con
  "The compaction model is not configured. Set provider and model." La consola muestra ese error en la
  pantalla de mantenimiento, y los rangos afectados siguen sucios para la siguiente pasada. Consulta
  [Configurarlo](#configure-it).
- **Un segundo montaje tiene una cuenta acotada de intentos.** El plugin elimina primero la superficie
  antigua y luego monta otra vez con un segundo entre intentos. Un montaje agotado registra la
  pérdida, y el agente sigue sin superficie hasta el siguiente disparador.
- **El aviso cuenta solo al agente principal.** Un subagente no recibe aviso ni recordatorio para
  registrar un hallazgo.
- **La consola necesita el servicio Typert.** El espacio de nombres se registra solo cuando el
  servicio aparece. Un perfil sin el gateway Web no recibe consola, y el plugin no informa de ningún
  error.

<a id="dev-note"></a>
### Nota de desarrollo

<details>
<summary>Contexto de trabajo para mantenedores, clic para expandir</summary>

Esta Nota de desarrollo es contexto de trabajo para mantenedores. No es autoritativa de forma
explícita.

La consola de la GUI del harness parece una parte de `@memlens/ui`, pero la división no es limpia.
Este paquete contiene el montaje, el servicio Remote, las lecturas y las acciones. El cuerpo del
cliente contiene el modelo, el almacén, las pantallas y las traducciones. Un cambio de una pantalla
de la consola toca ambos paquetes. Un cambio de una llamada de la consola toca primero
`src/console/remote-contract.ts`, porque las dos caras del Remote leen los mismos descriptores.

La compilación y las comprobaciones:

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

El comando `pnpm run verify` en la raíz del repositorio ejecuta la compilación y todas las
comprobaciones.

</details>
