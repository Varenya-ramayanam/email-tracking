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
    // 1. Get the specific user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    let gmailQuery = '(shortlisted OR interview OR "congratulations") -label:trash -label:spam';
    
    // 2. Timezone-Agnostic Sync Logic
    if (userDoc.exists && userDoc.data().lastSync) {
      const lastSync = userDoc.data().lastSync;
      
      /**
       * FIX: Timezone & Drift Buffer
       * We subtract 6 hours (21600 seconds) from the stored UTC timestamp.
       * This covers the 5.30h IST offset and provides a 30m safety window 
       * to catch emails indexed late by Google.
       */
      const unixSeconds = Math.floor(lastSync.toDate().getTime() / 1000) - 21600;
      gmailQuery += ` after:${unixSeconds}`;
    } else {
      // First time user: Scan last 30 days
      gmailQuery += ` newer_than:30d`;
    }

    console.log(`🔎 Running Sync for ${userId} | Query: ${gmailQuery}`);

    // 3. Fetch messages from Gmail
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: 15
    });

    const messages = response.data.messages || [];
    const results = [];

    // Update timestamp immediately to mark this attempt
    const currentSyncTimestamp = admin.firestore.FieldValue.serverTimestamp();

    if (messages.length === 0) {
      console.log(`ℹ️ No new emails found for user ${userId}`);
      await userRef.set({ lastSync: currentSyncTimestamp }, { merge: true });
      return res.status(200).json({ message: "No new updates found", results: [] });
    }

    // 4. Processing Loop
    for (const msg of messages) {
      try {
        const email = await gmail.users.messages.get({ userId: 'me', id: msg.id });
        
        // Extract email body safely
        let body = "";
        const payload = email.data.payload;
        if (payload.parts) {
          body = Buffer.from(payload.parts[0].body.data || "", 'base64').toString();
        } else if (payload.body && payload.body.data) {
          body = Buffer.from(payload.body.data, 'base64').toString();
        }

        const snippet = email.data.snippet;
        const contentToAnalyze = body.length > 10 ? body : snippet;

        // Preliminary check to save AI tokens
        if (contentToAnalyze.toLowerCase().includes("interview") || 
            contentToAnalyze.toLowerCase().includes("shortlisted")) {
          
          const interviewData = await analyzeInterviewDetails(contentToAnalyze);

          if (interviewData) {
            // Add to Calendar
            const cal = await addToCalendar(auth, interviewData);
            
            // Log application to Firestore
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
          }
        }
      } catch (innerErr) {
        console.error(`⚠️ Error processing email ${msg.id}:`, innerErr.message);
      }
    }

    // 5. Finalize: Update lastSync
    await userRef.set({ lastSync: currentSyncTimestamp }, { merge: true });

    console.log(`✅ Sync Complete for ${userId}: Found ${results.length} items.`);
    res.status(200).json({ 
      success: true,
      message: `Processed ${results.length} updates`, 
      results 
    });

  } catch (err) {
    console.error("🚨 Cloud Production Error:", err.message);
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: err.message 
    });
  }
};

module.exports = { processUserEmails };