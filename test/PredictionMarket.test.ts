import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// ─── Mock Oracle ──────────────────────────────────────────────────────────────
async function deployMockOracle(price: bigint) {
    const MockOracle = await ethers.getContractFactory("MockOracle");
    const mock = await MockOracle.deploy(price);
    await mock.waitForDeployment();
    return mock;
}

describe("PredictionMarket", () => {
    const STRIKE_PRICE = 60_000n * 10n ** 8n; // $60k, 8 decimals
    const ONE_ETH = ethers.parseEther("1");
    const HALF_ETH = ethers.parseEther("0.5");

    async function deploy(oraclePrice: bigint, durationSecs = 3600) {
        const [owner, alice, bob, feeWallet] = await ethers.getSigners();
        const oracle = await deployMockOracle(oraclePrice);
        const endTime = (await time.latest()) + durationSecs;

        const PM = await ethers.getContractFactory("PredictionMarket");
        const market = await PM.deploy(
            await oracle.getAddress(),
            feeWallet.address,
            "BTC below 60k?",
            STRIKE_PRICE,
            endTime
        );
        await market.waitForDeployment();
        return { market, oracle, owner, alice, bob, feeWallet, endTime };
    }

    it("allows betting before endTime", async () => {
        const { market, alice, bob } = await deploy(55_000n * 10n ** 8n);
        await market.connect(alice).buyYes({ value: ONE_ETH });
        await market.connect(bob).buyNo({ value: HALF_ETH });
        expect(await market.yesPool()).to.equal(ONE_ETH);
        expect(await market.noPool()).to.equal(HALF_ETH);
    });

    it("blocks betting after endTime", async () => {
        const { market, alice, endTime } = await deploy(55_000n * 10n ** 8n);
        await time.increaseTo(endTime + 1);
        await expect(
            market.connect(alice).buyYes({ value: ONE_ETH })
        ).to.be.revertedWith("PM: market ended");
    });

    it("blocks resolve before endTime", async () => {
        const { market } = await deploy(55_000n * 10n ** 8n);
        await expect(market.resolve()).to.be.revertedWith("PredictionMarket: market not ended");
    });

    it("resolves YES when price < strikePrice", async () => {
        const { market, alice, endTime } = await deploy(55_000n * 10n ** 8n);
        await market.connect(alice).buyYes({ value: ONE_ETH });
        await time.increaseTo(endTime + 1);
        await market.resolve();
        expect(await market.resolved()).to.equal(true);
        expect(await market.result()).to.equal(true); // YES wins
    });

    it("resolves NO when price >= strikePrice", async () => {
        const { market, alice, endTime } = await deploy(65_000n * 10n ** 8n);
        await market.connect(alice).buyNo({ value: ONE_ETH });
        await time.increaseTo(endTime + 1);
        await market.resolve();
        expect(await market.result()).to.equal(false); // NO wins
    });

    it("cannot resolve twice", async () => {
        const { market, endTime } = await deploy(55_000n * 10n ** 8n);
        await time.increaseTo(endTime + 1);
        await market.resolve();
        await expect(market.resolve()).to.be.revertedWith("PredictionMarket: already resolved");
    });

    it("pays winner with 1% fee on winnings only", async () => {
        const { market, alice, bob, endTime } = await deploy(55_000n * 10n ** 8n);

        // Alice bets YES 1 ETH, Bob bets NO 1 ETH
        await market.connect(alice).buyYes({ value: ONE_ETH });
        await market.connect(bob).buyNo({ value: ONE_ETH });

        await time.increaseTo(endTime + 1);
        await market.resolve(); // YES wins (price < strike)

        const balBefore = await ethers.provider.getBalance(alice.address);
        const tx = await market.connect(alice).claim();
        const receipt = await tx.wait();
        const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
        const balAfter = await ethers.provider.getBalance(alice.address);

        // Alice staked 1 ETH, total pool = 2 ETH
        // Gross reward = 2 ETH, winnings = 1 ETH, fee = 1% of 1 ETH = 0.01 ETH
        // Net reward = 1.99 ETH
        const net = balAfter - balBefore + gasUsed;
        expect(net).to.equal(ethers.parseEther("1.99"));
    });

    it("accumulates fees and allows owner withdrawal", async () => {
        const { market, oracle, alice, bob, owner, feeWallet, endTime } =
            await deploy(55_000n * 10n ** 8n);

        await market.connect(alice).buyYes({ value: ONE_ETH });
        await market.connect(bob).buyNo({ value: ONE_ETH });

        await time.increaseTo(endTime + 1);
        await market.resolve();
        await market.connect(alice).claim();

        const accFees = await market.accumulatedFees();
        expect(accFees).to.equal(ethers.parseEther("0.01"));

        const before = await ethers.provider.getBalance(feeWallet.address);
        // PredictionMarket owner = MarketFactory caller = deployer = owner
        await market.connect(owner).withdrawFees();
        const after = await ethers.provider.getBalance(feeWallet.address);
        expect(after - before).to.equal(ethers.parseEther("0.01"));
    });
});

describe("MarketFactory", () => {
    async function deployFactory() {
        const [owner, alice] = await ethers.getSigners();
        const oracle = await deployMockOracle(60_000n * 10n ** 8n);
        const Factory = await ethers.getContractFactory("MarketFactory");
        const factory = await Factory.deploy(await oracle.getAddress(), owner.address);
        await factory.waitForDeployment();
        return { factory, oracle, owner, alice };
    }

    it("creates markets and tracks them", async () => {
        const { factory } = await deployFactory();
        const endTime = (await time.latest()) + 3600;
        await factory.createMarket("Q1?", 60_000n * 10n ** 8n, endTime);
        await factory.createMarket("Q2?", 65_000n * 10n ** 8n, endTime + 1);
        expect(await factory.getMarketCount()).to.equal(2);
    });

    it("non-owner cannot create market", async () => {
        const { factory, alice } = await deployFactory();
        const endTime = (await time.latest()) + 3600;
        await expect(
            factory.connect(alice).createMarket("Q?", 60_000n * 10n ** 8n, endTime)
        ).to.be.revertedWith("Factory: not owner");
    });

    it("allows oracle upgrade", async () => {
        const { factory, owner } = await deployFactory();
        const newOracle = await deployMockOracle(65_000n * 10n ** 8n);
        await factory.connect(owner).setOracle(await newOracle.getAddress());
        expect(await factory.oracle()).to.equal(await newOracle.getAddress());
    });
});
