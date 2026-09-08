# omp-prompt-refine

You have a rough prompt. `/refine` rewords it so the agent you're about to send it to is more likely to do what you meant.

The result goes back in the editor. You still hit send.

A one-liner stays a one-liner. A vague or overloaded ask gets clearer intent, fewer holes, and language an agent can actually follow.

## Install

OMP 18+.

```text
/marketplace add Shadorain/omp-prompt-refine
/marketplace install prompt-refine@omp-prompt-refine
```

Restart OMP. `/refine` shows up in autocomplete. No extra config. It uses the model you already have selected.

Or clone:

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

Apply, Edit, or Cancel. Apply drops the reworded prompt into the composer. Then you send it.

Don't submit `/refine` as the only line. That clears the editor first. Use the shortcut, or the two-line form.

`Alt+R` is OMP's retry key, so this uses `Alt+Shift+R`.

```text
/refine              reword it, add structure only if the draft needs it
/refine --light      just say it more clearly. keep it short
/refine --deep       look for ways an agent could miss the point, then rewrite
/refine --model @slow
```

Text after the flags is the draft. No text means "use what's in the editor."

## Optional models

`--model` wins. Otherwise `@prompt_refiner` / `prompt_refiner`. Otherwise the current session model.

Deep mode's critic: `@prompt_critic` / `prompt_critic`, else the same model as the rewrite.

```yaml
# ~/.omp/agent/config.yml
modelRoles:
  prompt_refiner: "@slow"
  prompt_critic: "@advisor"
```

`--model` takes the same strings OMP does.

## What it won't do

Change what you asked for. Invent extra work. Send the prompt. Touch your repo.

The rewrite runs in a child session with no tools, shell, MCP, or file writes. Failures and Cancel put the original draft back.

It can peek at a little context so the wording fits the conversation: last few chat turns (no tool dumps), cwd, git branch, and the start of `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md` if those files exist.

## Tests

```bash
bun test
```

## License

MIT
