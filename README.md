# omp-prompt-refine

You have a rough prompt. `/refine` rewords it so the agent you're about to send it to is more likely to do what you meant.

The result goes back in the editor. You still hit send.

A one-liner stays a one-liner. A vague or overloaded ask gets clearer intent with limited context, fewer holes, and language an agent can actually follow.

## Install

OMP `v18.*`+

```text
/marketplace add Shadorain/omp-prompt-refine
/marketplace install prompt-refine@omp-prompt-refine
```

Or clone:

```bash
git clone https://github.com/Shadorain/omp-prompt-refine.git ~/.omp/agent/extensions/prompt-refine
```

Restart OMP. `/refine` shows up in autocomplete. No extra config is needed, it uses the model you already have selected.

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

Text after the flags is the draft. No text means "use what's in the editor."

## Flags

```text
/refine
```

Reword the editor draft. Add structure only if the draft needs it.

```text
/refine --light
/refine --light make this button blue
```

Say it more clearly. Keep it short. A one-liner stays a one-liner.

```text
/refine --deep
/refine --deep redesign auth so sessions cannot be stolen by swapping the cookie store
```

Look for ways an agent could miss the point, then rewrite. Optional critic model if you set one.

```text
/refine --model @slow
/refine --model provider/id --deep
```

Use this model for this run. Autocomplete lists models this session can actually run, plus `@prompt_refiner` and `@prompt_critic`. Same strings OMP uses elsewhere.

```text
/refine --no-context
/refine --deep --no-context
```

Refine the draft only. Skip recent chat, git branch, and project files.

```text
/refine --last
```

Reword the previous user message, not the editor. Skips a prior `/refine` line. Do not pass extra prompt text.

```text
/refine --undo
```

Put the pre-Apply draft back. Apply and Edit stash it. No other flags.

```text
/refine --setup
```

Pick a default refiner, an optional critic, and extra context files. Writes `~/.omp/agent/prompt-refine.json`. No other flags.

`--light` and `--deep` cannot be combined. `--undo`, `--setup`, and `--last` cannot take a prompt. `--model` and `--no-context` mix with `--light` or `--deep`.

## Optional models

`--model` wins. Otherwise `@prompt_refiner` / `prompt_refiner`. Otherwise the model saved by `/refine --setup`. Otherwise the current session model.

Deep mode's critic: `@prompt_critic` / `prompt_critic`, else the setup critic, else the same model as the rewrite.

```yaml
# ~/.omp/agent/config.yml
modelRoles:
  prompt_refiner: "@slow"
  prompt_critic: "@advisor"
```

Or run `/refine --setup` and pick from the same model list OMP uses. That writes `~/.omp/agent/prompt-refine.json`.

`--model` takes the same strings OMP does.

## What it won't do

Change what you asked for. Invent extra work. Send the prompt. Touch your repo.

The rewrite runs in a child session with no tools, shell, MCP, or file writes. Failures and Cancel put the original draft back.

It can peek at a little context so the wording fits the conversation: last few chat turns (no tool dumps), cwd, git branch, and the start of `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md` plus any extra files from `/refine --setup`. `--no-context` turns that off.
