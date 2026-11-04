# memlens

memlens — это headless-библиотека с CLI-фронтендом и плагином для DSH.

**Статус:** фаза спецификации. Каркас собирается, тесты проходят. Ни одна часть ещё не делает работу.

## Части

| Часть | Функция |
|---|---|
| Headless-библиотека | Делает работу. Не имеет пользовательского интерфейса. |
| CLI-фронтенд | Даёт доступ из терминала. |
| Плагин DSH | Даёт доступ из DeepSeek Harness. |

## Раскладка

| Путь | Пакет | Роль |
|---|---|---|
| [packages/core](packages/core) | `@memlens/core` | Headless-библиотека. |
| [packages/cli](packages/cli) | `@memlens/cli` | CLI-фронтенд. Бинарь `memlens`. |
| [packages/dsh-plugin](packages/dsh-plugin) | `@memlens/dsh-plugin` | Плагин DSH. Идентификатор `dsh-memlens`. |

## Документы

| Файл | Содержимое |
|---|---|
| [docs/spec/README.md](docs/spec/README.md) | Индекс спецификации и правила её ведения. |
| [docs/spec/02-requirements.md](docs/spec/02-requirements.md) | Требования с идентификаторами и статусами. |
| [docs/spec/03-open-questions.md](docs/spec/03-open-questions.md) | Открытые вопросы, блокирующие работу. |
| [docs/statements.md](docs/statements.md) | Утверждения заказчика дословно. |
| [AGENTS.md](AGENTS.md) | Правила работы для агентов. |

## Установка

```sh
mise install
pnpm install
```

Файл [mise.toml](mise.toml) фиксирует версии инструментов. Файл [mise.lock](mise.lock) фиксирует
контрольные суммы.

## Команды

Запускай команды в шелле, который активирует mise, либо начинай команду с `mise exec --`.

| Команда | Действие |
|---|---|
| `pnpm install` | Установить workspace. |
| `pnpm run build` | Собрать три пакета. |
| `pnpm run typecheck` | Проверить типы. |
| `pnpm run test` | Запустить тесты. |
| `pnpm run plugin:check` | Проверить манифест плагина. |
| `pnpm run lint:docs` | Проверить документы по лимитам STE. |

## Языки

| Что | Язык |
|---|---|
| Документы | Simplified Technical English, ASD-STE100. |
| Комментарии в коде | Simplified Technical English, ASD-STE100. |
| README | английский, русский (этот файл), китайский ([README.zh.md](README.zh.md)) |
| Локализация продукта | русский и китайский. |

## Следующий шаг

Функция продукта открыта. См. [Q-002](docs/spec/03-open-questions.md#q-002).
