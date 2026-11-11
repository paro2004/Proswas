const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

// In-memory buffer storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, PNG) are permitted.'), false);
        }
    }
});

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5000/predict';

// Proactive wake-up call to spin up the AI microservice in background when user opens the page
router.get('/', (req, res) => {
    // Fire-and-forget ping to wake Flask up before the user even uploads an image
    const pingUrl = AI_SERVICE_URL.replace('/predict', '/');
    axios.get(pingUrl, { timeout: 5000 }).catch(() => {});

    res.render('index', {
        result: null,
        formData: {},
        error: null
    });
});

// Helper function to send scan with automatic retry on cold start
async function sendToAI(form, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await axios.post(AI_SERVICE_URL, form, {
                headers: { ...form.getHeaders() },
                timeout: 90000 // 90 seconds accommodates full Render container spin-up
            });
        } catch (err) {
            if (attempt === retries) throw err;
            console.log(`AI service spin-up detected. Retrying attempt ${attempt + 1}...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

// POST: Process diagnosis
router.post('/analyze', upload.single('xray_image'), async (req, res) => {
    const { patient_name, age, patient_id } = req.body;
    const formData = { patient_name, age, patient_id };

    if (!req.file) {
        return res.render('index', {
            result: null,
            formData,
            error: 'Please upload a chest radiograph image to analyze.'
        });
    }

    try {
        const form = new FormData();
        form.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        const response = await sendToAI(form);
        const { prediction, confidence_percent, overlay_base64 } = response.data;

        res.render('index', {
            result: {
                prediction,
                confidence_percent,
                overlay_base64,
                input_base64: req.file.buffer.toString('base64')
            },
            formData,
            error: null
        });

    } catch (err) {
        console.error('AI Service Communication Error:', err.message);
        let errorMsg = 'Failed to analyze radiograph. Please ensure the AI engine is running.';
        if (err.response && err.response.data && err.response.data.error) {
            errorMsg = err.response.data.error;
        }

        res.render('index', {
            result: null,
            formData,
            error: errorMsg
        });
    }
});

module.exports = router;