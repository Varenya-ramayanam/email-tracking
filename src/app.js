require("dotenv").config();

 
const express = require('express');
const cors = require('cors');
const { processUserEmails } = require('./controllers/emailController');


const app = express();
app.use(cors());
app.use(express.json());
 
// Main Endpoint
app.post('/api/process-emails', processUserEmails);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
}); 