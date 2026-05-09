const redis = require('redis');
require('dotenv').config({ path: __dirname + '/.env' });

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
      }
    });

    redisClient.on('error', (err) => console.log('Redis Client Error:', err.message));
    redisClient.on('connect', () => console.log('Redis connected'));

    await redisClient.connect();
    console.log('Redis connected successfully');
    return redisClient;
  } catch (err) {
    console.log('Redis connection failed - caching disabled:', err.message);
    return null;
  }
};

const setCache = async (key, value, ttl = 3600) => {
  if (!redisClient) {
    await connectRedis();
  }
  if (redisClient) {
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
    } catch (err) {
      console.error('Cache set error:', err.message);
    }
  }
};

const getCache = async (key) => {
  if (!redisClient) {
    await connectRedis();
  }
  if (redisClient) {
    try {
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      console.error('Cache get error:', err.message);
      return null;
    }
  }
  return null;
};

const deleteCache = async (key) => {
  if (!redisClient) {
    await connectRedis();
  }
  if (redisClient) {
    try {
      await redisClient.del(key);
    } catch (err) {
      console.error('Cache delete error:', err.message);
    }
  }
};

const deleteCachePattern = async (pattern) => {
  if (!redisClient) await connectRedis();
  const keys = await redisClient.keys(pattern);
  if (keys.length) {
    await redisClient.del(keys);
  }
};

module.exports = {
  connectRedis,
  setCache,
  getCache,
  deleteCache,
  deleteCachePattern
};