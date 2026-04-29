require('dotenv').config({ path: './config.env' });
const express = require('express');
const app = express();
const globalErrorHandler = require('./middlewares/globalError');
const AppError = require('./utils/appError');
const userRouter = require('./routes/userRoute');
const AuthRouter = require('./routes/authRoute')

app.use(express.json()); // Middleware to parse JSON bodies

app.use('/api/auth', AuthRouter); // Mount auth routes
app.use('/api/users', userRouter); // Mount user routes
app.use(express.urlencoded({ extended: true }));


app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the Agri API'
  });
});

app.use( (req,res,next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
})

app.use(globalErrorHandler);

module.exports = app;