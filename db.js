const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'hospital.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // For development: Drop tables to ensure schema updates are applied
        // Uncomment the lines below if you need a hard reset
        // db.run("DROP TABLE IF EXISTS patients");
        // db.run("DROP TABLE IF EXISTS doctors");
        // db.run("DROP TABLE IF EXISTS users");
        // db.run("DROP TABLE IF EXISTS appointments");
        // db.run("DROP TABLE IF EXISTS medical_records");
        // db.run("DROP TABLE IF EXISTS billing");

        // Users Table for Auth
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL, -- 'admin', 'doctor', 'patient'
            linked_id INTEGER -- ID in patients, doctors, or admins table
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact TEXT,
            user_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            age INTEGER,
            gender TEXT,
            contact TEXT,
            address TEXT,
            user_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS doctors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            specialization TEXT,
            experience INTEGER,
            contact TEXT,
            fees REAL DEFAULT 500,
            user_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // ... rest of the tables ...
        db.run(`CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            doctor_id INTEGER,
            appointment_date DATETIME,
            status TEXT DEFAULT 'Pending',
            reason TEXT,
            FOREIGN KEY (patient_id) REFERENCES patients (id),
            FOREIGN KEY (doctor_id) REFERENCES doctors (id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS medical_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            doctor_id INTEGER,
            diagnosis TEXT,
            treatment TEXT,
            record_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients (id),
            FOREIGN KEY (doctor_id) REFERENCES doctors (id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS billing (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            appointment_id INTEGER,
            amount REAL,
            status TEXT DEFAULT 'Unpaid',
            billing_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients (id),
            FOREIGN KEY (appointment_id) REFERENCES appointments (id)
        )`);

        // Ensure we handle migrations safely by checking columns
        db.all("PRAGMA table_info(patients)", (err, columns) => {
            const hasUserId = columns.some(c => c.name === 'user_id');
            if (!hasUserId && columns.length > 0) {
                console.log("Migrating patients table to add user_id...");
                db.run("ALTER TABLE patients ADD COLUMN user_id INTEGER REFERENCES users(id)");
            }
        });

        db.all("PRAGMA table_info(doctors)", (err, columns) => {
            const hasUserId = columns.some(c => c.name === 'user_id');
            if (!hasUserId && columns.length > 0) {
                console.log("Migrating doctors table to add user_id...");
                db.run("ALTER TABLE doctors ADD COLUMN user_id INTEGER REFERENCES users(id)");
            }
            const hasFees = columns.some(c => c.name === 'fees');
            if (!hasFees && columns.length > 0) {
                console.log("Migrating doctors table to add fees...");
                db.run("ALTER TABLE doctors ADD COLUMN fees REAL DEFAULT 500");
            }
        });

        // Seed Admin User
        db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
            if (!row) {
                db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ["admin", "admin123", "admin"], function (err) {
                    if (err) return;
                    const userId = this.lastID;
                    db.run("INSERT INTO admins (name, contact, user_id) VALUES (?, ?, ?)", ["System Admin", "Admin Office", userId], function (err) {
                        if (err) return;
                        const adminId = this.lastID;
                        db.run("UPDATE users SET linked_id = ? WHERE id = ?", [adminId, userId]);
                    });
                });
                console.log('Seeded admin user with profile.');
            }
        });

        // Seed initial doctors and link them to user accounts if not existing
        db.get("SELECT COUNT(*) as count FROM doctors", (err, row) => {
            if (row && row.count === 0) {
                const initialDoctors = [
                    ["Dr. Alice Smith", "Cardiology", 15, "123-456-7890", "alice", "doc123", 1200],
                    ["Dr. Bob Johnson", "Pediatrics", 10, "234-567-8901", "bob", "doc123", 800],
                    ["Dr. Charlie Brown", "Neurology", 20, "345-678-9012", "charlie", "doc123", 1500]
                ];

                initialDoctors.forEach(([name, spec, exp, tel, user, pass, fees]) => {
                    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [user, pass, "doctor"], function (err) {
                        if (err) return;
                        const userId = this.lastID;
                        db.run("INSERT INTO doctors (name, specialization, experience, contact, fees, user_id) VALUES (?, ?, ?, ?, ?, ?)",
                            [name, spec, exp, tel, fees, userId], function (err) {
                                if (err) return;
                                const doctorId = this.lastID;
                                db.run("UPDATE users SET linked_id = ? WHERE id = ?", [doctorId, userId]);
                            });
                    });
                });
                console.log('Seeded initial doctors.');
            }
        });
    });
}

module.exports = db;
