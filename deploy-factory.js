const { ethers } = require('ethers');
const fs = require('fs');
require('dotenv').config();

async function main() {
    const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com', 11155111, { staticNetwork: true });
    const pk = process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : '0x' + process.env.PRIVATE_KEY;
    const wallet = new ethers.Wallet(pk, provider);

    console.log("Wallet Addr: ", wallet.address);

    const factoryRaw = JSON.parse(fs.readFileSync("./artifacts/contracts/MarketFactory.sol/MarketFactory.json", "utf8"));
    const factoryFactory = new ethers.ContractFactory(factoryRaw.abi, factoryRaw.bytecode, wallet);

    const usdtAddr = "0xbDE0a3dD0e35FfA12FE737a1B07eDd33e3df88e4";
    const btcOracleAddr = "0x2d271B6e72FC7793326c47707cAF4e8F77807f9d";
    const ethOracleAddr = "0xfB8F5938B30628C1d84139E72f34e345268B6224";

    console.log("Encoding constructor payload...");
    const initCode = await factoryFactory.getDeployTransaction(
        btcOracleAddr.toLowerCase(),
        ethOracleAddr.toLowerCase(),
        usdtAddr.toLowerCase(),
        wallet.address
    );

    console.log("Sending manual deploy tx...");
    const tx = await wallet.sendTransaction(initCode);
    console.log(`TX Hash: ${tx.hash}`);

    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log(`✅ Factory deployed perfectly to: ${receipt.contractAddress}`);
}

main().catch(console.error);
