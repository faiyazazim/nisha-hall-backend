const express = require('express');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ── MySQL Connection ──
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306
});

db.connect((err) => {
  if (err) { console.error('DB connection failed:', err); return; }
  console.log('✅ MySQL connected');

  db.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bride_name VARCHAR(100),
      groom_name VARCHAR(100),
      event_date DATE,
      event_type VARCHAR(100),
      guests INT,
      contact VARCHAR(20),
      special_req TEXT,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Table creation error:', err);
    else console.log('✅ Bookings table ready');
  });
});

// ── Email Setup ──
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// ── Twilio Setup (optional) ──
const twilioClient = process.env.TWILIO_SID
  ? twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN)
  : null;

// ── Booking Route ──
app.post('/api/booking', async (req, res) => {
  const { bride_name, groom_name, event_date, event_type, guests, contact, special_req } = req.body;

  db.query(
    `INSERT INTO bookings (bride_name, groom_name, event_date, event_type, guests, contact, special_req)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [bride_name, groom_name, event_date, event_type, guests, contact, special_req],
    async (err, result) => {
      if (err) {
        console.error('DB insert error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      const bookingId = result.insertId;

      // 2. Send Email
      try {
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: process.env.OWNER_EMAIL,
          subject: `New Booking - ${bride_name} & ${groom_name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;padding:24px;border-radius:8px">
              <h2 style="color:#6b0f1a">New Booking - Nisha Marriage Hall</h2>
              <hr style="border-color:#c9a84c"/>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px;font-weight:bold">Booking ID</td><td>#${bookingId}</td></tr>
                <tr style="background:#fdf6e3"><td style="padding:8px;font-weight:bold">Bride</td><td>${bride_name}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Groom</td><td>${groom_name}</td></tr>
                <tr style="background:#fdf6e3"><td style="padding:8px;font-weight:bold">Event Date</td><td>${event_date}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Event Type</td><td>${event_type}</td></tr>
                <tr style="background:#fdf6e3"><td style="padding:8px;font-weight:bold">Guests</td><td>${guests}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Contact</td><td>${contact}</td></tr>
                <tr style="background:#fdf6e3"><td style="padding:8px;font-weight:bold">Special Request</td><td>${special_req || 'None'}</td></tr>
              </table>
              <p style="margin-top:16px;color:#888;font-size:12px">Submitted at: ${new Date().toLocaleString('en-IN')}</p>
            </div>
          `
        });
        console.log('✅ Email sent');
      } catch (emailErr) {
        console.error('Email error:', emailErr);
      }

      // 3. Send WhatsApp (only if Twilio is configured)
      if (twilioClient) {
        try {
          await twilioClient.messages.create({
            from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_FROM,
            to: 'whatsapp:' + process.env.OWNER_WHATSAPP,
            body: `New Booking - Nisha Marriage Hall\n\n` +
                  `Booking ID: #${bookingId}\n` +
                  `Bride: ${bride_name}\n` +
                  `Groom: ${groom_name}\n` +
                  `Date: ${event_date}\n` +
                  `Event: ${event_type}\n` +
                  `Guests: ${guests}\n` +
                  `Contact: ${contact}\n` +
                  `Note: ${special_req || 'None'}`
          });
          console.log('✅ WhatsApp sent');
        } catch (waErr) {
          console.error('WhatsApp error:', waErr);
        }
      }

      res.json({ success: true, bookingId });
    }
  );
});

// ── Health Check ──
app.get('/', (req, res) => res.send('Nisha Hall Backend Running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
