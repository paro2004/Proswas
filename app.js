const express = require('express');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => {
    res.render('index', { 
        error: null, 
        success: null, 
        formData: {}, 
        result: null 
    });
});

try {
    const diagnosticRoutes = require('./routes/diagnostic');
    app.use('/', diagnosticRoutes);
} catch (err) {
    console.error('Error loading diagnostic routes:', err.message);
}

app.get('/analyze', (req, res) => {
    res.render('index', { 
        error: null, 
        success: null, 
        formData: {}, 
        result: null 
    });
});

app.use((req, res) => {
    res.status(404).send('Page not found.');
});

app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).send('Internal Server Error: ' + err.message);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Proshwas Frontend Server running on port ${PORT}`);
});