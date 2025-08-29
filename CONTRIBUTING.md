# Build Process

The project uses Gulp to orchestrate the TypeScript build:
1. TypeScript Compilation: Converts `.ts` files in `src/` to JavaScript
2. Module Manifest Generation: Creates `module.json` by replacing template variables with values from package.json
3. Asset Pipeline: Copies CSS, templates (`templates/*.hbs`), and language files (`lang/*.json`)

## Key Build Commands

- `npm run devbuild` - Builds and copies directly to your FoundryVTT modules folder
- `npm run devwatch` - Same as devbuild but watches for file changes and auto-rebuilds
- `npm run build` - Standard build to `dist/` folder
- `npm run lint` - Runs ESLint to check TypeScript code quality

## Testing Setup

 1. Update `devDir` path in `package.json` to point to your FoundryVTT modules directory                                                │
  - Common locations:
    - Windows: `%USERPROFILE%/AppData/Local/FoundryVTT/Data/modules`
    - macOS: `~/Library/Application Support/FoundryVTT/Data/modules`
    - Linux: `~/.local/share/FoundryVTT/Data/modules`
2. Run `npm install` to install all TypeScript compilation tools and dependencies
3. Run `npm run devbuild` to compile TypeScript and copy to FoundryVTT
4. Verify module appears in FoundryVTT's module management screen
4. Launch FoundryVTT and enable the "Lava Flow" module in a test world
5. Look for the "Import Obsidian Vault" button in the Journal tab

## Development Workflow

Use npm `run devwatch` for active development - it will automatically recompile and copy files when you make changes to the TypeScript source files.

The module uses FoundryVTT's hook system (`renderJournalDirectory`) to inject its UI, so once built and enabled, you should see the import functionality immediately.