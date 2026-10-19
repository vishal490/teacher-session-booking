import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { app } from '../src/app';
import { Session, Teacher, User } from '../src/models';
import { connectDatabase, ensureIndexes } from '../src/config/database';

let mongo: MongoMemoryServer;
before(async () => { mongo = await MongoMemoryServer.create(); await connectDatabase(mongo.getUri()); await ensureIndexes(); });
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
beforeEach(async () => { await Promise.all([User.deleteMany({}), Teacher.deleteMany({}), Session.deleteMany({})]); });
async function fixture() {
  const teacher = await Teacher.create({ fullName: 'Teacher', email: 'teacher@example.com', specialization: 'Math', experience: 4 });
  const user = await User.create({ fullName: 'User', email: 'user@example.com', phone: '123' });
  const session = await Session.create({ teacherId: teacher._id, startTime: new Date('2099-01-01T12:00:00Z'), endTime: new Date('2099-01-01T13:00:00Z') });
  return { teacher, user, session };
}
test('normalizes user email and rejects duplicates and invalid bodies', async () => {
  const body = { fullName: 'Test', email: ' TEST@example.com ', phone: '123' };
  const created = await request(app).post('/users').send(body).expect(201);
  assert.equal(created.body.data.email, 'test@example.com');
  await request(app).post('/users').send(body).expect(409);
  await request(app).post('/users').send({ ...body, extra: true }).expect(400);
  await request(app).post('/users').set('Content-Type', 'application/json').send('{').expect(400);
});
test('session creation validates references, IDs and time ordering', async () => {
  const { teacher } = await fixture();
  const body = { teacherId: String(teacher._id), startTime: '2099-01-02T12:00:00Z', endTime: '2099-01-02T13:00:00Z' };
  const response = await request(app).post('/sessions').send(body).expect(201);
  assert.equal(response.body.data.status, 'AVAILABLE'); assert.equal(response.body.data.userId, null);
  await request(app).post('/sessions').send({ ...body, endTime: body.startTime }).expect(400);
  await request(app).post('/sessions').send({ ...body, teacherId: 'bad' }).expect(400);
  await request(app).post('/sessions').send({ ...body, teacherId: new mongoose.Types.ObjectId().toString() }).expect(404);
});
test('concurrent booking permits exactly one success and completion is conditional', async () => {
  const { user, session } = await fixture();
  const results = await Promise.all(Array.from({ length: 10 }, async () => request(app).post(`/sessions/${session._id}/book`).send({ userId: String(user._id) })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 9);
  const completed = await request(app).patch(`/sessions/${session._id}/complete`).send({}).expect(200);
  assert.equal(completed.body.data.status, 'COMPLETED'); assert.ok(completed.body.data.completedAt);
  await request(app).patch(`/sessions/${session._id}/complete`).send({}).expect(409);
  await request(app).post(`/sessions/${session._id}/book`).send({ userId: String(user._id) }).expect(409);
});
test('missing resources and invalid transitions return appropriate errors', async () => {
  const { user, session } = await fixture(); const missing = new mongoose.Types.ObjectId().toString();
  await request(app).patch(`/sessions/${session._id}/complete`).send({}).expect(409);
  await request(app).patch(`/sessions/${missing}/complete`).send({}).expect(404);
  await request(app).post(`/sessions/${session._id}/book`).send({ userId: missing }).expect(404);
  await request(app).post(`/sessions/${missing}/book`).send({ userId: String(user._id) }).expect(404);
  await request(app).get(`/users/${missing}/sessions`).expect(404);
  await request(app).get('/users/bad/sessions').expect(400);
});
test('available aggregation respects UTC boundaries, status and pagination', async () => {
  const { teacher, session } = await fixture();
  for (const startTime of ['2098-12-31T23:59:59.999Z', '2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z']) {
    await Session.create({ teacherId: teacher._id, startTime: new Date(startTime), endTime: new Date(new Date(startTime).getTime() + 3600000) });
  }
  const path = `/sessions/available?dateTimestamp=${Date.parse('2099-01-01T18:00:00Z')}`;
  const response = await request(app).get(path).expect(200); assert.equal(response.body.data.length, 2);
  assert.equal(response.body.data[0].startTime, '2099-01-01T00:00:00.000Z');
  await Session.updateOne({ _id: session._id }, { $set: { status: 'BOOKED' } });
  const filtered = await request(app).get(path).expect(200); assert.equal(filtered.body.data.length, 1);
  const paged = await request(app).get(`${path}&page=2&limit=1`).expect(200); assert.equal(paged.body.data.length, 0);
  await request(app).get('/sessions/available?dateTimestamp=1700000000').expect(400);
});
test('history separates future bookings and completions and isolates users', async () => {
  const { teacher, user, session } = await fixture();
  await Session.updateOne({ _id: session._id }, { $set: { status: 'BOOKED', userId: user._id } });
  await Session.create({ teacherId: teacher._id, userId: user._id, startTime: new Date('2020-01-01'), endTime: new Date('2020-01-02'), status: 'BOOKED' });
  await Session.create({ teacherId: teacher._id, userId: user._id, startTime: new Date('2020-02-01'), endTime: new Date('2020-02-02'), status: 'COMPLETED', completedAt: new Date() });
  const response = await request(app).get(`/users/${user._id}/sessions`).expect(200);
  assert.equal(response.body.data.upcomingSessions.length, 1); assert.equal(response.body.data.completedSessions.length, 1);
  const other = await User.create({ fullName: 'Other', email: 'other@example.com', phone: '1' });
  const isolated = await request(app).get(`/users/${other._id}/sessions`).expect(200);
  assert.deepEqual(isolated.body.data.upcomingSessions, []); assert.deepEqual(isolated.body.data.completedSessions, []);
});

test('history paginates upcoming and completed sessions independently', async () => {
  const { teacher, user } = await fixture();
  const upcoming = [], completed = [];
  for (let day = 1; day <= 3; day++) {
    const dates = { startTime: new Date(`2099-01-0${day}T12:00:00Z`), endTime: new Date(`2099-01-0${day}T13:00:00Z`) };
    upcoming.push(await Session.create({ ...dates, teacherId: teacher._id, userId: user._id, status: 'BOOKED' }));
    completed.push(await Session.create({ ...dates, teacherId: teacher._id, userId: user._id, status: 'COMPLETED', completedAt: new Date(`2099-01-0${day}T14:00:00Z`) }));
  }
  const query = { upcomingPage: 2, completedPage: 3, limit: 1 };
  const { body: { data } } = await request(app).get(`/users/${user._id}/sessions`).query(query).expect(200);
  assert.deepEqual(data.pagination, query);
  assert.deepEqual(data.upcomingSessions.map((s: { _id: string }) => s._id), [String(upcoming[1]._id)]);
  assert.deepEqual(data.completedSessions.map((s: { _id: string }) => s._id), [String(completed[0]._id)]);
});
