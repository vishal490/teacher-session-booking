import { Session } from '../../models';

export async function bookAvailable(id: string, userId: string) {
  return Session.findOneAndUpdate({ _id: id, status: 'AVAILABLE' }, { $set: { status: 'BOOKED', userId } }, { new: true, runValidators: true });
}
export async function completeBooked(id: string) {
  return Session.findOneAndUpdate({ _id: id, status: 'BOOKED' }, { $set: { status: 'COMPLETED', completedAt: new Date() } }, { new: true, runValidators: true });
}
export async function availableOnDate(timestamp: number, page: number, limit: number) {
  const start = new Date(timestamp); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  return Session.aggregate([
    { $match: { status: 'AVAILABLE', startTime: { $gte: start, $lt: end } } },
    { $sort: { startTime: 1, _id: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
    { $lookup: { from: 'teachers', localField: 'teacherId', foreignField: '_id', pipeline: [{ $project: { fullName: 1, specialization: 1, experience: 1 } }], as: 'teacher' } },
    { $set: { teacher: { $arrayElemAt: ['$teacher', 0] } } },
  ]);
}
