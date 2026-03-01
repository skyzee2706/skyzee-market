const { ethers } = require('ethers');
const fs = require('fs');
require('dotenv').config();

const pk = process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : '0x' + process.env.PRIVATE_KEY;
const wallet = new ethers.Wallet(pk);

console.log("Saving true wallet address...");
fs.writeFileSync('addr.txt', wallet.address);
