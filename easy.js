const express = require('express');
const { createAxiosClient } = require('@samuraitruong/php-cookie-challenge');

const app = express();
app.use(express.urlencoded({ extended: true }));

// Replace with your actual InfinityFree endpoint
const TARGET_URL = 'https://lawson12.site.je/atta/biometric_attendance.php';

// Create a client that automatically handles the JS challenge
const client = createAxiosClient({
  baseURL: 'https://lawson12.site.je',
  timeout: 10000,
});

// Forward all POST requests from the ESP32 to InfinityFree
app.post('/', async (req, res) => {
  try {
    const response = await client.post('/atta/biometric_attendance.php', req.body);
    res.send(response.data);
  } catch (error) {
    console.error('Relay error:', error.message);
    res.status(500).json({ success: false, error: 'relay_failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Relay listening on ${PORT}`));
