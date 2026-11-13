const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const PDFDocument = require('pdfkit');

// In-memory file processing
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, PNG) are permitted.'), false);
        }
    }
});

// Clean base URL to prevent double '/predict/predict' bugs
const RAW_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5000';
const BASE_AI_URL = RAW_URL.replace(/\/predict\/?$/, '').replace(/\/+$/, '');
const AI_PREDICT_ENDPOINT = `${BASE_AI_URL}/predict`;

// GET: Wake backend immediately when user loads the page
router.get('/', (req, res) => {
    axios.get(`${BASE_AI_URL}/`, { timeout: 8000 }).catch(() => {});

    res.render('index', {
        result: null,
        formData: {},
        error: null
    });
});

// Helper: Post with automatic retry for cold starts
async function queryAIWithRetry(form, maxAttempts = 2) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await axios.post(AI_PREDICT_ENDPOINT, form, {
                headers: { ...form.getHeaders() },
                timeout: 90000 
            });
        } catch (err) {
            console.warn(`AI service call failed on attempt ${attempt}:`, err.message);
            if (attempt === maxAttempts) throw err;
            await new Promise(resolve => setTimeout(resolve, 4000));
        }
    }
}

// POST: Run analysis
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

        const response = await queryAIWithRetry(form);
        const { prediction, confidence_percent, overlay_base64 } = response.data;

        const result = {
            prediction,
            confidence_percent,
            overlay_base64,
            input_base64: req.file.buffer.toString('base64')
        };

        // Store result in session so the user can download the PDF report
        req.session.latestResult = { formData, result };

        res.render('index', {
            result,
            formData,
            error: null
        });

    } catch (err) {
        console.error('Final AI error:', err.message);
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

// GET: Download PDF Diagnostic Report
router.get('/download-report', (req, res) => {
    const sessionData = req.session && req.session.latestResult;
    if (!sessionData) {
        return res.status(400).send('No diagnostic report available to download. Please run an analysis first.');
    }

    const { formData, result } = sessionData;

    // Create a new PDF document (A4 size)
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Proshwas_Report_${formData.patient_id || 'Patient'}.pdf`);

    doc.pipe(res);

    // --- PDF Header ---
    doc.fontSize(22).fillColor('#1b4332').text('PROSHWAS MEDICAL AI', { align: 'center' });
    doc.fontSize(10).fillColor('#6c757d').text('Automated Chest Radiograph Pneumonia Screening Report', { align: 'center' });
    doc.moveDown(1.5);

    // --- Patient Information Box ---
    doc.fontSize(14).fillColor('#2d3748').text('Patient Information', { underline: true });
    doc.fontSize(11).fillColor('#000000');
    doc.text(`Patient Name: ${formData.patient_name || 'N/A'}`);
    doc.text(`Age: ${formData.age || 'N/A'}`);
    doc.text(`Patient ID: ${formData.patient_id || 'N/A'}`);
    doc.text(`Report Generated: ${new Date().toLocaleString()}`);
    doc.moveDown(1.5);

    // --- Diagnostic Assessment ---
    doc.fontSize(14).fillColor('#2d3748').text('Diagnostic Assessment', { underline: true });
    doc.fontSize(11);
    doc.text(`Prediction Result: ${result.prediction}`);
    doc.text(`Confidence Score: ${result.confidence_percent}%`);
    doc.moveDown(1.5);

    // --- Grad-CAM Heatmap Embedding ---
    if (result.overlay_base64) {
        doc.fontSize(14).fillColor('#2d3748').text('Grad-CAM Heatmap Visualization', { underline: true });
        doc.moveDown(0.5);
        try {
            const imgBuffer = Buffer.from(result.overlay_base64, 'base64');
            doc.image(imgBuffer, { fit: [220, 220], align: 'center' });
        } catch (e) {
            doc.text('[Image embedding failed]');
        }
    }

    // --- Footer Disclaimer ---
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#a0aec0').text(
        'Disclaimer: This is an AI-assisted screening report generated by Proshwas. It does not replace professional clinical evaluation. Please consult a qualified radiologist or physician for formal diagnosis.',
        { align: 'center' }
    );

    doc.end();
});

module.exports = router;