# Request Rides — bulk XLSX template

Use this layout when preparing a spreadsheet for the **Upload XLSX (bulk)** control on the `Request Rides` page (it appears after you select an API client). Use the **Sample** button next to it to download a ready-made example `.xlsx`. One row per ride.

## Columns

| Column | Purpose | Example |
| --- | --- | --- |
| A | Date and time of the ride | `27.04.2026 09:30` |
| B | Rider phone (Yango passenger user) | `+972501234567` |
| C | Driver comment | `Big suitcase, ring the bell` |
| D | Pickup (point A) | `Tel Aviv, Rothschild 1` |
| E | Stop or destination | `Tel Aviv, Dizengoff Center` |
| F | Stop or destination (optional) | `Tel Aviv, Allenby 50` |
| G | Stop or destination (optional) | `Tel Aviv, Yefet 12` |
| H | Stop or destination (optional) | `Bat Yam, Ben Gurion 5` |
| I | Phone notified for column D (pickup) — **parsed but ignored for SMS** | `+972501234567` |
| J | Phone notified for column E | `+972527654321` |
| K | Phone notified for column F | `+972500000001` |
| L | Phone notified for column G | `+972500000002` |
| M | Phone notified for column H | `+972500000003` |

The **last non-empty cell among D–H is the destination**. Every cell between pickup and that destination becomes a `Stop along the way`. A row may contain anywhere from 2 to 5 addresses.

Addresses can be in **Russian**, **English** or **Hebrew** — the language is detected per cell when geocoding via `/api/address-suggest`.

Columns **I–M** are the SMS recipients for the matching address (J for E, K for F, …). The phone in **column I (pickup)** is read but **never receives SMS** — passengers are only notified at intermediate stops and at the destination.

## Example sheet

| A | B | C | D | E | F | G | H | I | J | K | L | M |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `27.04.2026 09:30` | `+972501234567` | `Big suitcase, ring the bell` | `Tel Aviv, Rothschild 1` | `Tel Aviv, Dizengoff Center` |  |  |  |  | `+972501234567` |  |  |  |
| `27.04.2026 11:15` | `+972527654321` | | `רחוב הירקון 1, תל אביב` | `דיזנגוף סנטר, תל אביב` | `אלנבי 50, תל אביב` |  |  |  | `+972527654321` | `+972500000001` |  |  |
| `28.04.2026 07:00` | `+79123456789` | `VIP, без остановок` | `Москва, Тверская 1` | `Шереметьево, терминал D` |  |  |  |  | `+79123456789` |  |  |  |

A header row (e.g. `Date | Phone | Comment | Pickup | Stop 1 | …`) is allowed but not required — the parser auto-detects whether row 1 is a header.

## Behaviour notes

- Tariff is fixed by the form (`comfortplus_b2b` by default) — there is no tariff column.
- API client is taken from the form selector and applied to every row.
- Empty trailing rows are ignored.
- Rows with missing/invalid date, missing phone, missing pickup, only one address, or any failed geocoding are marked `blocked` in the preview and skipped when you confirm.
- Phones are not validated — leading apostrophes (Excel "force text" trick) and whitespace are stripped, the rest is sent as-is.
- Rows with 3+ geocoded addresses are auto-reordered for the fastest route in current traffic (when `GOOGLE_MAPS_API_KEY` is set). Pickup stays first; the destination is the last point of the optimized order. The preview shows an `Optimized · saves Nm` badge. Optimization is skipped silently when the key is not configured.
- Stop / destination phones (columns J–M) receive an automatic SMS at ride creation and a second SMS when a driver is assigned. SMS is sent via the configured Inforu gateway (env vars `INFORU_USERNAME`, `INFORU_API_TOKEN`, `INFORU_SENDER`).
