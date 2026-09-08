import type { ModelQuery, ModelRef, ResolvedModel } from "./types.ts";

const REFINER_ROLE = "prompt_refiner";
const CRITIC_ROLE = "prompt_critic";

export function resolveRefinerModel(
	query: ModelQuery,
	explicit?: string,
	configured?: string,
): ResolvedModel | { error: string } {
	if (explicit) {
		const model = query.resolve(explicit);
		if (!model) return { error: `Model "${explicit}" is not available.` };
		return { model, source: explicit };
	}

	const atRole = query.resolve(`@${REFINER_ROLE}`);
	if (atRole) return { model: atRole, source: `@${REFINER_ROLE}` };

	const bareRole = query.resolve(REFINER_ROLE);
	if (bareRole) return { model: bareRole, source: REFINER_ROLE };

	if (configured) {
		const model = query.resolve(configured);
		if (!model) return { error: `Model "${configured}" is not available.` };
		return { model, source: configured };
	}

	const current = query.current();
	if (current) return { model: current, source: "current" };

	return {
		error: "No model available. Configure modelRoles.prompt_refiner or select a session model.",
	};
}

export function resolveCriticModel(query: ModelQuery, compiler: ModelRef, configured?: string): ResolvedModel {
	const atRole = query.resolve(`@${CRITIC_ROLE}`);
	if (atRole) return { model: atRole, source: `@${CRITIC_ROLE}` };

	const bareRole = query.resolve(CRITIC_ROLE);
	if (bareRole) return { model: bareRole, source: CRITIC_ROLE };

	if (configured) {
		const model = query.resolve(configured);
		if (model) return { model, source: configured };
	}

	return { model: compiler, source: "compiler" };
}
