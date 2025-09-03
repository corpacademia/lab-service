const pool = require('../db/dbConfig');

const enableUuidExtension = async () => {
    try {
      const client = await pool.connect();
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      console.log("uuid-ossp extension enabled successfully!");
      client.release();
    } catch (err) {
      console.error("Error enabling uuid-ossp extension:", err.message);
    }
  };

module.exports = enableUuidExtension;