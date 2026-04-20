const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {promisify} = require('util');


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