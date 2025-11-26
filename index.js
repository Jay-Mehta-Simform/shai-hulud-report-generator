const fs = require("fs");
const path = require("path");
const readline = require("readline");

const COMPROMISED_PACKAGES_URL =
	"https://raw.githubusercontent.com/wiz-sec-public/wiz-research-iocs/main/reports/shai-hulud-2-packages.csv";

let compromisedPackages = [];

const EXTENSIONS_TO_SEARCH = [".js", ".json", ".ts", ".jsx", ".tsx", ".vue", ".html", ".md"];

function createReadlineInterface() {
	return readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
}

function askQuestion(rl, question) {
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			resolve(answer);
		});
	});
}

async function fetchCompromisedPackages() {
	console.log("📥 Fetching latest compromised packages list from GitHub...");

	try {
		const response = await fetch(COMPROMISED_PACKAGES_URL);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.text();

		const lines = data.split("\n");
		const packages = [];

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;

			const match = line.match(/^([^,]+),/);
			if (match) {
				packages.push(match[1].trim());
			}
		}

		console.log(`✓ Loaded ${packages.length} compromised packages\n`);

		console.log("📋 Testing for the following compromised packages:");
		console.log("─".repeat(60));
		packages.forEach((pkg, index) => {
			console.log(`${(index + 1).toString().padStart(4)}. ${pkg}`);
		});
		console.log("─".repeat(60) + "\n");

		console.log("📄 File extensions checked in exhaustive mode:");
		console.log("─".repeat(60));
		console.log(`   ${EXTENSIONS_TO_SEARCH.join(", ")}`);
		console.log("─".repeat(60) + "\n");

		console.log("🔒 Lock files checked in shallow mode:");
		console.log("─".repeat(60));
		console.log("   package-lock.json (npm)");
		console.log("   yarn.lock (yarn)");
		console.log("   pnpm-lock.yaml (pnpm)");
		console.log("   bun.lockb (bun)");
		console.log("─".repeat(60) + "\n");

		return packages;
	} catch (error) {
		throw new Error(`Failed to fetch packages: ${error.message}`);
	}
}

function searchInFile(filePath, patterns) {
	try {
		const content = fs.readFileSync(filePath, "utf8");
		const matches = [];

		patterns.forEach((pattern) => {
			const regex = new RegExp(`\\b${pattern}\\b`, "gi");
			const lines = content.split("\n");

			lines.forEach((line, index) => {
				if (regex.test(line)) {
					matches.push({
						pattern: pattern,
						file: filePath,
						line: index + 1,
						content: line.trim(),
					});
				}
			});
		});

		return matches;
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error.message);
		return [];
	}
}

function scanDirectory(dirPath, patterns, results = []) {
	try {
		const entries = fs.readdirSync(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name);

			if (entry.name === "node_modules" || entry.name.startsWith(".")) {
				continue;
			}

			if (entry.isDirectory()) {
				scanDirectory(fullPath, patterns, results);
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name);
				if (EXTENSIONS_TO_SEARCH.includes(ext)) {
					const matches = searchInFile(fullPath, patterns);
					results.push(...matches);
				}
			}
		}

		return results;
	} catch (error) {
		console.error(`Error scanning directory ${dirPath}:`, error.message);
		return results;
	}
}

function findAllLockFiles(dirPath, lockFiles = []) {
	try {
		const entries = fs.readdirSync(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name);

			if (entry.name === "node_modules" || entry.name.startsWith(".")) {
				continue;
			}

			if (entry.isDirectory()) {
				findAllLockFiles(fullPath, lockFiles);
			} else if (entry.isFile()) {
				if (
					entry.name === "package-lock.json" ||
					entry.name === "yarn.lock" ||
					entry.name === "pnpm-lock.yaml" ||
					entry.name === "bun.lockb"
				) {
					const manager =
						entry.name === "package-lock.json"
							? "npm"
							: entry.name === "yarn.lock"
								? "yarn"
								: entry.name === "pnpm-lock.yaml"
									? "pnpm"
									: "bun";

					lockFiles.push({
						path: fullPath,
						manager: manager,
						fileName: entry.name,
					});
				}
			}
		}

		return lockFiles;
	} catch (error) {
		console.error(`Error scanning directory ${dirPath}:`, error.message);
		return lockFiles;
	}
}

