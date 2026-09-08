# omp-prompt-refine

`/refine` compiles a rough [OMP](https://omp.sh) prompt and puts it back in the editor. It never sends.

Short requests stay short. Hard ones pick up invariants, scope, anti-workaround rules, and a definition of done.

## Install

OMP 18+.

```text
/marketplace add Shadorain/omp-prompt-refine
/marketplace install prompt-refine@omp-prompt-refine
```

Restart the session. `/refine` shows up in autocomplete. No extra config. Uses the model already selected.

Clone instead:

```bash
git clone https://github.com/Shadorain/omp-prompt-refine.git ~/.omp/agent/extensions/prompt-refine
```

Then restart.

## Use

Type a draft. `Alt+Shift+R`, or:

```text
/refine --deep
rewrite the onboarding email so it does not promise a feature we have not shipped
```

Apply / Edit / Cancel. You still hit send.

`/refine` as the whole composer line clears the editor first. Use the shortcut or the two-line form.

`Alt+R` is OMP retry. This does not steal it.

```text
/refine
/refine --light
/refine --deep
/refine --model <model-or-role>
```

No args means current editor text. Text after the flags is the draft.

## Modes

Light keeps it brief. `make this button blue` barely changes.

Default adds structure only when it earns the bytes.

Deep runs a critic, then a compiler. Notes stay short.

## Models

`--model` wins, then `@prompt_refiner` / `prompt_refiner`, then the current session model.

Deep critic: `@prompt_critic` / `prompt_critic`, else the compiler model.

```yaml
modelRoles:
  prompt_refiner: "@slow"
  prompt_critic: "@advisor"
```

`--model` takes the same strings OMP does.

## Behavior

Keeps intent, names, paths, numbers, constraints, requested skills.

Adds end state, non-goals, failure modes, and mechanical checks when the draft is actually hard.

Does not invent requirements.

Child session has no tools, MCP, shell, or writes. Failures and Cancel restore the original draft.

Context packet: the draft, last 8 user/assistant turns with no tool dumps, cwd, git branch, first 2k of `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md`.

The packet goes to the resolved model through your existing OMP credentials. Nothing is saved as a project session.

## Tests

```bash
bun test
```

## License

MIT
