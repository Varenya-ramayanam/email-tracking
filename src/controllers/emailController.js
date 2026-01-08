const { google } = require('googleapis');
const db = require('../config/firebase');
const admin = require('firebase-admin'); 
const { analyzeInterviewDetails } = require('../services/geminiService');
const { addToCalendar } = require('../services/calendarService');

const processUserEmails = async (req, res) => {
  const { accessToken, userId } = req.body;

  if (!accessToken || !userId) {
    return res.status(400).json({ error: "Access Token and UserID are required" });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    // 1. Get the specific user's document for their unique sync time
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    let gmailQuery = '(shortlisted OR interview OR "congratulations") -label:trash -label:spam';
    
    // 2. Logic: Search only AFTER the last time THIS user synced
    if (userDoc.exists && userDoc.data().lastSync) {
      const lastSync = userDoc.data().lastSync;
      // Convert Firestore Timestamp to Unix Seconds for Gmail's 'after:' filter
      const unixSeconds = Math.floor(lastSync.toDate().getTime() / 1000);
      gmailQuery += ` after:${unixSeconds}`;
    } else {
      // Fallback for new users: scan last 30 days
      gmailQuery += ` newer_than:30d`;
    }

    console.log(`🔎 User [${userId}] Scan: ${gmailQuery}`);

    // 3. Fetch messages based on user-specific query
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: 15
    });

    const messages = response.data.messages || [];
    const results = [];

    // If no new emails, update timestamp anyway to mark the "last checked" time
    if (messages.length === 0) {
      await userRef.set({ 
        lastSync: admin.firestore.FieldValue.serverTimestamp() 
      }, { merge: true });
      return res.status(200).json({ message: "No new updates found", results: [] });
    }

    // 4. Processing Loop
    for (const msg of messages) {
      const email = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      
      let body = "";
      const payload = email.data.payload;
      if (payload.parts) {
        body = Buffer.from(payload.parts[0].body.data || "", 'base64').toString();
      } else if (payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString();
      }

      const snippet = email.data.snippet;
      const contentToAnalyze = body.length > 10 ? body : snippet;

      // Basic filter to save AI processing credits
      if (contentToAnalyze.toLowerCase().includes("interview")) {
        const interviewData = await analyzeInterviewDetails(contentToAnalyze);

        if (interviewData) {
          try {
            const cal = await addToCalendar(auth, interviewData);
            
            // Add to job_applications collection with the userId
            await db.collection('job_applications').add({
              userId,
              company: interviewData.company,
              status: "Shortlisted",
              level: interviewData.level || "Interview",
              snippet: snippet,
              calendarId: cal.id,
              processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            results.push({ company: interviewData.company, status: "Synced" });
          } catch (calErr) {
            console.error(`❌ Calendar Error for ${userId}:`, calErr.message);
          }
        }
      }
    }

    // 5. Success! Update the user's specific lastSync timestamp
    await userRef.set({ 
      lastSync: admin.firestore.FieldValue.serverTimestamp() 
    }, { merge: true });

    res.status(200).json({ message: `Processed ${results.length} updates`, results });

  } catch (err) {
    console.error("🚨 Controller Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// CRITICAL: Ensure this export matches your import in app.js
module.exports = { processUserEmails };