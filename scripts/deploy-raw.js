const { ethers } = require("ethers");
const fs = require("fs");
require("dotenv").config();

async function main() {
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com", 11155111, {
        staticNetwork: true
    });
    let pk = process.env.PRIVATE_KEY;
    if (!pk.startsWith("0x")) pk = "0x" + pk;
    const wallet = new ethers.Wallet(pk, provider);

    console.log("Deploying MarketFactory natively with ethers@6...");
    console.log(`Wallet: ${wallet.address}`);

    const factoryRaw = JSON.parse(fs.readFileSync("./artifacts/contracts/MarketFactory.sol/MarketFactory.json", "utf8"));
    const factoryFactory = new ethers.ContractFactory(factoryRaw.abi, factoryRaw.bytecode, wallet);

    console.log("Deploying new SkyUSDT dependency...");
    const usdtRaw = JSON.parse(fs.readFileSync("./artifacts/contracts/SkyUSDT.sol/SkyUSDT.json", "utf8"));
    const usdtFactory = new ethers.ContractFactory(usdtRaw.abi, usdtRaw.bytecode, wallet);
    const usdtDeployTx = await usdtFactory.getDeployTransaction(wallet.address);
    const uTx = await wallet.sendTransaction(usdtDeployTx);
    const uReceipt = await uTx.wait();
    const usdtAddr = uReceipt.contractAddress;
    console.log(`✅ New USDT deployed: ${usdtAddr}`);

    const btcOracleAddr = "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43";
    const ethOracleAddr = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

    console.log("BTC Oracle: ", btcOracleAddr);
    console.log("ETH Oracle: ", ethOracleAddr);
    console.log("USDT Addr: ", usdtAddr);
    console.log("Wallet Addr: ", wallet.address);

    try {
        console.log("Encoding constructor payload...");
        const initCode = await factoryFactory.getDeployTransaction(
            btcOracleAddr,
            ethOracleAddr,
            usdtAddr,
            wallet.address
        );

        console.log("Sending manual deploy tx...");
        const tx = await wallet.sendTransaction(initCode);
        console.log(`TX Hash: ${tx.hash}`);

        console.log("Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log(`✅ Factory deployed perfectly to: ${receipt.contractAddress}`);
    } catch (err) {
        console.error("DEPLOYMENT CRASHED:");
        console.error(err);
    }
}

main().catch(console.error);
