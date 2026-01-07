const { google } = require('googleapis');
const db = require('../config/firebase');
const admin = require('firebase-admin'); 
const { analyzeInterviewDetails } = require('../services/geminiService');
const { addToCalendar } = require('../services/calendarService');

const processUserEmails = async (req, res) => {
  const { accessToken, userId } = req.body;
  if (!accessToken) return res.status(400).json({ error: "Access Token required" });

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    // 🕒 1. Get the last sync time from a dedicated 'users' metadata doc
    // This avoids the complex "where + orderBy" query on 'job_applications'
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    let gmailQuery = '(shortlisted OR interview OR "congratulations") -label:trash -label:spam';
    let lastSync = null;

    if (userDoc.exists && userDoc.data().lastSync) {
      lastSync = userDoc.data().lastSync;
      const unixSeconds = Math.floor(lastSync.toDate().getTime() / 1000);
      gmailQuery += ` after:${unixSeconds}`;
    } else {
      gmailQuery += ` newer_than:30d`;
    }

    console.log(`🔎 Initiating scan: ${gmailQuery}`);

    // 2. 📧 Fetch messages
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: 15
    });

    const messages = response.data.messages || [];
    const results = [];

    if (messages.length === 0) {
      console.log("✅ Scanning completed: No new emails found.");
      
      // Update the sync timestamp even if no emails found to mark the check time
      await userRef.set({ lastSync: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      
      return res.status(200).json({ message: "No new updates found", results: [] });
    }

    // 3. 🤖 AI Analysis Loop
    for (const msg of messages) {
      const email = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      const snippet = email.data.snippet;
      
      let body = "";
      const payload = email.data.payload;
      if (payload.parts) {
        body = Buffer.from(payload.parts[0].body.data || "", 'base64').toString();
      } else if (payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString();
      }

      const contentToAnalyze = body.length > 10 ? body : snippet;

      if (contentToAnalyze.toLowerCase().includes("interview")) {
        const interviewData = await analyzeInterviewDetails(contentToAnalyze);

        if (interviewData) {
          try {
            const cal = await addToCalendar(auth, interviewData);
            
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
            console.error(`❌ Calendar Error:`, calErr.message);
          }
        }
      }
    }

    // 4. ✅ Update the User's lastSync timestamp after a successful run
    await userRef.set({ 
      lastSync: admin.firestore.FieldValue.serverTimestamp() 
    }, { merge: true });

    console.log(`✅ Scanning completed: Processed ${results.length} entries.`);
    res.status(200).json({ message: `Processed ${results.length} updates`, results });

  } catch (err) {
    console.error("🚨 Controller Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { processUserEmails }; 