import Redis from 'ioredis';

const redisPublisher = new Redis({
  host: 'localhost',
  port: 6379,
});

const redisSubscriber = new Redis({
  host: 'localhost',
  port: 6379,
});

export { redisPublisher, redisSubscriber };