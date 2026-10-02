import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';

export const queueConnection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
export const logQueue = new Queue('discord-log-dispatch', { connection: queueConnection });
