import pino from 'pino';
import { createLogBuffer } from '@sentinel/shared';
import { config } from './config.js';
import { redactText } from './security.js';

/** Latest log lines, readable from the super console through the internal API. */
export const logBuffer = createLogBuffer(2_000, redactText);

const level = config.logLevel as pino.Level;
export const logger = pino({ level }, pino.multistream([
  { level, stream: process.stdout },
  { level, stream: logBuffer }
]));
