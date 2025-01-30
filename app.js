const express = require('express');
const User = require('./models/User');
const mongoose = require('mongoose');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const dotenv = require("dotenv");
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const TeachableMachine = require("@sashido/teachablemachine-node");
const app = express();
const { spawn } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();
const geminiApiKey = process.env.GEMINI_API_KEY;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secretKey',
    resave: false,
    saveUninitialized: true,
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());



mongoose.connect('mongodb://localhost:27017/snakeShield')
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('MongoDB connection error:', err));

const accountSid = process.env.TWILIO_ACCOUNT_ID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_NUMBER;

const client = new twilio(accountSid, authToken);


//sos wala
app.get('/sos', (req, res) => {
    const user = req.session.user; 
    res.render('sos', { user });
});

app.post('/send-sms', (req, res) => {
    const { phone, message } = req.body;

    client.messages.create({
        body: message,
        to: phone,  
        from: twilioPhoneNumber  
    })
    .then((message) => {
        res.json({ message: 'SOS sent successfully!', sid: message.sid });
    })
    .catch((error) => {
        console.error('Error sending SMS:', error);
        res.status(500).json({ error: 'Failed to send SOS message' });
    });
});


app.get('/', (req,res)=>{
    res.render('register');
})

app.get('/register', (req, res) => {
    res.render('register');
});


app.post('/register', async (req, res) => {
    const { username, password, emergencyNumber, gender, age } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            password: hashedPassword,
            emergencyNumber,
            gender,
            age,
        });
        const savedUser = await newUser.save();
        req.session.user = savedUser; 
        res.redirect('/profile'); 
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('Error registering user');
    }
});


app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).send('Invalid username or password');
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.render('login', { errorMessage: 'Invalid username or password' });
        }
        req.session.user = user;
        res.redirect('/profile'); 
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Error logging in');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});



app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('profile', { user: req.session.user });
});


app.get('/edit-profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('edit-profile', { user: req.session.user });
});


app.post('/edit-profile', async (req, res) => {
    const { emergencyNumber, gender, age, newPassword } = req.body;

    
    const updatedFields = {
        emergencyNumber,
        gender,
        age
    };

    
    if (newPassword) {
        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            updatedFields.password = hashedPassword; 
        } catch (error) {
            console.error('Error hashing password:', error);
            return res.status(500).send('Error updating password');
        }
    }

    try {
        
        const updatedUser = await User.findByIdAndUpdate(req.session.user._id, updatedFields, { new: true });
        req.session.user = updatedUser;
        res.redirect('/edit-profile'); 
    } catch (error) {
        console.error('Edit profile error:', error);
        res.status(500).send('Error updating profile');
    }
});


app.post('/delete-profile', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.session.user._id);
        req.session.destroy(); 
        res.redirect('/register');
    } catch (error) {
        console.error('Delete profile error:', error);
        res.status(500).send('Error deleting profile');
    }
});

app.get('/identify', (req, res) => {
    res.render('identify');
});




//chatbot
const googleAI = new GoogleGenerativeAI(geminiApiKey);

const geminiConfig = {
  temperature: 0.9,
  topP: 1,
  topK: 1,
  maxOutputTokens: 150,
};

const geminiModel = googleAI.getGenerativeModel({
  model: "gemini-pro",
  geminiConfig,
});

app.post("/ask", async (req, res) => {
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ response: "No question provided." });
    }

    try {
        const result = await geminiModel.generateContent(question);
        const response = result.response.text(); 

        if (response) {
            return res.json({ response });
        } else {
            return res.status(500).json({ response: "Error occurred while processing your question." });
        }
    } catch (error) {
        console.error("Error occurred:", error);
        return res.status(500).json({ response: "Error occurred while processing your question." });
    }
});

app.listen(8080, () => {
    console.log('Server running on http://localhost:8080');
});

