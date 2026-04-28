// server.js
// CrisisSync Express backend
// DEMO_MODE uses in-memory storage — no Firebase required
// Set DEMO_MODE = false and configure Firebase for production

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "frontend")));
app.get('/', (req, res) => res.redirect('/dashboard.html'));

// ─── Configuration ──────────────────────────────────────────────────────────

const DEMO_MODE = process.env.DEMO_MODE !== 'false'; // default true; set DEMO_MODE=false for production
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) console.warn('[WARNING] GEMINI_API_KEY not set — AI features will return fallbacks.');
const GEMINI_MODEL = "gemini-2.0-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const PORT = process.env.PORT || 3000;

// ─── Responders ─────────────────────────────────────────────────────────────

const RESPONDERS = [
  { id: "R01", name: "Arjun Sharma", role: "Security", skills: ["SECURITY", "ASSAULT", "EVACUATION"] },
  { id: "R02", name: "Priya Nair", role: "Medical", skills: ["MEDICAL"] },
  { id: "R03", name: "Ramesh Gupta", role: "Fire Safety", skills: ["FIRE", "EVACUATION"] },
  { id: "R04", name: "Sneha Verma", role: "General Staff", skills: ["OTHER", "EVACUATION"] },
  { id: "R05", name: "Vikram Joshi", role: "Security", skills: ["SECURITY", "ASSAULT"] }
];

// ─── In-Memory Store (DEMO_MODE) ────────────────────────────────────────────

const incidents = new Map();

// Pre-seed with mock incidents matching dashboard.html
const MOCK_INCIDENTS = [
  {
    incidentId: "CS-A1B2C", type: "FIRE", location: "ROOM", locationDetail: "302",
    floor: "3", silent: false, photoCount: 0, photoURLs: [],
    description: "Smoke detected near room 302", device: "QR-SOS",
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
    status: "ACTIVE", severity: "HIGH", assignedResponder: null,
    events: [{ type: "REPORTED", time: new Date(Date.now() - 5 * 60000).toISOString(), actor: "Guest" }],
    dispatch: {}
  },
  {
    incidentId: "CS-XYZ789", type: "MEDICAL", location: "POOL", locationDetail: null,
    floor: "G", silent: false, photoCount: 0, photoURLs: [],
    description: "Guest collapsed near pool area", device: "QR-SOS",
    timestamp: new Date(Date.now() - 12 * 60000).toISOString(),
    status: "ACKNOWLEDGED", severity: "MEDIUM",
    assignedResponder: { id: "R02", name: "Priya Nair", role: "Medical" },
    events: [
      { type: "REPORTED", time: new Date(Date.now() - 12 * 60000).toISOString(), actor: "Staff" },
      { type: "ACKNOWLEDGED", time: new Date(Date.now() - 10 * 60000).toISOString(), actor: "Manager" }
    ],
    dispatch: { ambulance: { notified: true, time: new Date(Date.now() - 10 * 60000).toISOString() } }
  },
  {
    incidentId: "CS-RES001", type: "SECURITY", location: "PARKING", locationDetail: null,
    floor: "B1", silent: true, photoCount: 0, photoURLs: [],
    description: "Suspicious individual in parking", device: "WEB-SOS",
    timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
    status: "RESOLVED", severity: "LOW",
    assignedResponder: { id: "R01", name: "Arjun Sharma", role: "Security" },
    events: [
      { type: "REPORTED", time: new Date(Date.now() - 60 * 60000).toISOString(), actor: "Staff" },
      { type: "RESOLVED", time: new Date(Date.now() - 45 * 60000).toISOString(), actor: "Arjun Sharma" }
    ],
    dispatch: {}
  },
  {
    incidentId: "CS-RES002", type: "ASSAULT", location: "BAR", locationDetail: null,
    floor: "1", silent: false, photoCount: 0, photoURLs: [],
    description: "Altercation reported at bar", device: "QR-SOS",
    timestamp: new Date(Date.now() - 90 * 60000).toISOString(),
    status: "RESOLVED", severity: "HIGH",
    assignedResponder: { id: "R05", name: "Vikram Joshi", role: "Security" },
    events: [
      { type: "REPORTED", time: new Date(Date.now() - 90 * 60000).toISOString(), actor: "Guest" },
      { type: "RESOLVED", time: new Date(Date.now() - 60 * 60000).toISOString(), actor: "Vikram Joshi" }
    ],
    dispatch: { police: { notified: true, time: new Date(Date.now() - 85 * 60000).toISOString() } }
  }
];

