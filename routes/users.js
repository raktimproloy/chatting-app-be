const express = require('express');
const User = require('../models/User');

const router = express.Router();

router.get("/", async(req, res, next) =>{
    try{
      const users = await User.find({});
      const usersData = await Promise.all(users.map((user) => {
        return {user: {phone: user.phone, fullname: user.fullname}, userId: user._id};
      }));
      res.status(200).json(usersData);
    } catch(err){
      next(err);
    }
  })

module.exports = router;


