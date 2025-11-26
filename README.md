# NPM Package Dependency Checker

A Node.js utility to scan projects for compromised npm packages by checking against the latest list from [Wiz Security's research repository](https://github.com/wiz-sec-public/wiz-research-iocs).

## Installation

No installation required! Just ensure you have Node.js installed (version 18+ for native fetch API support).

## Usage

### Interactive Mode

Simply run the script without arguments:

```bash
node index.js
```

You'll be prompted to:

1. Enter the path to your project directory
2. Choose between shallow or exhaustive check

## Scan Modes

### 1. Shallow Check (Recommended)

**What it does:**

- Recursively searches for all lock files in the project (including subdirectories)
- Parses lock files to find installed packages
- Checks against compromised package list

**Lock files supported:**

- `package-lock.json` (npm)
- `yarn.lock` (yarn)
- `pnpm-lock.yaml` (pnpm)
- `bun.lockb` (bun - limited support)

**What it detects:**

- Direct dependencies
- Peer dependencies
- Sub-dependencies (transitive dependencies)
- All packages in the entire dependency tree

**Advantages:**

- ⚡ Fast execution
- 🎯 Accurate - only checks actually installed packages
- 📊 Shows exact versions installed

### 2. Exhaustive Check

**What it does:**

- Recursively scans all files in the project
- Searches for package name references in code

**File extensions checked:**

- `.js`, `.json`, `.ts`, `.jsx`, `.tsx`, `.vue`, `.html`, `.md`

**What it detects:**

- Package imports/requires in code
- Package references in configuration files
- Any text mention of package names

**Advantages:**

- 🔎 Finds references even if not installed
- 📝 Useful for auditing documentation and comments
- 🔍 Catches packages referenced but not in lock files

**Note:** Skips `node_modules` and hidden directories (starting with `.`)

## How It Works

1. **Fetches Package List**: Downloads the latest compromised package list from Wiz Security's GitHub repository (799+ packages)

2. **Displays Scan Info**: Shows all packages being tested and scan mode details

3. **Performs Scan**:

    - **Shallow**: Finds and parses all lock files recursively
    - **Exhaustive**: Scans all matching file types recursively

4. **Reports Results**: Groups matches by package name and shows location/version details

## Output Example

### Shallow Check Output

```
⚠ Found 2 match(es):

📦 Package: compromised-pkg
  compromised-pkg@1.2.3 (found in dependencies)
  compromised-pkg@1.2.3 (found in packages)
```

### Exhaustive Check Output

```
⚠ Found 3 match(es):

📦 Package: compromised-pkg
  /path/to/file.js:42
    import compromisedPkg from 'compromised-pkg';
  /path/to/package.json:15
    "compromised-pkg": "^1.2.3"
```

## Version Matching

The script **ignores version numbers** when matching packages. If a package name appears in the compromised list, it will be reported regardless of version. This is intentional because:

- Compromised packages may affect multiple versions
- Security issues often span version ranges
- Better safe than sorry approach

## Important Notes

- 🌐 **Requires Internet**: Needs network access to fetch the compromised package list from GitHub
- 🔐 **Read-Only**: Script only reads files, never modifies your project
- ⚡ **Performance**: Shallow check is significantly faster for large projects
- 🏢 **Monorepo Support**: Handles projects with multiple package.json files in subdirectories

## Limitations

- Bun lock file format (`bun.lockb`) is not yet fully supported
- Exhaustive check may have false positives if package names appear in comments or documentation
- Only checks files with predefined extensions in exhaustive mode

## Data Source

Compromised package list is maintained by Wiz Security:
https://github.com/wiz-sec-public/wiz-research-iocs/blob/main/reports/shai-hulud-2-packages.csv

## License

This tool is provided as-is for security auditing purposes.
