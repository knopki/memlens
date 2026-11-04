# @memlens/dsh-plugin

Плагин memlens для DeepSeek Harness.

**Статус:** каркас. Плагин пока ничего не регистрирует. Первая регистрация появится после того,
как заказчик примет требование. См. [docs/spec/03-open-questions.md](../../docs/spec/03-open-questions.md),
вопрос Q-002.

## Контракт

| Пункт | Значение |
|---|---|
| Пакет | `@memlens/dsh-plugin` |
| Идентификатор плагина | `dsh-memlens` |
| Экспорт модуля | `name`, `apply` |
| Патч бандла | [cordis.patch.yml](cordis.patch.yml) |
| Метаданные показа | [locale/en.json](locale/en.json), [locale/ru.json](locale/ru.json), [locale/zh.json](locale/zh.json), [icon.svg](icon.svg) |
| Harness | DeepSeek Harness 0.2.1-rc.5 |
| Node | `^22.19.0 || >=24.0.0` |

## Сборка и тесты

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

Манифест бандла проверяют тесты. Запусти `pnpm run test`.
