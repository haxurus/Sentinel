import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config.js';

export const queueConnection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
export const logQueue = new Queue('discord-log-dispatch', { connection: queueConnection });
