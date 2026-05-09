const redis = require('redis');
require('dotenv').config({ path: __dirname + '/.env' });

let redisClient;

const connectRedis = async () => {
  redisClient = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
    }
  });

  redisClient.on('error', (err) => console.log('Redis Client Error', err));

  await redisClient.connect();
};

const setCache = async (key, value, ttl = 3600) => {
  if (!redisClient) await connectRedis();
  await redisClient.setEx(key, ttl, JSON.stringify(value));
};

const getCache = async (key) => {
  if (!redisClient) await connectRedis();
  const cached = await redisClient.get(key);
  return cached ? JSON.parse(cached) : null;
};

const deleteCache = async (key) => {
  if (!redisClient) await connectRedis();
  await redisClient.del(key);
};

module.exports = {
  connectRedis,
  setCache,
  getCache,
  deleteCache
};