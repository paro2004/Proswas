const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const upload = multer({ storage: multer.memoryStorage() });
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

        // 90-second timeout to handle Render cold starts
        const response = await axios.post(`${AI_URL}/predict`, formData, {
            headers: { ...formData.getHeaders() },
            timeout: 90000 
        });

        return res.render('index', {
            error: null,
            success: 'Analysis completed successfully.',
            formData: req.body || {},
            result: response.data
        });

    } catch (error) {
        console.error('AI Service Communication Error:', error.message);
        
        const errorMsg = error.response?.data?.error || 'AI engine is waking up from sleep mode. Please wait 30 seconds and try clicking Analyze again.';
        
        return res.render('index', {
            error: errorMsg,
            success: null,
            formData: req.body || {},
            result: null
        });
    }
});

module.exports = router;