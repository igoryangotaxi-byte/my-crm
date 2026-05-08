---
name: Main CRM Bussiness Center section
overview: Добавить новый раздел Bussiness Center в главной CRM с выбором клиента и полным функционалом, как в client Financial Center, используя подтвержденные API 2.0 order-based источники.
todos:
  - id: extract-finance-core
    content: Вынести и унифицировать shared finance-агрегации из client-financial-center API
    status: pending
  - id: add-main-finance-api
    content: Добавить /api/bussiness-center/summary и /api/bussiness-center/export с client selector и scope-guard
    status: pending
  - id: build-main-finance-page
    content: Реализовать app/(crm)/bussiness-center/page.tsx с client selector и полным Bussiness Center UI
    status: pending
  - id: wire-crm-navigation
    content: Добавить Bussiness Center в Sidebar/layout/header метаданные main CRM
    status: pending
  - id: release-prep
    content: Подготовить версию и release notes по governance перед прод-выкаткой
    status: pending
isProject: false
---

# Реализация раздела Bussiness Center в main CRM

## Что уже подтверждено
- В API 2.0 для финансов в текущем проекте доступны и используются order-based методы: `orders/list`, `orders/info`, `orders/taxi/report` ([Order information](https://taxi__business-api.docs-viewer.yandex.ru/en/concepts/api20/order-info#vehicle)).
- В проекте уже есть готовая client-реализация финансового центра и серверные агрегаторы, которые можно переиспользовать:
  - [/Users/igorkuznetsov/Projects/my-crm/app/client/financial-center/page.tsx](/Users/igorkuznetsov/Projects/my-crm/app/client/financial-center/page.tsx)
  - [/Users/igorkuznetsov/Projects/my-crm/app/api/client-financial-center/summary/route.ts](/Users/igorkuznetsov/Projects/my-crm/app/api/client-financial-center/summary/route.ts)
  - [/Users/igorkuznetsov/Projects/my-crm/app/api/client-financial-center/export/route.ts](/Users/igorkuznetsov/Projects/my-crm/app/api/client-financial-center/export/route.ts)

## Архитектурный подход
- Делаем `v1` Bussiness Center в main CRM на order-based данных.
- Для main CRM вводим отдельные API-роуты с явным выбором клиента (`tokenLabel`, `clientId`) по паттерну Request Rides/Communications.
- Для client-scoped пользователя на backend принудительно использовать его `getClientScope()` и игнорировать переданный клиентский контекст.

## План изменений

### 1) Переиспользовать бизнес-логику финансов в общий серверный модуль
- Вынести общие агрегации из client-only роутов в shared helper (например, `lib/finance-center.ts`) с входом:
  - `tokenLabel`, `clientId`, `since`, `till`, лимиты.
- Переиспользовать существующий вызов Yango API из [/Users/igorkuznetsov/Projects/my-crm/lib/yango-api.ts](/Users/igorkuznetsov/Projects/my-crm/lib/yango-api.ts) и текущую схему вычислений (`spend`, `averageCheck`, `topUsers`, `topDepartments`, `rows`).

### 2) Добавить main CRM API для Bussiness Center
- Создать:
  - `/app/api/bussiness-center/summary/route.ts`
  - `/app/api/bussiness-center/export/route.ts`
- Контракт:
  - `POST summary`: `{ tokenLabel, clientId, since?, till? }`
  - `POST export`: `{ tokenLabel, clientId, since?, till?, format: "csv"|"xlsx" }`
- Безопасность:
  - `requireApprovedUser`.
  - Если `getClientScope()` есть — использовать только scope пользователя.
  - Проверять, что internal пользователь имеет доступ к выбранному клиенту (по паттерну `/api/request-rides-clients`).

### 3) Добавить main страницу Bussiness Center с выбором клиента
- Создать страницу:
  - `/app/(crm)/bussiness-center/page.tsx`
- UI-паттерн взять из Communications/Request Rides:
  - selector клиента через `/api/request-rides-clients`;
  - dropdown в стиле Request Rides (`rr-make-panel-dropdown-trigger`, `rr-dropdown-panel`, `rr-dropdown-option`), чтобы визуально совпадало.
- Контент:
  - KPI карточки (day/week/month/total, rides, average check);
  - top users/departments;
  - таблица `rows`;
  - экспорт CSV/XLSX.

### 4) Встроить раздел в main CRM навигацию и метаданные
- Обновить:
  - [/Users/igorkuznetsov/Projects/my-crm/components/layout/Sidebar.tsx](/Users/igorkuznetsov/Projects/my-crm/components/layout/Sidebar.tsx) — новый пункт `Bussiness Center`.
  - [/Users/igorkuznetsov/Projects/my-crm/app/(crm)/layout.tsx](/Users/igorkuznetsov/Projects/my-crm/app/(crm)/layout.tsx) — `resolvePageKey` для `/bussiness-center`.
  - [/Users/igorkuznetsov/Projects/my-crm/components/layout/Header.tsx](/Users/igorkuznetsov/Projects/my-crm/components/layout/Header.tsx) — `pageMeta` для нового раздела.

### 5) Согласовать client и main finance без регрессий
- Оставить `/app/client/financial-center/page.tsx` рабочим.
- По возможности перевести его на shared helper, чтобы убрать дублирование и различия между main/client расчетами.

### 6) Release-дисциплина
- После реализации:
  - bump версии;
  - запись в [/Users/igorkuznetsov/Projects/my-crm/components/dashboard/ReleaseNotesPanel.tsx](/Users/igorkuznetsov/Projects/my-crm/components/dashboard/ReleaseNotesPanel.tsx) с commit hash;
  - затем deploy по текущему release flow.