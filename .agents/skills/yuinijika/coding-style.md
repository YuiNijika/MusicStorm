---
name: "yuinijika-coding-style"
description: "YuiNijika's coding conventions across PHP, C++, TypeScript, Python, and Rust, aligned with Anon Framework coding standards. Invoke when generating or reviewing code in YuiNijika's style."
---

# Coding Style — YuiNijika

Aligned with the [Anon Framework Coding Standards](https://anon.miomoe.cn/guide/coding-standards.html).

These are hard constraints. Soft "prefer if convenient" reading is forbidden.
If the current project already has conventions, **project conventions win first**; use this file as fallback.

---

## Hard Operational Rules

### 1. Terminal / Scripts

- MUST use **Python** for automation scripts. MUST NOT write PowerShell (`.ps1`) when Python can do it.
- MUST NOT run pointless PowerShell in the terminal. PowerShell encoding/syntax burns tokens via retries.
- MUST NOT spawn scripts for tiny work the model can do directly (read/edit/search/rename).
- Scripts are only for real bulk automation that cannot be done cleanly by direct tools.

### 2. After Code Changes

- MUST NOT run dev / build / package-manager install after edits unless the user explicitly asks.
- Environment is already running. Post-edit busywork is forbidden.
- Flow: edit → lint if needed → stop.

### 3. File Access

- MUST read/edit files with file tools.
- MUST NOT use terminal to read/write files (`cat` `type` `Get-Content` `sed` `awk` `echo >` and equivalents).

### 4. Clean Deletion

- If a directory becomes empty after deletes, MUST delete the directory too.
- No empty folders. No leftover junk.

### 5. UI Text

- User-facing copy MUST describe only what users see and experience in the real scenario.
- MUST NOT mention tech stack in page banners/taglines/descriptions.
- MUST NOT describe what was changed / how it was built.

### 6. UI Component Libraries

- Missing library components: MUST install via the library CLI / official install method.
- MUST NOT hand-write library components that the library already provides.
- MUST NEVER edit files inside the library component directory.

### 7. Component & Modular Development

- MUST structure code as self-contained components/modules.
- One component = one directory, following Directory-Scoped Naming.
- Export only public API; hide internals.
- Prefer composition over deep inheritance.
- Dependencies MUST be explicit (constructor/factory injection). No hidden globals.
- One responsibility per component. Do not mix UI + business + data access in one file.
- Removing a component means removing its whole directory.

---

## Formatting

- Indentation: **4 spaces**. Tabs forbidden.
- Line endings: **LF**. CRLF forbidden.
- Encoding: **UTF-8 without BOM**.
- One trailing newline at EOF.

## Naming Quick Reference

| Element | PHP | C++ | TypeScript | Python | Rust |
|---|---|---|---|---|---|
| Class / Interface / Struct | `PascalCase` | `PascalCase` | `PascalCase` | `PascalCase` | `PascalCase` |
| Method / Function | `camelCase` | `camelCase` | `camelCase` | `snake_case` | `snake_case` |
| Variable / Property | `camelCase` | `snake_case` | `camelCase` | `snake_case` | `snake_case` |
| Constant | `UPPER_SNAKE` | `UPPER_SNAKE` | `UPPER_SNAKE` | `UPPER_SNAKE` | `UPPER_SNAKE` |
| File name | `PascalCase` | `snake_case` | `kebab-case` | `snake_case` | `snake_case` |
| Boolean prefix | `is`/`has`/`should` | `is_`/`has_`/`should_` | `is`/`has`/`should` | `is_`/`has_`/`should_` | `is_`/`has_`/`should_` |

Python/Rust method & variable naming stays `snake_case`. Do not force camelCase there.

## Directory-Scoped Naming

If a directory already scopes the content, MUST NOT repeat the directory name in file/class names.

```
// Good
Test/AI              → class AI
components/Button    → export Button
models/User          → class User

// Bad
Test/TestAI          → class TestAI
components/ButtonComponent → export ButtonComponent
models/UserModel     → class UserModel
```

Import-site aliasing is fine: `import { AI as TestAI } from './Test/AI'`.

## Type Declarations

Explicit types by default:

- **PHP**: typed props/params/returns. `strict_types=1`.
- **C++**: concrete types for params/returns; `auto` only with clear init.
- **TypeScript**: `strict: true`. `any` forbidden unless documented reason.
- **Python**: type hints on all public functions.
- **Rust**: `Option<T>` / `Result<T, E>`; no casual `unwrap()`.

## Early Return

Handle errors/edges first. Keep main path shallow.

```php
// Good
if (!$user) {
    throw new Exception('User not found');
}
// main logic

// Bad
if ($user) {
    if ($user->isActive) {
        // main logic
    }
}
```

## No Magic Numbers

Named constants/enums only.

## Single Responsibility

One function does one thing. Long function → split helpers.

---

## Comment Style

**Code = what. Comments = why.**

### Comment text purity (hard rule)

- Applies to ALL languages in this file: PHP, C++, TypeScript, Python, Rust. No per-language exemptions.
- Comment text MUST be pure plain prose.
- MUST NOT contain any symbolic punctuation in comments: parentheses `( )` `（ ）`, colons `: ：`, semicolons `; ；`, arrows or dashes `->` `=>` `—` `-`, equals `=` `==`, quotes, or backticks.
- Refer to code in plain words, never raw identifiers or symbols. Say `the environment array`, never `$_ENV`. Say `the putenv function`, never `putenv()`.

### Forbidden comments

```php
// If status is 1
```

```python
# Increment the counter
```

```cpp
// Loop through the items
```

```typescript
// Return the result
```

```rust
// Cache the value
```

### Required style of comments

```php
// Production may disable putenv so fall back to the environment array
```

```python
# Cache rebuild runs async so return the stale value without waiting
```

```typescript
// React batches state updates so two calls still render once
```

```cpp
// move leaves the source empty so check validity before reuse
```

```rust
// unwrap is safe here since the schema guarantees the field exists
```

Doc comments only for complex logic, public API contracts, special exceptions, or non-obvious structures.

---

## PHP & Anon Framework

- Every new file: `declare(strict_types=1);`
- Pure PHP: omit closing `?>`
- Directory-semantic names: `Auth/Manager.php` not `Auth/AuthManager.php`
- Views: `kebab-case.php`
- PSR-4 uppercase dirs: `app/Controller`, `app/Service`, `app/Route`

Env:

```php
// Forbidden
$val = getenv('KEY');

// Required
$val = trim((string) Env::get('KEY', ''));
```

`JWT_SECRET` only in `.env`, never config files.

Response contract:

```json
{ "success": true,  "code": 200, "message": "OK",  "data": {} }
{ "success": false, "code": 400, "message": "...", "error_code": "BAD_REQUEST" }
```

`code` MUST be numeric HTTP status. NEVER string.

Controller thin: params → Service → Response.
Service owns business + IO.

Production checklist (only when user asks deploy/verify):

- `composer dump-autoload`
- clear config/route cache
- restart php-fpm / reload opcache
- verify Linux casing
- verify cookie flags

---

## C++

- Follow existing project style; prefer C++17/20
- `#pragma once`
- Include order: own → project → third-party → std
- No `using namespace std;` in headers
- Prefer smart pointers / `enum class` / range-for / structured bindings
- Errors: `optional` / `expected` / throw-by-value catch-by-const-ref

---

## TypeScript

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

- `interface` for object shapes; `type` for unions/intersections
- 3+ params → object param + destructure
- async: `Promise<T>` + `async/await` only
- modules: `kebab-case.ts`; React components: `PascalCase.tsx`

---

## Python

- PEP 8; format with Ruff or Black
- Public functions MUST have type hints
- Prefer f-strings and `pathlib.Path`
- Dependencies in `requirements.txt` or `pyproject.toml`

---

## Rust

- `rustfmt` defaults; `clippy` clean
- Prefer `&str` / `&[T]`; avoid unnecessary clone
- Libraries: `thiserror`; apps: `anyhow`
- `unwrap`/`expect` only when failure is impossible, with why-comment
- Modules: `snake_case.rs`