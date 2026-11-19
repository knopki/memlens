# memlens

memlens — долговременная память агента: набор курируемых заметок и дерево пересказов над ними.

**Статус:** ядро, CLI, отдельная консоль и плагин реализованы.

## Части

| Часть               | Функция                                               |
| ------------------- | ----------------------------------------------------- |
| Headless-библиотека | Делает работу. Не имеет пользовательского интерфейса. |
| CLI-фронтенд        | Даёт доступ из терминала.                             |
| Плагин DSH          | Даёт доступ из DeepSeek Harness.                      |

## Раскладка

| Путь                                       | Пакет                 | Роль                                     |
| ------------------------------------------ | --------------------- | ---------------------------------------- |
| [packages/core](packages/core)             | `@memlens/core`       | Headless-библиотека.                     |
| [packages/cli](packages/cli)               | `@memlens/cli`        | CLI-фронтенд. Бинарь `memlens`.          |
| [packages/ui](packages/ui)                 | `@memlens/ui`         | Клиент браузера для консоли.             |
| [packages/dsh-plugin](packages/dsh-plugin) | `@memlens/dsh-plugin` | Плагин DSH. Идентификатор `memlens`.     |

## Документы

| Файл                                                             | Содержимое                                 |
| ---------------------------------------------------------------- | ------------------------------------------ |
| [docs/architecture.md](docs/architecture.md)                     | Как устроена система.                      |
| [docs/configuration.md](docs/configuration.md)                   | Формат конфигурации и примеры.             |
| [docs/arch/README.md](docs/arch/README.md)                       | Модель архитектуры в виде диаграмм.        |
| [docs/features/README.md](docs/features/README.md)               | Межмодульное поведение в сценариях.        |
| [docs/questions.md](docs/questions.md)                           | Открытые вопросы, блокирующие решения.     |
| [AGENTS.md](AGENTS.md)                                           | Правила работы для агентов.                |

## Конфигурация

memlens работает без файла конфигурации. Чтобы изменить значение, скопируй нужные куски в
`~/.config/memlens/config.toml`:

```toml
defaultProfile = "default"

[profile.default]
scopes = ["*"]

[profile.default.budget]
here = 20
directions = 10
```

Плагин DSH читает тот же файл и добавляет два своих слоя. Все ключи, дефолты и примеры — в
[docs/configuration.md](docs/configuration.md).

## Установка

```sh
mise install
pnpm install
prek install
```

Файл [mise.toml](mise.toml) задаёт линии версий инструментов. `mise install` ставит версию внутри каждой
линии, а `mise upgrade` поднимает до свежего патча.

## Команды

Запускай команды в шелле, который активирует mise, либо начинай команду с `mise exec --`.

| Команда              | Действие                                     |
| -------------------- | -------------------------------------------- |
| `pnpm install`       | Установить workspace.                        |
| `pnpm run build`     | Собрать четыре пакета.                       |
| `pnpm run typecheck` | Проверить типы.                              |
| `pnpm run test`      | Запустить тесты.                             |
| `pnpm run lint`      | Проверить код и форматирование через biome.  |
| `pnpm run format`    | Записать исправления biome и форматирование. |
| `pnpm run lint:docs` | Проверить документы по лимитам STE.          |
| `pnpm run verify`    | Собрать всё и прогнать все проверки.         |

## Языки

| Что                  | Язык                                                                      |
| -------------------- | ------------------------------------------------------------------------- |
| Документы            | Simplified Technical English, ASD-STE100.                                 |
| Комментарии в коде   | Simplified Technical English, ASD-STE100.                                 |
| README               | восемь языков набора DSH. В репозитории сейчас английский, русский (этот файл) и китайский ([README.zh.md](README.zh.md)). |
| Локализация продукта | восемь языков набора DSH. |
