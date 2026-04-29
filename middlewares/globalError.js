const AppError = require("../utils/appError");

module.exports = (err, req, res, next) => {

    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
    let error = err;
   
   
    if (error.name === 'CastError') {
      const message = `Invalid ${error.path}: ${error.value}.`;
      error = new AppError(message, 400);
    }

    if (error.code === 11000) {
        console.log(error)
       const field = Object.keys(err.keyValue)[0];
       const message = `Duplicate field ${field}:  ${Object.values(err.keyValue)}.`;
      error = new AppError(message,400)
  }
  
  if (error.name === 'ValidationError'){
    console.log(error)
    const errors = Object.values(err.errors).map(el => el.message);
    const message = `Invalid input format: ${errors.join('. ')}`;
    error =  new AppError(message, 400);
  }



  res.status(error.statusCode).json({
    status: error.status,
    message: error.message,
  });
}

