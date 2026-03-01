const { Web3 } = require('web3');
const fs = require('fs');
require('dotenv').config();

async function main() {
    const web3 = new Web3('https://ethereum-sepolia-rpc.publicnode.com');

    let pk = process.env.PRIVATE_KEY;
    if (!pk.startsWith('0x')) pk = '0x' + pk;
    const account = web3.eth.accounts.wallet.add(pk)[0];

    console.log("Deploying MarketFactory natively with web3.js...");
    console.log(`Wallet: ${account.address}`);

    const factoryRaw = JSON.parse(fs.readFileSync("./artifacts/contracts/MarketFactory.sol/MarketFactory.json", "utf8"));
    const FactoryContract = new web3.eth.Contract(factoryRaw.abi);

    const btcOracleAddr = "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43";
    const ethOracleAddr = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
    // Deployed manually earlier
    const usdtAddr = "0xB90Ee0A3b0D3C9Daeec91129b05D0Bc33a9ED811";

    console.log("Encoding and sending Web3 constructor payload...");
    const deployTx = FactoryContract.deploy({
        data: factoryRaw.bytecode,
        arguments: [btcOracleAddr, ethOracleAddr, usdtAddr, account.address]
    });

    const gas = await deployTx.estimateGas({ from: account.address });
    console.log(`Estimated gas: ${gas}`);

    const tx = await deployTx.send({
        from: account.address,
        gas: Math.floor(Number(gas) * 1.5).toString(),
        maxPriorityFeePerGas: web3.utils.toWei('2', 'gwei'),
        maxFeePerGas: web3.utils.toWei('30', 'gwei')
    });

    console.log(`✅ Factory deployed perfectly to: ${tx.options.address}`);
}

main().catch(err => {
    console.error("DEPLOYMENT CRASHED:");
    console.error(err);
});
