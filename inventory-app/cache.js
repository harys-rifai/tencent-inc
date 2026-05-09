const redis = require('redis');
require('dotenv').config({ path: __dirname + '/.env' });

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379
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

// Session management (20 minute expiry)
const SESSION_PREFIX = 'session:';

const createSession = async (userId, ttlMinutes = 20) => {
  if (!redisClient) await connectRedis();
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const sessionData = {
    userId,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };
  await redisClient.setEx(
    `${SESSION_PREFIX}${sessionId}`,
    ttlMinutes * 60,
    JSON.stringify(sessionData)
  );
  return sessionId;
};

const getSession = async (sessionId) => {
  if (!redisClient) await connectRedis();
  const data = await redisClient.get(`${SESSION_PREFIX}${sessionId}`);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    // Get TTL to check expiry
    const ttl = await redisClient.ttl(`${SESSION_PREFIX}${sessionId}`);
    return { ...parsed, ttl };
  } catch (e) {
    return null;
  }
};

const updateSessionActivity = async (sessionId) => {
  if (!redisClient) await connectRedis();
  const key = `${SESSION_PREFIX}${sessionId}`;
  const data = await redisClient.get(key);
  if (data) {
    try {
      const sessionData = JSON.parse(data);
      sessionData.lastActivity = new Date().toISOString();
      // Rebuild with same expiry
      const ttl = await redisClient.ttl(key);
      await redisClient.setEx(key, ttl > 0 ? ttl : 1200, JSON.stringify(sessionData));
    } catch (e) { /* ignore */ }
  }
};

const deleteSession = async (sessionId) => {
  if (!redisClient) await connectRedis();
  await redisClient.del(`${SESSION_PREFIX}${sessionId}`);
};

module.exports = {
  connectRedis,
  setCache,
  getCache,
  deleteCache,
  deleteCachePattern,
  createSession,
  getSession,
  updateSessionActivity,
  deleteSession
};