// Seed in-memory store
MOCK_INCIDENTS.forEach(inc => incidents.set(inc.incidentId, inc));

// ─── Firebase (production only) ─────────────────────────────────────────────

let db = null;

if (!DEMO_MODE) {
  try {
    const admin = require("firebase-admin");
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL: process.env.FIREBASE_DB_URL || "https://your-project-id-default-rtdb.firebaseio.com"
    });
    db = admin.database();
    console.log("[Firebase] Connected");
  } catch (err) {
    console.warn("[Firebase] Init failed, falling back to DEMO_MODE:", err.message);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "CS-";
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// Classify severity based on incident type
function classifySeverity(type) {
  const highTypes = ["FIRE", "ASSAULT", "EVACUATION"];
  const medTypes = ["MEDICAL", "SECURITY"];
  if (highTypes.includes(type)) return "HIGH";
  if (medTypes.includes(type)) return "MEDIUM";
  return "LOW";
}

// Call Gemini API
async function callGemini(prompt, systemPrompt = "") {
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  if (!data.candidates || !data.candidates[0]) {
    throw new Error("No candidates in Gemini response");
  }
  return data.candidates[0].content.parts[0].text;
}

// ─── POST /api/alert ────────────────────────────────────────────────────────
// Receives alert from SOS page
// SOS sends: { incidentId, type, location, locationDetail, floor, silent,
//              photoCount, description, device, timestamp }

app.post("/api/alert", async (req, res) => {
  try {
    const {
      incidentId, type, location, locationDetail, floor,
      silent, photoCount, description, device, timestamp
    } = req.body;

    if (!floor) {
      return res.status(400).json({ error: "Floor is required" });
    }

    const id = incidentId || generateId();
    const severity = classifySeverity(type || "OTHER");

    const incident = {
      incidentId: id,
      type: type || "OTHER",
      location: location || "UNKNOWN",
      locationDetail: locationDetail || null,
      floor: floor,
      silent: silent || false,
      photoCount: photoCount || 0,
      photoURLs: [],
      description: description || "Emergency reported",
      device: device || "WEB-SOS",
      timestamp: timestamp || new Date().toISOString(),
      status: "ACTIVE",
      severity: severity,
      assignedResponder: null,
      events: [
        { type: "REPORTED", time: timestamp || new Date().toISOString(), actor: "System" }
      ],
      dispatch: {}
    };

    if (DEMO_MODE || !db) {
      incidents.set(id, incident);
      console.log(`[DEMO] Alert stored: ${id} (${type} on floor ${floor})`);
    } else {
      // Firebase: store with flat fields matching frontend expectations
      await db.ref(`crisisync/incidents/${id}`).set(incident);
      console.log(`[Firebase] Alert stored: ${id}`);
    }

    res.json({
      success: true,
      incidentId: id,
      type: incident.type,
      severity: incident.severity
    });

  } catch (err) {
    console.error("Alert error:", err);
    // Never show backend errors on SOS page — always return success to guest
    res.json({ success: true, incidentId: `CS-${Date.now()}` });
  }
});

// ─── GET /api/incidents ─────────────────────────────────────────────────────
// Returns all incidents, optionally filtered by ?status=ACTIVE

app.get("/api/incidents", async (req, res) => {
  try {
    const statusFilter = req.query.status;

    if (DEMO_MODE || !db) {
      let result = Array.from(incidents.values());
      if (statusFilter) {
        result = result.filter(i => i.status === statusFilter.toUpperCase());
      }
      return res.json(result);
    }

    // Firebase
    const snap = await db.ref("crisisync/incidents").once("value");
    const data = snap.val() || {};
    let result = Object.values(data);
    if (statusFilter) {
      result = result.filter(i => i.status === statusFilter.toUpperCase());
    }
    res.json(result);

  } catch (err) {
    console.error("Incidents fetch error:", err);
    res.status(500).json({ error: "Failed to fetch incidents" });
  }
});

// ─── GET /api/incidents/:id ─────────────────────────────────────────────────

app.get("/api/incidents/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (DEMO_MODE || !db) {
      const inc = incidents.get(id);
      if (!inc) return res.status(404).json({ error: "Incident not found" });
      return res.json(inc);
    }

    const snap = await db.ref(`crisisync/incidents/${id}`).once("value");
    if (!snap.exists()) return res.status(404).json({ error: "Incident not found" });
    res.json(snap.val());

  } catch (err) {
    console.error("Incident fetch error:", err);
    res.status(500).json({ error: "Failed to fetch incident" });
  }
});

