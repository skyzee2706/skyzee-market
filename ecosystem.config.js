module.exports = {
    apps: [{
        name: "sky-market-scheduler",
        script: "node",
        args: "-r ts-node/register scripts/auto-market.ts",
        env: {
            NODE_ENV: "production",
        }
    }]
};
