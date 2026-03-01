import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Deploying with: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

    // ── 1. SkyUSDT ────────────────────────────────────────────────────────
    console.log("1/4 Deploying SkyUSDT...");
    const SkyUSDT = await ethers.getContractFactory("SkyUSDT");
    const skyUsdt = await SkyUSDT.deploy(deployer.address);
    await skyUsdt.waitForDeployment();
    const usdtAddr = await skyUsdt.getAddress();
    console.log(`   SkyUSDT: ${usdtAddr}`);

    // ── 2. Oracles ────────────────────────────────────────────────────────
    // Chainlink BTC/USD on Sepolia
    const BTC_USD_SEPOLIA = "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43";
    // Chainlink ETH/USD on Sepolia
    const ETH_USD_SEPOLIA = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

    console.log("2/4 Deploying Oracles...");
    const Oracle = await ethers.getContractFactory("ChainlinkOracle");

    const btcOracle = await Oracle.deploy(BTC_USD_SEPOLIA);
    await btcOracle.waitForDeployment();
    const btcOracleAddr = await btcOracle.getAddress();
    console.log(`   BTC/USD Oracle: ${btcOracleAddr}`);

    const ethOracle = await Oracle.deploy(ETH_USD_SEPOLIA);
    await ethOracle.waitForDeployment();
    const ethOracleAddr = await ethOracle.getAddress();
    console.log(`   ETH/USD Oracle: ${ethOracleAddr}`);

    // ── 3. MarketFactory ──────────────────────────────────────────────────
    console.log("3/4 Deploying MarketFactory...");
    const Factory = await ethers.getContractFactory("MarketFactory");
    const factory = await Factory.deploy(btcOracleAddr, ethOracleAddr, usdtAddr, deployer.address);
    await factory.waitForDeployment();
    const factoryAddr = await factory.getAddress();
    console.log(`   MarketFactory: ${factoryAddr}`);

    // ── Summary ───────────────────────────────────────────────────────────
    console.log("\n✅ Deployment complete!");
    console.log("─────────────────────────────────────────────");
    console.log(`NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddr}`);
    console.log(`NEXT_PUBLIC_TOKEN_ADDRESS=${usdtAddr}`);
    console.log(`ORACLE_ADDRESS=${btcOracleAddr}`);
    console.log(`ETH_ORACLE_ADDRESS=${ethOracleAddr}`);
    console.log("─────────────────────────────────────────────");
    console.log("Update these in .env and frontend/.env.local");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
