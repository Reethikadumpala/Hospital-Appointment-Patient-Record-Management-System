const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'hospital.db');
const db = new sqlite3.Database(dbPath);

console.log("Checking tables...");
db.serialize(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) console.error(err);
        console.log("Tables:", tables.map(t => t.name).join(", "));

        db.all("PRAGMA table_info(patients)", (err, columns) => {
            console.log("Patients columns:", columns.map(c => c.name).join(", "));
            db.all("PRAGMA table_info(doctors)", (err, columns) => {
                console.log("Doctors columns:", columns.map(c => c.name).join(", "));
                db.all("SELECT * FROM users", (err, users) => {
                    console.log("Users count:", users ? users.length : 0);
                    process.exit(0);
                });
            });
        });
    });
});
