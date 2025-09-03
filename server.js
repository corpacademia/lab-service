const app = require('./src/app');

require('dotenv').config();

const PORT = process.env.PORT || 3002;

app.listen(PORT, (err) => {
    if (err) {
        console.error("Error starting Lab Service:", err);
        process.exit(1); // Exit on failure
    }
    console.log(`Lab service running on port: ${PORT}`);
});
