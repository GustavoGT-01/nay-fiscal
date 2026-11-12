import type { FastifyRequest } from 'fastify';
import * as notifications from '../models/notification.js';

export const listNotifications = async (req: FastifyRequest) => notifications.listFor(req.me.officeId, req.me.id);
