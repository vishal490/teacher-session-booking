import { Session, Teacher } from '../../models';
import { AppError } from '../../shared/http';
import { requireUser } from '../users/user.service';
import * as repository from './session.repository';

export async function createSession(input: { teacherId: string; startTime: string; endTime: string }) {
  if (!await Teacher.exists({ _id: input.teacherId })) throw new AppError(404, 'TEACHER_NOT_FOUND', 'Teacher not found.');
  return Session.create({ teacherId: input.teacherId, startTime: new Date(input.startTime), endTime: new Date(input.endTime) });
}
async function transitionFailure(id: string, code: string, message: string): Promise<never> {
  if (!await Session.exists({ _id: id })) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
  throw new AppError(409, code, message);
}
export async function bookSession(id: string, userId: string) {
  await requireUser(userId);
  const session = await repository.bookAvailable(id, userId);
  return session ?? transitionFailure(id, 'SESSION_NOT_AVAILABLE', 'Only available sessions can be booked.');
}
export async function completeSession(id: string) {
  const session = await repository.completeBooked(id);
  return session ?? transitionFailure(id, 'SESSION_NOT_BOOKED', 'Only booked sessions can be completed.');
}
export const availableOnDate = repository.availableOnDate;
