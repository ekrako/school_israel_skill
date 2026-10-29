import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "skills/israel-school");
const read = (path: string) => readFileSync(path, "utf8");

describe("Skills IL listing", () => {
  it("keeps listing metadata compatible and attested at the released version", () => {
    const skill = read(join(root, "SKILL.md"));
    const frontmatter = skill.split("---")[1] ?? "";
    const keys = [...frontmatter.matchAll(/^([\w-]+):/gm)].map((match) => match[1]);
    expect(keys).toEqual(["name", "description", "license", "compatibility"]);

    const metadata = JSON.parse(read(join(root, "metadata.json")));
    const pkg = JSON.parse(read(join(root, "package.json")));
    expect(metadata.version).toBe(pkg.version);
    expect(metadata.display_name).toMatchObject({ he: expect.any(String), en: expect.any(String) });
    expect(metadata.supported_agents).toContain("claude-code");
    expect(read(".github/workflows/release.yml")).toContain("skills/israel-school/metadata.json");
  });
});
