# Agent Instructions (AGENTS.md)

This file provides high-signal, repo-specific guidance for AI agents working on **Whatsmo**. It is designed to prevent common mistakes and speed up onboarding.

## Architecture Summary
- **Backend (Rust):** Uses `tauri` commands to bridge with `whatsapp-rust`. Handles protocol, encryption, and session SQLite storage.
- **Frontend (SvelteKit):** Static adapter. Uses a centralized store (`src/lib/stores/app.ts`) for messaging state.
- **Persistence:** 
    - **Session:** SQLite (Rust side).
    - **Messages/UI:** `localStorage` (Frontend side) – *Note: Complex state is often rebuilt from history sync.*

## Developer Commands
| Task | Command |
| :--- | :--- |
| **Lint & Typecheck** | `bun run check` |
| **Desktop Dev** | `bun run tauri dev` |
| **Android Dev** | `bun run android:dev` |
| **Build Test APK** | `bun run android:build:apk:test` |
| **Install to Device** | `bun run android:install` |
| **Android Env** | `. ./scripts/android-env.sh` |

## Critical Conventions & Gotchas

### 1. Local Filesystem Discipline
**NEVER** use the user's home directory for SDKs or caches. 
- Use the `.local/` directory in the project root.
- Caches for Android SDK, Cargo, Gradle, and NPM are pre-configured to stay within this folder.

### 2. Identity & Name Resolution
WhatsApp uses both **LIDs** (Linked IDs) and **JIDs** (Phone Numbers).
- **Rule:** Before showing a sender ID, check if it's a "raw" identifier.
- **Helper:** Use `isRawIdentifierName(name)` in `src/lib/stores/app.ts`.
- **Resolution:** If a name is missing or raw, look up the LID mapping in the contact store.

### 3. UI/UX Style
Whatsmo prioritizes a "Classic WhatsApp" mobile feel.
- **Composer:** The input should be a filled rounded pill (`--message-in`) with icons (Emoji, Attach) **inside** the pill.
- **Safe Areas:** Always respect Android/iOS safe areas for headers and footers.

### 4. Command Bridge
When adding features, remember the flow:
1. Define a Rust command in `src-tauri/src/main.rs`.
2. Implement the logic in `src-tauri/src/whatsapp.rs`.
3. Invoke it via `invoke()` in `src/lib/api/whatsmo.ts`.
4. Update the Svelte store in `src/lib/stores/app.ts` based on the response or events.

### 5. Git Operations & git-master Skill
When performing ANY Git operations (commits, rebasing, history search), you **MUST** use the `git-master` skill.
- **Always Install First:** If it's not installed, always install it before proceeding: `mkdir -p .skills && curl -sL "https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/refs/heads/dev/src/features/builtin-skills/git-master/SKILL.md" -o .skills/git-master.md`
- **Using the Skill:** Read `.skills/git-master.md` using the `view_file` tool and follow its instructions meticulously to ensure atomic commits, correct style detection, and proper history rewriting.

## Testing & Verification
- **Verification Order:** Always run `bun run check` before committing UI changes.
- **Build Validation:** If touching Tauri/Rust, a desktop `tauri dev` run is the fastest way to verify, but Android-specific bugs require `android:dev`.

---
*Last updated from session `ses_231e`.*
