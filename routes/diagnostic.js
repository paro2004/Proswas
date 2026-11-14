const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const upload = multer({ storage: multer.memoryStorage() });
const AI_URL = process.env.AI_SERVICE_URL || 'https://proshwas-ai.onrender.com';

// Helper function to retry requests if the backend is experiencing a cold start
async function postWithRetry(url, formData, headers, retries = 2, delay = 4000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await axios.post(url, formData, {
                headers: headers,
                timeout: 120000 // 2-minute timeout for heavy PyTorch model cold starts
            });
        } catch (error) {
            console.log(`Attempt ${i + 1} failed. Retrying in ${delay/1000}s (Backend may be waking up)...`);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

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

        // Use auto-retry wrapper
        const response = await postWithRetry(`${AI_URL}/predict`, formData, {
            ...formData.getHeaders()
        });

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
        
        return res.render('index', {
            error: 'AI engine is waking up from sleep mode. Please wait a moment and click Analyze again.',
            success: null,
            formData: req.body || {},
            result: null
        });
    }
});

module.exports = router;