# Conventions

The naming law for this repo. Applies to every identifier: variables, object keys, return values,
interface props, params, file names, JSON keys, SQL aliases.

## Singular everywhere

Collections are singular too. `form: FormDef[]`, not `forms`; `file`, not `files`; `entry`, not `entries`.
The noun names the *kind of thing held*, not the count. If a name needs to say "many", the type already does.

Exception: we never rename BIR's own identifiers (form ids, XML element names, savefile keys, folder names
like `savefile/`). Those are an external format we must stay byte-compatible with — quote them, don't "fix" them.

## Shape

| Kind | Rule | Example |
|---|---|---|
| booleans | `is_` / `has_` prefix | `is_amended`, `has_attachment` |
| codes | `{entity}_code` | `atc_code`, `rdo_code`, `tax_type_code` |
| counts | `_count` suffix | `page_count` |
| measurements | singular unit suffix | `amount_centavo`, `rate_percent` |
| JSON / persisted keys | snake_case | `form_id`, `saved_at` |
| TS locals, functions | camelCase | `loadProfile()` |
| types, components | PascalCase | `FormDef`, `FormList.tsx` |
| non-component files | kebab-case | `tax-rate.ts` |

## Money

Never do arithmetic on peso amounts as binary floats. Amounts are integer centavos (`amount_centavo: bigint`
or a safe integer) or go through the `decimal` helper. Display formatting is a separate step.
