# DESIGN_SPEC — CRM UI contract (my-crm)

Источник правды по токенам и паттернам: **`app/globals.css`**. Этот документ — краткий контракт для ревью и для промптов в Cursor; при конфликте с кодом приоритет у **`globals.css`** и у актуальных страниц в `app/` / `components/`.

Связанные документы: [`docs/figma-integration.md`](docs/figma-integration.md), правило Cursor **crm-ui-design-workflow**.

---

## 1. Цветовые токены (`:root`)

| Токен | Назначение | Значение (канон) |
|-------|------------|-------------------|
| `--background` | базовый фон страницы (legacy) | `#d8dbe0` |
| `--foreground` | основной текст | `#0f1115` |
| `--muted` | вторичный текст | `#5d636d` |
| `--panel` | поверхности панелей | `#ffffff` |
| `--border` | границы по умолчанию | `#d7dbe2` |
| `--accent` | акцент / primary CTA | `#ff2d2d` |
| `--accent-strong` | градиент primary, hover | `#c70f1f` |
| `--shadow-soft` | тень карточек | см. `globals.css` |
| `--shadow-lift` | тень hover lift | см. `globals.css` |
| `--ease-ui` | кривая анимаций UI | `cubic-bezier(0.2, 0.8, 0.2, 1)` |

Make / Request Rides дополнительно: `--rr-*`, `--make-glass-shadow`, `--make-glass-shadow-hover` — см. `globals.css`.

**Правило:** новые «фирменные» цвета добавлять в `:root` или в именованный класс в `globals.css`, а не разбрасывать произвольные `#hex` по компонентам (исключения ниже).

---

## 2. Оболочка приложения

| Элемент | Ожидание |
|---------|-----------|
| Основной layout CRM | [`components/layout/AppShell.tsx`](components/layout/AppShell.tsx) оборачивает контент; фон рабочей области — класс **`crm-make-shell`** (градиент + «стеклянный» вид). |
| Страницы | Контент в сегментах `app/(crm)/`, `app/client/` под тем же shell. |
| Логин / flash | Класс **`crm-make-body`** (отдельный фон, см. `globals.css`). |

---

## 3. Компонентные классы (использовать повторно)

| Префикс / класс | Назначение |
|-----------------|------------|
| `crm-surface`, `glass-surface` | стеклянные панели |
| `crm-input` | поля ввода (часто вместе с `rr-input-volumetric` на Request Rides) |
| `crm-label` | подписи полей (uppercase, плотная типографика) |
| `crm-button-primary` | основная кнопка (градиент accent) |
| `crm-hover-lift` | интерактивные кнопки/карточки с приподниманием |
| `crm-page` | вертикальный ритм страницы (`gap`) |
| `make-glass-card` / `make-glass-card-static` | карточки в стиле Figma Make |
| `rr-make-panel`, `rr-make-panel-summary`, `rr-make-panel-body`, `rr-make-panel-summary-title-sm`, `rr-make-panel-summary-title-md` | аккордеоны Request Rides |
| `rr-glass-column-shell` | колонка формы поверх карты |
| `make-shell-blob--a/b/c` | декоративные пятна фона (CSS-only) |

---

## 4. Типографика (ориентиры)

| Класс | Роль |
|-------|------|
| `crm-title-xl` | крупные заголовки страниц |
| `crm-section-title` | заголовки секций |
| `crm-subtitle` | подзаголовки, вторичный текст |
| `crm-label` | лейблы полей |

Шрифты: **`--font-geist-sans`** / **`--font-geist-mono`** из темы Next (`@theme inline`).

---

## 5. Исключения (допустимые отходы от токенов)

1. **Графики и визуализации** (например dashboard): серии на графиках могут использовать собственные цвета для различимости — это не «фирменный фон страницы».
2. **Tailwind palette** (`slate-*`, `red-*`, …): допустимо для локальной иерархии при условии согласованности с макетом; предпочтительно опираться на те же оттенки, что уже используются на соседних экранах.
3. **Сторонние виджеты / карта**: цвета контролируются компонентом карты или провайдером.

---

## 6. Чеклист тестирования UI (ручной + Cursor)

Перед релизом изменений UI:

- [ ] Фон CRM: виден **`crm-make-shell`**, нет «случайного» сплошного серого без градиента на ключевых страницах.
- [ ] Primary действия используют **`crm-button-primary`** или согласованный градиент красной шкалы из страницы (например Request Rides).
- [ ] Поля форм: **`crm-input`** / **`rr-input-volumetric`**, фокус с красным кольцом/бордером как в `globals.css`.
- [ ] Карточки списков: **`make-glass-card-static`** или **`crm-surface`**, а не одноразовые inline-стили без причины.
- [ ] Контраст текста: основной текст читаем на фоне панелей (WCAG — по возможности).
- [ ] Навигация: Sidebar / Header не ломают общий shell после правок.
- [ ] Request Rides: колонка формы использует **`rr-*`** паттерны; карта не перекрыта некликабельными слоями (`pointer-events` проверен).

Регрессия после правок CSS: очистить кэш сборки при странностях (`rm -rf .next`), один процесс dev на порту.

---

## 7. Промпты для Cursor (проверка соответствия)

Скопируйте в чат с агентом:

1. **Общая проверка**  
   `Read DESIGN_SPEC.md and app/globals.css. Check changed files for compliance: prefer css tokens and crm-* / make-* / rr-* classes; flag raw hex outside globals.css and exceptions in §5.`

2. **Цвета и отступы**  
   `Verify colors and spacing against DESIGN_SPEC.md §1–§4: accent usage, shell class, card patterns. List any mismatches with file paths.`

3. **Чеклист**  
   `Run through the testing checklist in DESIGN_SPEC.md §6 for the pages touched in this branch. Mark pass/fail per item.`

**Важно:** Cursor не выполняет «автоматический аудит» без чтения файлов — нужно явно указать агенту прочитать **`DESIGN_SPEC.md`** и соответствующие компоненты. При желании позже можно добавить ESLint-правила под ваш стиль (не входит в текущий документ).

---

## 8. История

| Дата | Изменение |
|------|-----------|
| 2026-05-03 | Первая версия: зафиксированы токены из `globals.css` и паттерны CRM / Make / RR. |
