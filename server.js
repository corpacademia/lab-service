const app = require('./src/app');
require('dotenv').config();

const PORT = process.env.PORT || 3002;
const HOST = '0.0.0.0'; // ✅ Listen on all interfaces

app.listen(PORT, HOST, (err) => {
    if (err) {
        console.error("Error starting Lab Service:", err);
        process.exit(1);
    }
    console.log(`✅ Lab service running on http://${HOST}:${PORT}`);
});
