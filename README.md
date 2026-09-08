# omp-prompt-refine

Type a rough prompt. Press `Alt+Shift+R`. A tighter version lands back in the editor.

Nothing is sent until you send it.

Short requests stay short. `make this button blue` should come back almost as-is. A messy architecture or research ask should pick up the constraints an agent will otherwise dodge.

## Install

OMP 18+.

```text
/marketplace add Shadorain/omp-prompt-refine
/marketplace install prompt-refine@omp-prompt-refine
```

Restart OMP. `/refine` shows up in autocomplete. No extra config. It uses whatever model you already have selected.

Prefer a clone?

```bash
git clone https://github.com/Shadorain/omp-prompt-refine.git ~/.omp/agent/extensions/prompt-refine
```

Restart after that too.

## Use

Leave the draft in the editor and press `Alt+Shift+R`.

Or put the command on the first line:

```text
/refine --deep
rewrite the onboarding email so it does not promise a feature we have not shipped
```

You get Apply, Edit, or Cancel. Apply puts the compiled prompt in the composer. You still hit send.

Don't submit `/refine` as the only line in the composer. That clears the editor first. Use the shortcut, or the two-line form.

`Alt+R` is OMP's retry key, so this uses `Alt+Shift+R`.

```text
/refine              adaptive. adds structure only when the draft needs it
/refine --light      clarity. keep it short
/refine --deep       a critic pass, then a compiler pass
/refine --model @slow
```

Text after the flags is the draft. No text means "use what's in the editor."

## Optional models

`--model` wins. Otherwise `@prompt_refiner` / `prompt_refiner`. Otherwise the current session model.

Deep mode's critic: `@prompt_critic` / `prompt_critic`, else the same model as the compiler.

```yaml
# ~/.omp/agent/config.yml
modelRoles:
  prompt_refiner: "@slow"
  prompt_critic: "@advisor"
```

`--model` takes the same strings OMP does.

## What it won't do

Invent requirements. Widen scope. Auto-send. Edit your repo.

The child session has no tools, shell, MCP, or file writes. Failures and Cancel restore the original draft.

It does send a small context packet to the model you already use: the draft, the last few chat turns (no tool dumps), cwd, git branch, and the start of `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md` if those files exist.

## Tests

```bash
bun test
```

## License

MIT
