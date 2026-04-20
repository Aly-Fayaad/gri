const express = require('express');
const app = express();

const userRouter = require('./routes/userRoute');

app.use(express.json()); // Middleware to parse JSON bodies
app.use('/api/v1/users', userRouter); // Mount the user router at the specified path



app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the Agri API'
  });
});


module.exports = app;