const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com', 11155111, { staticNetwork: true });
const { getCreateAddress } = require('ethers');
const fs = require('fs');

async function main() {
    const deployer = '0xE9973af1b69E407745926fA985C0090E0e78DcF1';
    const nonce = await provider.getTransactionCount(deployer);

    const marketFactoryAddr = getCreateAddress({ from: deployer, nonce: nonce - 1 });
    const skyUsdtAddr = getCreateAddress({ from: deployer, nonce: nonce - 2 });

    const output = `NEXT_PUBLIC_TOKEN_ADDRESS=${skyUsdtAddr}\nNEXT_PUBLIC_FACTORY_ADDRESS=${marketFactoryAddr}\n`;
    console.log(output);
    fs.writeFileSync('derived_addresses.txt', output);
}
main();
