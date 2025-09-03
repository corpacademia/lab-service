// const { Server } = require("socket.io");
// const redisAdapter = require("socket.io-redis");
// const redis = require("redis");

// const io = new Server({
//   cors: { origin: "*" }
// });

// // Redis 3 style client
// const pubClient = redis.createClient(6379, "localhost", { auth_pass: null });
// const subClient = redis.createClient(6379, "localhost", { auth_pass: null });

// // Error handlers
// pubClient.on("error", (err) => console.error("Redis pubClient error:", err));
// subClient.on("error", (err) => console.error("Redis subClient error:", err));

// // Attach adapter
// io.adapter(redisAdapter({ pubClient, subClient }));

// console.log("Socket.IO Redis adapter initialized (Redis v3)");

// module.exports = { io };
const redis = require("redis");

// Publisher client
const publisher = redis.createClient(6379, "localhost");

publisher.on("error", (err) => console.error("Redis Pub Error:", err));

/**
 * Publish a notification
 * @param {Object} options
 * @param {string} options.userId - Target user ID
 * @param {Object} options.notification - Notification payload
 */
function sendNotification({ userId, notification }) {
  const message = JSON.stringify({ userId, notification });
  publisher.publish("notification", message);
}

module.exports = { sendNotification };
