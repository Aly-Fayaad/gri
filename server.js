require('dotenv').config({ path: './config.env', debug: false });
const app = require('./app');
const mongoose = require('mongoose');



const PORT = process.env.PORT || 3000;

const DB = process.env.DATABASE.replace('<db_password>', process.env.DATABASE_PASSWORD);

async function connect(){
  try{
    mongoose.connect(DB)
    
    console.log('database has connected')
  }catch(error){
    console.log(error)
  }
}
connect();


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});