const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {promisify} = require('util');
const catchAsync = require('../utils/catchAsync');


exports.getMe = async (req, res)=>{
    try {
        const user = req.user;
        if(!user){
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }
        res.status(200).json({
            status: 'success',
            data: user
        })
    } catch (error) {
        res.status(500).json({
            status: 'fail',
            message: 'Error fetching user data'
        });
    }
}

exports.getAllUsers = catchAsync(async (req ,res, next) =>{
    
    const users = await User.find(); // Fetches every record from the database
        res.status(200).json(users);    // Sends back the list with a 200 OK status
    
})

exports.deleteUser = catchAsync(async (req, res, next) =>{
    const user = await User.findByIdAndDelete(req.params.id);
    if(!user){
        return next(new AppError("the user with this id doesn't exist"))
    }
    res.status(200).json({
        status: 'success',
        data: null
    })
})