// ─── PATCH /api/incidents/:id/status ────────────────────────────────────────

app.patch("/api/incidents/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actor, note } = req.body;

    if (!status) return res.status(400).json({ error: "Status is required" });

    const event = {
      type: status,
      time: new Date().toISOString(),
      actor: actor || "Command Centre"
    };
    if (note) event.note = note;

    if (DEMO_MODE || !db) {
      const inc = incidents.get(id);
      if (!inc) return res.status(404).json({ error: "Incident not found" });
      inc.status = status;
      inc.events.push(event);
      return res.json({ success: true, incident: inc });
    }

    // Firebase
    await db.ref(`crisisync/incidents/${id}`).update({ status });
    await db.ref(`crisisync/incidents/${id}/auditLog/log_${Date.now()}`).set({
      timestamp: event.time,
      actor: event.actor,
      action: `STATUS_CHANGED_TO_${status}`,
      detail: note || `Incident marked ${status}`
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// ─── POST /api/ai/assign ───────────────────────────────────────────────────
// Proxies Gemini for AI responder assignment, with rule-based fallback

function ruleBasedAssign(incidentType) {
  // Fallback: match responder skills to incident type
  const match = RESPONDERS.find(r => r.skills.includes(incidentType));
  const fallback = match || RESPONDERS[0];
  return {
    id: fallback.id,
    name: fallback.name,
    reasoning: `Rule-based: ${fallback.role} matched for ${incidentType} (AI unavailable)`
  };
}

app.post("/api/ai/assign", async (req, res) => {
  try {
    const { incident } = req.body;
    if (!incident) return res.status(400).json({ error: "Incident data required" });

    const prompt = `You are an AI assisting a hotel command centre. Analyze the incident and pick the BEST responder.
Incident: Type=${incident.type}, Severity=${incident.severity}, Floor=${incident.floor}, Location=${incident.location}, Desc="${incident.description}"
Available Responders: ${JSON.stringify(RESPONDERS)}
Return ONLY valid JSON exactly like this: {"id":"R01", "name":"Name", "reasoning":"short 1 line reason"}`;

    let result;
    try {
      const text = await callGemini(prompt);
      // Robust JSON extraction: strip markdown fences, find JSON object
      const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in Gemini response");
      result = JSON.parse(jsonMatch[0]);
      // Validate required fields
      if (!result.id || !result.name) throw new Error("Missing id or name in response");
    } catch (parseErr) {
      console.warn("AI JSON parse failed, using rule-based fallback:", parseErr.message);
      result = ruleBasedAssign(incident.type);
    }

    // Apply assignment in demo mode
    if (DEMO_MODE || !db) {
      const inc = incidents.get(incident.incidentId);
      if (inc) {
        const resp = RESPONDERS.find(r => r.id === result.id);
        if (resp) {
          inc.assignedResponder = { ...resp, status: "On Route" };
          inc.events.push({
            type: "ASSIGNED", time: new Date().toISOString(),
            actor: "AI System", note: `Assigned to ${resp.name}`
          });
        }
      }
    }

    res.json({ success: true, assignment: result });

  } catch (err) {
    console.error("AI assign error:", err);
    // Ultimate fallback — always return a valid assignment
    const fallback = ruleBasedAssign(req.body.incident?.type || "OTHER");
    res.json({ success: true, assignment: fallback });
  }
});

// ─── POST /api/ai/report ───────────────────────────────────────────────────
// Proxies Gemini for incident report generation

app.post("/api/ai/report", async (req, res) => {
  try {
    const { incident } = req.body;
    if (!incident) return res.status(400).json({ error: "Incident data required" });

    const prompt = `Generate a structured incident report as plain text for the following incident.
Incident Details: ${JSON.stringify(incident)}
Sections required: Executive Summary, Incident Details, Timeline, Response Actions, Dispatch Log, Recommendations.
Return ONLY the plain text report. Do not use markdown syntax.`;

    const text = await callGemini(prompt);
    res.json({ success: true, report: text });

  } catch (err) {
    console.error("AI report error:", err);
    res.status(500).json({ error: "Report generation failed: " + err.message });
  }
});

// ─── POST /api/ai/chat ─────────────────────────────────────────────────────
// Proxies Gemini for responder AI assistant

app.post("/api/ai/chat", async (req, res) => {
  try {
    const { incident, message, mode } = req.body;

    const systemPrompt = "You are an emergency response assistant for a hotel crisis. Be extremely concise, direct, and actionable. Never give long paragraphs. Use short numbered steps. Responder's safety is top priority.";

    let prompt;
    if (mode === "brief") {
      prompt = `Incident: ${JSON.stringify(incident)}. Provide a 2 line situation summary. Then top 3 immediate actions. Mention specific warnings if applicable.`;
    } else {
      prompt = `Incident context: ${JSON.stringify(incident)}. Responder asks: "${message}". Answer concisely.`;
    }

    const text = await callGemini(prompt, systemPrompt);
    res.json({ success: true, response: text });

  } catch (err) {
    console.error("AI chat error:", err);
    res.status(500).json({ error: "AI unavailable — please retry" });
  }
});

// ─── POST /api/ai/navigate ──────────────────────────────────────────────────
// Proxies Gemini for floorplan navigation instructions

app.post("/api/ai/navigate", async (req, res) => {
  try {
    const { mode, type, room, floor } = req.body;
    if (!mode || !room || !floor) {
      return res.status(400).json({ error: "mode, room, and floor are required" });
    }

    const prompt = `You are a crisis navigation AI for a hotel.
Task: Generate step-by-step navigation instructions.
Mode: ${mode}
Incident Type: ${type || "GENERAL"}
Target Area/Room: ${room}
Floor: ${floor}

Context:
- Evacuate mode means guiding a person from the room to the nearest emergency stairs/exit.
- Respond mode means guiding a responder from the main elevators/stairs to the target room.
- Keep instructions extremely concise, actionable, and professional. Max 4 steps.

Return ONLY a valid JSON array of strings. Example: ["Exit room 302.", "Turn left in the corridor.", "Proceed to West Staircase.", "Descend to Ground Floor."]`;

    let steps;
    try {
      const text = await callGemini(prompt);
      const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!arrMatch) throw new Error("No JSON array found");
      steps = JSON.parse(arrMatch[0]);
    } catch (parseErr) {
      console.warn("Navigate AI parse failed, using fallback:", parseErr.message);
      // Static fallback steps
      if (mode === "evacuate") {
        steps = [
          `Exit ${room} immediately.`,
          `Proceed to the nearest staircase.`,
          `Descend to Ground Floor.`,
          `Exit through the nearest emergency exit.`
        ];
      } else {
        steps = [
          `Take the main elevator to Floor ${floor}.`,
          `Exit elevator and check corridor signage.`,
          `Proceed to ${room}.`,
          `Assess situation before entering.`
        ];
      }
    }

    res.json({ success: true, steps });

  } catch (err) {
    console.error("AI navigate error:", err);
    res.status(500).json({ error: "Navigation AI failed" });
  }
});
// ─── POST /api/ai/crowd ────────────────────────────────────────────────────
// Proxies Gemini for crowd management suggestions

app.post("/api/ai/crowd", async (req, res) => {
  try {
    const { zone } = req.body;
    if (!zone) return res.status(400).json({ error: "Zone data required" });

    const prompt = `You are a hotel safety officer. Zone: ${zone.label}, Floor: ${zone.floor}, Density: ${zone.density} people, Trend: ${zone.trend}. Give one short actionable instruction in under 15 words.`;

    const text = await callGemini(prompt);
    res.json({ success: true, suggestion: text.trim() });

  } catch (err) {
    console.error("AI crowd error:", err);
    // Return fallback suggestion
    const fallbacks = {
      LOBBY: "Direct guests to side entrances and deploy 2 staff immediately.",
      RESTAURANT: "Pause new seating and open terrace overflow area.",
      BAR: "Limit entry and activate one-in-one-out policy.",
      DEFAULT: "Reduce entry to zone and alert nearby staff."
    };
    const suggestion = fallbacks[req.body.zone?.location] || fallbacks.DEFAULT;
    res.json({ success: true, suggestion, fallback: true });
  }
});

// ─── GET /api/crowdsense/zones ──────────────────────────────────────────────
// Returns current crowd zone data
// In DEMO_MODE this returns simulated data; in production it would read from
// Firebase where IoT sensors write

const CROWD_ZONES = [
  { zoneId: "Z-LOBBY", label: "Lobby", floor: "G", location: "LOBBY" },
  { zoneId: "Z-REST", label: "Restaurant", floor: "G", location: "RESTAURANT" },
  { zoneId: "Z-BAR", label: "Bar / Lounge", floor: "G", location: "BAR" },
  { zoneId: "Z-POOL", label: "Pool / Spa", floor: "1", location: "POOL" },
  { zoneId: "Z-GYM", label: "Gym", floor: "1", location: "GYM" },
  { zoneId: "Z-CLUB", label: "Clubhouse", floor: "1", location: "CLUBHOUSE" },
  { zoneId: "Z-PARK", label: "Parking", floor: "B1", location: "PARKING" },
  { zoneId: "Z-GARD", label: "Garden", floor: "G", location: "GARDEN" },
  { zoneId: "Z-CORR3", label: "Corridor FL3", floor: "3", location: "CORRIDOR" },
  { zoneId: "Z-CORR7", label: "Corridor FL7", floor: "7", location: "CORRIDOR" }
];

app.get("/api/crowdsense/zones", async (req, res) => {
  try {
    if (DEMO_MODE || !db) {
      // Generate simulated sensor data
      const zones = CROWD_ZONES.map(z => ({
        ...z,
        density: Math.floor(Math.random() * 71) + 10,
        temperature: Math.floor(Math.random() * 14) + 25,
        riskLevel: "LOW",
        trend: "STABLE",
        lastUpdated: new Date().toISOString()
      }));

      // Calculate risk levels
      zones.forEach(z => {
        if (z.density > 50 || z.temperature > 35) z.riskLevel = "HIGH";
        else if (z.density > 30) z.riskLevel = "MEDIUM";
      });

      return res.json(zones);
    }

    // Firebase: read from sensor data path
    const snap = await db.ref("crisisync/crowdsense/zones").once("value");
    res.json(snap.val() || []);

  } catch (err) {
    console.error("Crowdsense error:", err);
    res.status(500).json({ error: "Failed to fetch zone data" });
  }
});

// ─── GET /api/responders ────────────────────────────────────────────────────

app.get("/api/responders", (req, res) => {
  res.json(RESPONDERS);
});

// ─── Health Check ───────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    mode: DEMO_MODE ? "demo" : "production",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ─── Start Server ───────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║       CrisisSync Server — Port ${PORT}             ║
  ║       Mode: ${DEMO_MODE ? "DEMO (in-memory)" : "PRODUCTION (Firebase)"}          ║
  ╚══════════════════════════════════════════════════╝
    `);
    console.log("Endpoints:");
    console.log("  POST /api/alert              — Receive SOS alerts");
    console.log("  GET  /api/incidents           — List incidents");
    console.log("  GET  /api/incidents/:id        — Get single incident");
    console.log("  PATCH /api/incidents/:id/status — Update status");
    console.log("  POST /api/ai/assign           — AI responder assignment");
    console.log("  POST /api/ai/report           — AI report generation");
    console.log("  POST /api/ai/chat             — AI responder assistant");
    console.log("  POST /api/ai/crowd            — AI crowd suggestions");
    console.log("  GET  /api/crowdsense/zones     — Crowd zone data");
    console.log("  GET  /api/responders           — List responders");
    console.log("  GET  /api/health               — Health check");
    console.log("");
  });
}

module.exports = app;
