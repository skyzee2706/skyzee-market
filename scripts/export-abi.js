const fs = require("fs");
const path = require("path");

// Contracts to export
const CONTRACTS = ["PredictionMarket", "MarketFactory", "ChainlinkOracle", "IPriceOracle", "SkyUSDT"];

const artifactsDir = path.join(__dirname, "../artifacts/contracts");
const outDir = path.join(__dirname, "../frontend/abis");

fs.mkdirSync(outDir, { recursive: true });

let indexExports = "";

for (const name of CONTRACTS) {
    // Search recursively for the artifact
    const artifactPath = findArtifact(artifactsDir, `${name}.json`);
    if (!artifactPath) {
        console.warn(`⚠️  Artifact not found for ${name}. Run 'npm run compile' first.`);
        continue;
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    const abi = artifact.abi;

    const outFile = path.join(outDir, `${name}.json`);
    fs.writeFileSync(outFile, JSON.stringify(abi, null, 2));
    console.log(`✅ Exported ${name}.json`);

    indexExports += `export { default as ${name}ABI } from "./${name}.json";\n`;
}

// Write barrel file
fs.writeFileSync(path.join(outDir, "index.ts"), indexExports);
console.log("✅ Wrote abis/index.ts");

function findArtifact(dir, filename) {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findArtifact(full, filename);
            if (found) return found;
        } else if (entry.name === filename) {
            return full;
        }
    }
    return null;
}
