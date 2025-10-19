module.exports = {
    apps: [
        {
            name: 'memelend-api',
            script: 'dist/index.js',
            max_memory_restart: '1G'
        },
        {
            name: 'bot-liquidation',
            script: 'dist/bots/liquidationBot.js',
            max_memory_restart: '500M'
        },
        {
            name: 'start-events',
            script: 'dist/services/rawEventWorker.js',
            max_memory_restart: '400M'
        },
        {
            name: 'start-worker',
            script: 'dist/services/presaleStatusWorker.js',
            max_memory_restart: '400M'
        },
        {
            name: 'bot-presale',
            script: 'dist/bots/presaleActivationBot.js',
            max_memory_restart: '400M'
        }
    ]
};
