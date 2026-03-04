module.exports = {
    apps: [{
        name: "sky-market-scheduler",
        script: "node",
        args: "-r ts-node/register scripts/auto-market.ts",
        cwd: "D:\\ZIAN\\Garapan\\BOT WHITELIST",
        env_file: ".env",
        autorestart: true,
        watch: false,
        max_restarts: 50,
        restart_delay: 5000,
        env: {
            NODE_ENV: "production"
        }
    }]
};
