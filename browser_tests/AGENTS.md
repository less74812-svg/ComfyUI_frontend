# E2E Testing Guidelines

See `@docs/guidance/playwright.md` for Playwright best practices (auto-loaded for `*.spec.ts`).

## Directory Structure

```text
browser_tests/
├── assets/           - Test data (JSON workflows, images)
├── fixtures/
│   ├── ComfyPage.ts      - Main fixture (delegates to helpers)
│   ├── ComfyMouse.ts     - Mouse interaction helper
│   ├── VueNodeHelpers.ts - Vue Nodes 2.0 helpers
│   ├── selectors.ts      - Centralized TestIds
│   ├── components/       - Page object components
│   │   ├── ContextMenu.ts
│   │   ├── SettingDialog.ts
│   │   ├── SidebarTab.ts
│   │   └── Topbar.ts
│   ├── helpers/          - Focused helper classes
│   │   ├── CanvasHelper.ts
│   │   ├── CommandHelper.ts
│   │   ├── KeyboardHelper.ts
│   │   ├── NodeOperationsHelper.ts
│   │   ├── SettingsHelper.ts
│   │   ├── WorkflowHelper.ts
│   │   └── ...
│   └── utils/            - Utility functions
├── helpers/          - Test-specific utilities
└── tests/            - Test files (*.spec.ts)
```

## After Making Changes

- Run `pnpm typecheck:browser` after modifying TypeScript files in this directory
- Run `pnpm exec eslint browser_tests/path/to/file.ts` to lint specific files
- Run `pnpm exec oxlint browser_tests/path/to/file.ts` to check with oxlint

## Skill Documentation

A Playwright test-writing skill exists at `.claude/skills/writing-playwright-tests/SKILL.md`.

The skill documents **meta-level guidance only** (gotchas, anti-patterns, decision guides). It does **not** duplicate fixture APIs - agents should read the fixture code directly in `browser_tests/fixtures/`.

## AI-Assisted Test Creation

Three systems work together for test authoring:

### 1. Interactive Recorder CLI (`comfy-test`)

For QA testers and non-developers. Guides through the full flow:

```bash
pnpm comfy-test record     # Interactive 7-step recording flow
pnpm comfy-test transform   # Transform raw codegen to conventions
pnpm comfy-test check       # Verify environment prerequisites
pnpm comfy-test list        # List available workflow assets
```

Source: `tools/test-recorder/`

### 2. Codegen Transform Skill

For AI agents transforming raw Playwright codegen output. See `.claude/skills/codegen-transform/SKILL.md`.

Key transforms:
- `@playwright/test` → `../fixtures/ComfyPage` imports
- `page` destructure → `comfyPage` fixture
- `page.goto()` → removed (fixture handles navigation)
- `page.locator('canvas')` → `comfyPage.canvas`
- `waitForTimeout()` → `comfyPage.nextFrame()`
- Wraps in `test.describe` with tags and `afterEach` cleanup

### 3. Playwright AI Agents

Three agents in `.claude/agents/` are patched with ComfyUI context:

- **planner** — explores the app and creates test plans in `browser_tests/specs/`
- **generator** — converts test plans into executable `.spec.ts` files
- **healer** — debugs and fixes failing tests

To regenerate after Playwright updates: `bash scripts/update-playwright-agents.sh`

### MCP Server

The `.mcp.json` configures `playwright-test` MCP server for agent browser interaction:
```bash
pnpm exec playwright run-test-mcp-server
```
