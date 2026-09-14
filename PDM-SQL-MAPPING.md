# Memgine PDM → PostgreSQL SQL Mapping

Source: latest uploaded/checked-in PDM workbook.

## Generated scope

- Entity Catalogue: 52 entities
- Entities with attributes / physical tables generated: 50
- Entities intentionally excluded from baseline because the PDM has no Attributes rows: QR Code Type, QR Scan Result
- Attributes: 610
- Active Relationships in the uploaded workbook: 95
- Validation Rules: 51

## Important relationship note

The uploaded workbook currently contains REL090 and does not contain REL098 or REL099. The SQL was generated from the uploaded workbook exactly as supplied; no relationship was invented or removed during generation.

## Type mapping

| PDM type | PostgreSQL |
|---|---|
| Identifier | varchar(length), default length 36 when length is absent |
| Text | varchar(length), or text when no length is supplied |
| Phone Number / PhoneNumber | varchar(20) unless a length is supplied |
| Email | varchar(254) |
| Timestamp | timestamp without time zone |
| Date | date |
| Integer | integer |
| Boolean | boolean |
| Decimal p,s | numeric(p,s) |
| Decimal without precision | numeric(12,2) |
| JSON/XML | jsonb |
| JSON / JSONB | jsonb |

## Defaults

Only unambiguous PDM defaults are emitted. Ambiguous placeholders such as `—`, `-`, `None`, `NULL`, `Auto Generated`, `System`, `User`, `Yes`, `No`, and `Template default` are not emitted as database defaults.

This is intentional: those values are metadata in the PDM and should not become accidental PostgreSQL values.

## Constraints

Primary keys, NOT NULL, attribute-level UNIQUE, relationship foreign keys, explicit range/date checks, and selected composite uniqueness rules are generated.

Cross-entity business rules such as "Store must belong to Organization" are not implemented as simple CHECK constraints because they require joins/triggers/application validation.

## Reference data

Reference Data plus Entity Type / Entity Status data are generated where the target entity has physical attributes.

QR Code Type and QR Scan Result reference rows are intentionally not seeded because those entities currently have no PDM Attributes definitions.

## Environment

Local DEV:
- PostgreSQL: 17
- database: memgine_dev
- schema: memginedev
- intended port: 5433

PROD:
- database: memgine
- schema: memgine

No application objects are created in the PostgreSQL `public` schema.
