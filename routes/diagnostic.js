const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

// Configure multer to store uploaded file in memory temporarily
const upload = multer({ storage: multer.memoryStorage() });

// Live AI Service URL with fallback to your Render Python deployment
const AI_URL = process.env.AI_SERVICE_URL || 'https://proshwas-ai.onrender.com';

router.post('/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided in request.' });
        }

        // Build form-data payload to forward the image buffer to the Python Flask backend
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        // Send request to the live Python AI service
        const response = await axios.post(`${AI_URL}/predict`, formData, {
            headers: {
                ...formData.getHeaders()
            },
            timeout: 60000 // 60-second timeout for model inference
        });

        // Send successful AI results (prediction, confidence, overlay) back to frontend
        return res.json(response.data);

    } catch (error) {
        console.error('AI Service Communication Error:', error.message);
        
        // Extract exact error message from Python backend if available
        const errorMsg = error.response?.data?.error || 'Failed to analyze radiograph. Please ensure the AI engine is running.';
        
        return res.status(500).json({ error: errorMsg });
    }
});

module.exports = router;