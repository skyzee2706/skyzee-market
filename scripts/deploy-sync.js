const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("Starting custom deployment...");
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);

    const SkyUSDT = await ethers.getContractFactory("SkyUSDT");
    const skyUsdt = await SkyUSDT.deploy(deployer.address);
    const usdtAddr = await skyUsdt.getAddress();
    console.log(`USDT: ${usdtAddr}`);

    const Oracle = await ethers.getContractFactory("ChainlinkOracle");
    const btcOracle = await Oracle.deploy("0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43");
    const btcOracleAddr = await btcOracle.getAddress();
    console.log(`BTC Oracle: ${btcOracleAddr}`);

    const ethOracle = await Oracle.deploy("0x694AA1769357215DE4FAC081bf1f309aDC325306");
    const ethOracleAddr = await ethOracle.getAddress();
    console.log(`ETH Oracle: ${ethOracleAddr}`);

    const Factory = await ethers.getContractFactory("MarketFactory");
    const factory = await Factory.deploy(btcOracleAddr, ethOracleAddr, usdtAddr, deployer.address);
    const factoryAddr = await factory.getAddress();
    console.log(`Factory: ${factoryAddr}`);

    fs.writeFileSync("deployed_addresses.txt", `FACTORY=${factoryAddr}\nUSDT=${usdtAddr}\nBTC_ORACLE=${btcOracleAddr}\nETH_ORACLE=${ethOracleAddr}`);
}

main().catch(console.error).then(() => process.exit(0));
