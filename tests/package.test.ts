import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("publishable OMP extension package", () => {
	test("declares an OMP extension entry and MIT license files", async () => {
		const pkg = (await Bun.file(join(root, "package.json")).json()) as {
			name: string;
			license: string;
			files?: string[];
			keywords?: string[];
			omp?: { extensions?: string[] };
			peerDependencies?: Record<string, string>;
		};
		expect(pkg.name).toBe("omp-prompt-refine");
		expect(pkg.license).toBe("MIT");
		expect(pkg.omp?.extensions).toEqual(["./index.ts"]);
		expect(pkg.files).toEqual(expect.arrayContaining(["index.ts", "src", "README.md", "LICENSE", ".omp-plugin"]));
		expect(pkg.keywords).toEqual(expect.arrayContaining(["omp", "extension", "omp-extension"]));
		expect(pkg.peerDependencies?.["@oh-my-pi/pi-coding-agent"]).toBeDefined();
		expect(existsSync(join(root, "LICENSE"))).toBe(true);
		expect(existsSync(join(root, "index.ts"))).toBe(true);
		expect(existsSync(join(root, "README.md"))).toBe(true);
		expect(existsSync(join(root, ".omp-plugin", "marketplace.json"))).toBe(true);
	});
});
