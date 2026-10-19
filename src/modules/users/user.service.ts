import { Types } from 'mongoose';
import { User, Session } from '../../models';
import { AppError } from '../../shared/http';

export async function createUser(input: { fullName: string; email: string; phone: string }) { return User.create(input); }
export async function requireUser(id: string): Promise<void> {
  if (!await User.exists({ _id: id })) throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
}
export async function userSessions(id: string, query: { upcomingPage: number; completedPage: number; limit: number }) {
  await requireUser(id);
  const now = new Date();
  const [result] = await Session.aggregate([
    { $match: { userId: new Types.ObjectId(id), status: { $in: ['BOOKED', 'COMPLETED'] } } },
    { $facet: {
      upcomingSessions: [{ $match: { status: 'BOOKED', startTime: { $gte: now } } }, { $sort: { startTime: 1, _id: 1 } }, { $skip: (query.upcomingPage - 1) * query.limit }, { $limit: query.limit }],
      completedSessions: [{ $match: { status: 'COMPLETED' } }, { $sort: { completedAt: -1, _id: -1 } }, { $skip: (query.completedPage - 1) * query.limit }, { $limit: query.limit }],
    } },
  ]);
  return { ...result, pagination: query };
}
