const { createClient } = require('redis');

let redisClient = null;

if (process.env.REDIS_URL) {
  redisClient = createClient({
    url: process.env.REDIS_URL
  });

  redisClient.on('error', (err) => console.error('[Redis] Client Error', err));
  
  redisClient.connect().then(() => {
    console.log('[Redis] Connected successfully');
  }).catch(err => {
    console.error('[Redis] Connection failed', err);
  });
} else {
  console.log('[Redis] No REDIS_URL provided. Services relying on Redis will skip or use memory fallbacks.');
}

module.exports = redisClient;
