# omp-prompt-refine

Prompt compiler for [OMP](https://omp.sh). `/refine` takes a rough draft plus a bounded slice of session context, looks for ambiguity and likely agent failure modes, and puts a stronger prompt back in the editor. It never sends the result.

This is not "rewrite this more clearly." Simple requests stay short. Hard requests gain invariants, scope, anti-workaround constraints, and mechanical acceptance criteria.

## Install

OMP 18+. Clone into the auto-discovery directory, then restart OMP:

```bash
git clone https://github.com/Shadorain/omp-prompt-refine.git ~/.omp/agent/extensions/prompt-refine
```

That is the whole install. `/refine` should show up in slash-command autocomplete. No extra config. It uses the model already selected in the session.

Already have a clone somewhere else? Symlink it:

```bash
ln -s /path/to/omp-prompt-refine ~/.omp/agent/extensions/prompt-refine
```

Or pin the path in `~/.omp/agent/config.yml` instead of auto-discovery:

```yaml
extensions:
  - /path/to/omp-prompt-refine
```

The host supplies `@oh-my-pi/pi-coding-agent`. This extension has no extra runtime dependencies.

Restart existing OMP sessions after install. Extensions load at session start.

## Use it

1. Type a rough prompt in the composer.
2. Hit `Alt+Shift+R`, or put `/refine` on the first line with the draft below it.
3. Wait for Apply / Edit / Cancel.
4. Apply puts the compiled prompt in the composer. You still hit send.

```text
/refine --deep
rewrite the onboarding email so it does not promise a feature we have not shipped
```

Submitting `/refine` as the whole composer line clears the editor first. To refine an unsent draft in place, use the shortcut or the two-line form above.

`Alt+R` is OMP's retry binding. This extension does not steal it.

```text
/refine
/refine --light
/refine --deep
/refine --model <model-or-role>
```

Text after the flags is the draft. No text means "use the current editor contents."

## Modes

**Light.** Clarity and structure only. Preserves brevity. "make this button blue" stays almost unchanged.

**Default (adaptive).** Adds scope, invariants, verification, and anti-workaround constraints only where they earn their keep. A difficult architecture prompt should come out substantially tighter. A one-liner should not become a spec.

**Deep.** Two isolated model calls. A critic lists how a capable agent could technically comply while missing the real goal. A compiler then writes the prompt using that critique. User-visible notes stay short.

## Model routing

Provider-agnostic. Uses OMP model roles, not extension-specific provider config.

```text
/refine --model <explicit>
        else @prompt_refiner / prompt_refiner
        else the current session model
```

Deep critic:

```text
@prompt_critic / prompt_critic
        else the compiler model
```

Zero extra config is enough. To pin models, add roles in the normal OMP config (`~/.omp/agent/config.yml` or `/settings`):

```yaml
modelRoles:
  prompt_refiner: "@slow"
  prompt_critic: "@advisor"
```

Use whatever models you actually have. Nothing in this extension names a provider except as documentation examples.

`--model` accepts the same strings OMP does: `provider/id`, a bare id, `@slow`, a custom role.

## What the compiler does

Keeps intent, facts, names, paths, numbers, explicit constraints, requested skills/tools, and deliberate scope.

Adds, when useful: end state, invariants, disambiguation, non-goals, priority, likely failure modes, anti-workaround rules, objective acceptance checks, verification, stop conditions.

Does not invent requirements, widen scope, or dump a giant critique into the editor.

## Context

The child model sees a bounded packet, not the whole session:

- the current draft (authoritative)
- last 8 user/assistant turns, truncated, no tool dumps
- cwd and git branch when available
- the first 2k of `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md` if they exist in cwd

Recent user instructions in that window are treated as authoritative constraints. Conversation and repo files are supporting context.

## Isolation

Refinement runs in an in-memory child session with no tools, no MCP, no LSP, no extensions, no skills, no shell, and no file writes. `/refine` cannot edit the project. Failures and Cancel leave the original editor text in place. Apply never auto-submits.

## UI

While the child session runs, a line above the composer shows a braille spinner, the ESC glyph (`󱊷`), and a violet-to-blue color sweep on `Refining…`. Esc or Ctrl+C aborts the child session, restores the original draft, and does not submit. The line is disposed on finish, error, or cancel.

After `/refine `, autocomplete lists `[prompt]` first (optional; empty refines the editor draft), then `--light`, `--deep`, and `--model`. Ghost text after the cursor is `[prompt]`. Flags are optional.

After a successful compile, Apply / Edit / Cancel is shown with the notes and the refined prompt in the selector body:

```text
Prompt refined using @prompt_refiner

Changes:
• Added explicit acceptance criteria

Refined prompt:
<the compiled prompt>

Apply / Edit / Cancel
```

Apply puts the prompt in the composer. Edit opens OMP's multiline editor. Cancel keeps the original draft.

## Examples

### Coding, light

Before: `make this button blue`

After: `Make this button blue.`

### Coding, default

Before: `decouple billing from the ORM`

After might include: remove the coupling rather than hide it; do not add a compatibility facade; search the whole class of call sites; do not declare done until those paths are gone and tests covering retries pass.

### Research

Before: `is this paper any good`

After might ask for the claim, the evidence standard, what "good" means (method, novelty, reproducibility), and a stop condition when sources disagree.

### Writing

Before: `rewrite the onboarding email`

After might lock tone, forbidden promises, required facts, and a definition of done such as "fits one screen, no feature we have not shipped."

## Privacy

The draft plus the bounded packet go to the resolved model through your existing OMP credentials. Nothing is stored as a new project session. Child sessions are in-memory.

## Tests

```bash
bun test
```

## License

MIT
