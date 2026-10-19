import { Router } from 'express';
import { asyncRoute } from '../../shared/http';
import { createUserBody, historyQuery, idParams } from '../../shared/validation';
import * as service from './user.service';
export const userRouter = Router();
userRouter.post('/', asyncRoute(async (req, res) => { res.status(201).json({ data: await service.createUser(createUserBody.parse(req.body)) }); }));
userRouter.get('/:id/sessions', asyncRoute(async (req, res) => { const { id } = idParams.parse(req.params); res.json({ data: await service.userSessions(id, historyQuery.parse(req.query)) }); }));
