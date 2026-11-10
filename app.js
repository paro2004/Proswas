const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const diagnosticRoutes = require('./routes/diagnostic');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/boilerplate');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount routes
app.use('/', diagnosticRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('index', {
        result: null,
        formData: req.body || {},
        error: err.message || 'An unexpected error occurred during processing.'
    });
});

app.listen(PORT, () => {
    console.log(`Proshwas Web Gateway running at http://localhost:${PORT}`);
});