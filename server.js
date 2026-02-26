const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// --- Auth Routes ---
app.post('/api/auth/signup', (req, res) => {
    const { username, password, role, name, age, gender, contact, address, specialization, experience, fees } = req.body;

    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [username, password, role], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const userId = this.lastID;

        if (role === 'patient') {
            db.run(`INSERT INTO patients (name, age, gender, contact, address, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
                [name, age, gender, contact, address, userId], function (err) {
                    const patientId = this.lastID;
                    db.run(`UPDATE users SET linked_id = ? WHERE id = ?`, [patientId, userId]);
                    res.json({ id: userId, role, linked_id: patientId });
                });
        } else if (role === 'doctor') {
            db.run(`INSERT INTO doctors (name, specialization, experience, contact, fees, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
                [name, specialization, experience, contact, fees || 500, userId], function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    const doctorId = this.lastID;
                    db.run(`UPDATE users SET linked_id = ? WHERE id = ?`, [doctorId, userId]);
                    res.json({ id: userId, role, linked_id: doctorId });
                });
        } else if (role === 'admin') {
            db.run(`INSERT INTO admins (name, contact, user_id) VALUES (?, ?, ?)`,
                [name, contact, userId], function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    const adminId = this.lastID;
                    db.run(`UPDATE users SET linked_id = ? WHERE id = ?`, [adminId, userId]);
                    res.json({ id: userId, role, linked_id: adminId });
                });
        } else {
            res.status(400).json({ error: "Invalid role specified" });
        }
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });
        res.json({ id: user.id, username: user.username, role: user.role, linked_id: user.linked_id });
    });
});

// --- Admin Routes ---
app.get('/api/admins', (req, res) => {
    db.all("SELECT a.*, u.username, u.role FROM admins a JOIN users u ON a.user_id = u.id", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Patient Routes ---
app.get('/api/patients', (req, res) => {
    db.all("SELECT * FROM patients", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Doctor Routes ---
app.get('/api/doctors', (req, res) => {
    db.all("SELECT * FROM doctors", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Appointment Routes ---
app.get('/api/appointments', (req, res) => {
    const { role, linked_id } = req.query;
    let query = `
        SELECT a.*, p.name as patient_name, d.name as doctor_name 
        FROM appointments a
        LEFT JOIN patients p ON a.patient_id = p.id
        LEFT JOIN doctors d ON a.doctor_id = d.id
    `;
    let params = [];

    if (role === 'patient') {
        query += ` WHERE a.patient_id = ?`;
        params.push(linked_id);
    }
    // Every doctor can now see every appointment as requested

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/appointments', (req, res) => {
    const { patient_id, doctor_id, appointment_date, reason } = req.body;
    db.run(`INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason) VALUES (?, ?, ?, ?)`,
        [patient_id, doctor_id, appointment_date, reason],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.patch('/api/appointments/:id', (req, res) => {
    const { appointment_date, reason } = req.body;
    const appointmentId = req.params.id;

    db.run(`UPDATE appointments SET appointment_date = ?, reason = ? WHERE id = ?`,
        [appointment_date, reason, appointmentId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.patch('/api/appointments/:id/status', (req, res) => {
    const { status } = req.body;
    const appointmentId = req.params.id;

    db.get("SELECT * FROM appointments WHERE id = ?", [appointmentId], (err, appointment) => {
        if (err || !appointment) return res.status(404).json({ error: "Appointment not found" });

        db.run(`UPDATE appointments SET status = ? WHERE id = ?`, [status, appointmentId], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // If visit is completed, generate bill
            if (status === 'Completed') {
                db.get("SELECT fees FROM doctors WHERE id = ?", [appointment.doctor_id], (err, doctor) => {
                    const amount = doctor ? doctor.fees : 500;
                    db.run(`INSERT INTO billing (patient_id, appointment_id, amount, status) VALUES (?, ?, ?, ?)`,
                        [appointment.patient_id, appointmentId, amount, 'Unpaid']);
                });
            }
            res.json({ success: true });
        });
    });
});

// --- Medical Record Routes ---
app.get('/api/records/:patientId', (req, res) => {
    db.all("SELECT * FROM medical_records WHERE patient_id = ?", [req.params.patientId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Billing Routes ---
app.get('/api/billing', (req, res) => {
    const { role, linked_id } = req.query;
    let query = `
        SELECT b.*, p.name as patient_name, d.name as doctor_name, a.appointment_date, d.fees as doctor_fee
        FROM billing b
        LEFT JOIN patients p ON b.patient_id = p.id
        LEFT JOIN appointments a ON b.appointment_id = a.id
        LEFT JOIN doctors d ON a.doctor_id = d.id
    `;
    let params = [];

    if (role === 'patient') {
        query += ` WHERE b.patient_id = ?`;
        params.push(linked_id);
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Serve static files from the React frontend app
const distPath = path.join(__dirname, '../frontend/dist');
console.log('Serving static files from:', distPath);
app.use(express.static(distPath));

// Explicitly serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.use((req, res) => {
    console.log('Static fallback triggered for:', req.url);
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