function checkNpmLockFile(lockFilePath, patterns) {
	try {
		const content = fs.readFileSync(lockFilePath, "utf8");
		const lockData = JSON.parse(content);
		const matches = [];

		const checkDependencies = (deps, section) => {
			if (!deps) return;

			for (const [pkgName, pkgInfo] of Object.entries(deps)) {
				const cleanPkgName = pkgName.replace(/^node_modules\//, "");

				patterns.forEach((pattern) => {
					const regex = new RegExp(`\\b${pattern}\\b`, "i");
					if (regex.test(cleanPkgName)) {
						matches.push({
							pattern: pattern,
							package: cleanPkgName,
							version: pkgInfo.version,
							section: section,
						});
					}
				});
			}
		};

		checkDependencies(lockData.dependencies, "dependencies");
		checkDependencies(lockData.packages, "packages");

		return matches;
	} catch (error) {
		console.error(`Error reading npm lock file:`, error.message);
		return [];
	}
}

function checkYarnLockFile(lockFilePath, patterns) {
	try {
		const content = fs.readFileSync(lockFilePath, "utf8");
		const matches = [];

		const lines = content.split("\n");
		let currentPackage = null;
		let currentVersion = null;

		for (const line of lines) {
			if (line.match(/^["']?[^"'\s]+["']?.*:/) || line.match(/^[^"\s].*:$/)) {
				const pkgMatch = line.match(/^["']?([^"'@\s]+)(?:@[^"']*)?["']?.*:/);
				if (pkgMatch) {
					currentPackage = pkgMatch[1];
				}
			} else if (line.trim().startsWith("version ")) {
				const versionMatch = line.match(/version ["']?([^"'\s]+)["']?/);
				if (versionMatch) {
					currentVersion = versionMatch[1];
				}

				if (currentPackage) {
					patterns.forEach((pattern) => {
						const regex = new RegExp(`\\b${pattern}\\b`, "i");
						if (regex.test(currentPackage)) {
							matches.push({
								pattern: pattern,
								package: currentPackage,
								version: currentVersion,
								section: "yarn.lock",
							});
						}
					});
				}
			}
		}

		return matches;
	} catch (error) {
		console.error(`Error reading yarn lock file:`, error.message);
		return [];
	}
}

function checkPnpmLockFile(lockFilePath, patterns) {
	try {
		const content = fs.readFileSync(lockFilePath, "utf8");
		const matches = [];

		const lines = content.split("\n");

		for (const line of lines) {
			const pkgMatch = line.match(/^\s*['"]?([/@\w-]+)['"]?:/);
			if (pkgMatch) {
				const pkgName = pkgMatch[1].replace(/^\//, "");

				patterns.forEach((pattern) => {
					const regex = new RegExp(`\\b${pattern}\\b`, "i");
					if (regex.test(pkgName)) {
						const versionMatch = line.match(/:\s*(\d+\.\d+\.\d+[^\s]*)/);
						matches.push({
							pattern: pattern,
							package: pkgName,
							version: versionMatch ? versionMatch[1] : "unknown",
							section: "pnpm-lock.yaml",
						});
					}
				});
			}
		}

		return matches;
	} catch (error) {
		console.error(`Error reading pnpm lock file:`, error.message);
		return [];
	}
}

function performShallowCheck(dirPath, patterns) {
	console.log("🔍 Searching for lock files in all subdirectories...\n");

	const lockFiles = findAllLockFiles(dirPath);

	if (lockFiles.length === 0) {
		console.log("❌ No package manager lock file found (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb)");
		console.log("Cannot perform shallow check. Try exhaustive check instead.");
		return [];
	}

	console.log(`📦 Found ${lockFiles.length} lock file(s):\n`);
	lockFiles.forEach((lockFile) => {
		console.log(`  • ${lockFile.fileName} (${lockFile.manager}) - ${lockFile.path}`);
	});
	console.log();

	let allMatches = [];

	for (const lockFile of lockFiles) {
		console.log(`🔍 Checking ${lockFile.fileName} at ${lockFile.path}...`);

		let matches = [];

		switch (lockFile.manager) {
			case "npm":
				matches = checkNpmLockFile(lockFile.path, patterns);
				break;
			case "yarn":
				matches = checkYarnLockFile(lockFile.path, patterns);
				break;
			case "pnpm":
				matches = checkPnpmLockFile(lockFile.path, patterns);
				break;
			case "bun":
				console.log("⚠️  Bun lockfile format not yet supported.");
				break;
		}

		if (matches.length > 0) {
			console.log(`  ⚠️  Found ${matches.length} match(es) in this lock file`);
		} else {
			console.log(`  ✓ No matches in this lock file`);
		}

		allMatches.push(...matches);
	}

	console.log();
	return allMatches;
}

function displayResults(results, isShallowCheck = false) {
	if (results.length === 0) {
		console.log("✓ No matches found. Your project appears clean!");
		return;
	}

	console.log(`⚠ Found ${results.length} match(es):\n`);

	const groupedResults = {};
	results.forEach((result) => {
		if (!groupedResults[result.pattern]) {
			groupedResults[result.pattern] = [];
		}
		groupedResults[result.pattern].push(result);
	});

	Object.keys(groupedResults).forEach((packageName) => {
		console.log(`\n📦 Package: ${packageName}`);
		groupedResults[packageName].forEach((match) => {
			if (isShallowCheck) {
				console.log(`  ${match.package}@${match.version} (found in ${match.section})`);
			} else {
				console.log(`  ${match.file}:${match.line}`);
				console.log(`    ${match.content}`);
			}
		});
	});
}

async function interactiveMode() {
	const rl = createReadlineInterface();

	console.log("=== NPM Package Dependency Checker ===\n");

	try {
		compromisedPackages = await fetchCompromisedPackages();
	} catch (error) {
		console.error(`Error: ${error.message}`);
		console.error("Using empty package list. You may specify packages manually.");
		rl.close();
		process.exit(1);
	}

	const targetDir = await askQuestion(rl, "Enter the path to the project directory: ");

	if (!fs.existsSync(targetDir)) {
		console.error(`Error: Directory "${targetDir}" does not exist.`);
		rl.close();
		process.exit(1);
	}

	const stats = fs.statSync(targetDir);
	if (!stats.isDirectory()) {
		console.error(`Error: "${targetDir}" is not a directory.`);
		rl.close();
		process.exit(1);
	}

	console.log("\nCheck types:");
	console.log("1. Shallow check - Only check lock files (faster, checks installed dependencies)");
	console.log("2. Exhaustive check - Scan all files in project (slower, finds all references)\n");

	const checkType = await askQuestion(rl, "Select check type (1 or 2): ");

	rl.close();

	const searchPatterns = compromisedPackages;

	if (searchPatterns.length === 0) {
		console.error("\nError: No package names loaded.");
		process.exit(1);
	}

	console.log(`\nScanning directory: ${path.resolve(targetDir)}`);
	console.log(`Checking for ${searchPatterns.length} known compromised packages\n`);

	let results = [];

	if (checkType === "1") {
		results = performShallowCheck(targetDir, searchPatterns);
		displayResults(results, true);
	} else if (checkType === "2") {
		console.log("🔍 Performing exhaustive scan...\n");
		results = scanDirectory(targetDir, searchPatterns);
		displayResults(results, false);
	} else {
		console.error("Invalid choice. Please select 1 or 2.");
		process.exit(1);
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		await interactiveMode();
		return;
	}

	const targetDir = args[0];

	let searchPatterns;
	if (args.length > 1) {
		searchPatterns = args.slice(1);
	} else {
		try {
			searchPatterns = await fetchCompromisedPackages();
		} catch (error) {
			console.error(`Error: ${error.message}`);
			console.error("Please specify package names as arguments.");
			process.exit(1);
		}
	}

	if (searchPatterns.length === 0) {
		console.error("Error: No package names specified.");
		process.exit(1);
	}

	if (!fs.existsSync(targetDir)) {
		console.error(`Error: Directory "${targetDir}" does not exist.`);
		process.exit(1);
	}

	const stats = fs.statSync(targetDir);
	if (!stats.isDirectory()) {
		console.error(`Error: "${targetDir}" is not a directory.`);
		process.exit(1);
	}

	console.log(`\nScanning directory: ${path.resolve(targetDir)}`);
	console.log(`Checking for ${searchPatterns.length} packages\n`);

	const results = scanDirectory(targetDir, searchPatterns);
	displayResults(results, false);
}

main();
