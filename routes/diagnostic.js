const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

// Configure multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Explicitly point to your live Render AI backend URL
const AI_URL = process.env.AI_SERVICE_URL || 'https://proshwas-ai.onrender.com';

router.post('/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).render('index', {
                error: 'No image file provided in request.',
                success: null,
                formData: req.body || {},
                result: null
            });
        }

        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        // Forward request directly to Python Flask AI backend /predict endpoint
        const response = await axios.post(`${AI_URL}/predict`, formData, {
            headers: {
                ...formData.getHeaders()
            },
            timeout: 90000 // 90-second timeout for Render cold starts
        });

        // Attach user metadata back for rendering
        const analysisResult = {
            ...response.data,
            patient_name: req.body.patient_name || 'N/A',
            age: req.body.age || 'N/A',
            patient_id: req.body.patient_id || 'N/A'
        };

        return res.render('index', {
            error: null,
            success: 'Analysis completed successfully.',
            formData: req.body || {},
            result: analysisResult
        });

    } catch (error) {
        console.error('AI Service Communication Error:', error.message);
        
        const errorMsg = error.response?.data?.error || 'Failed to connect to AI backend. Please ensure the AI service is awake and try again.';
        
        return res.render('index', {
            error: errorMsg,
            success: null,
            formData: req.body || {},
            result: null
        });
    }
});

module.exports = router;