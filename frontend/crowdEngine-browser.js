(function () {
  // Gemini suggestions are proxied through the server — no API key in browser

  const CROWD_ZONES = [
    { zoneId: 'Z-LOBBY', label: 'Lobby', floor: 'G', location: 'LOBBY' },
    { zoneId: 'Z-REST', label: 'Restaurant', floor: 'G', location: 'RESTAURANT' },
    { zoneId: 'Z-BAR', label: 'Bar / Lounge', floor: 'G', location: 'BAR' },
    { zoneId: 'Z-POOL', label: 'Pool / Spa', floor: '1', location: 'POOL' },
    { zoneId: 'Z-GYM', label: 'Gym', floor: '1', location: 'GYM' },
    { zoneId: 'Z-CLUB', label: 'Clubhouse', floor: '1', location: 'CLUBHOUSE' },
    { zoneId: 'Z-PARK', label: 'Parking', floor: 'B1', location: 'PARKING' },
    { zoneId: 'Z-GARD', label: 'Garden', floor: 'G', location: 'GARDEN' },
    { zoneId: 'Z-CORR3', label: 'Corridor FL3', floor: '3', location: 'CORRIDOR' },
    { zoneId: 'Z-CORR7', label: 'Corridor FL7', floor: '7', location: 'CORRIDOR' },
  ];

  const FALLBACKS = {
    LOBBY: "Direct guests to side entrances and deploy 2 staff immediately.",
    RESTAURANT: "Pause new seating and open terrace overflow area.",
    BAR: "Limit entry and activate one-in-one-out policy.",
    POOL: "Clear pool area and redirect to garden.",
    GYM: "Restrict gym entry temporarily.",
    PARKING: "Open secondary exit and guide traffic manually.",
    CORRIDOR: "Deploy staff to manage flow and open staircase exits.",
    DEFAULT: "Reduce entry to zone and alert nearby staff."
  };

  let updateCallbacks = [];
  let engineInterval = null;

  let zoneData = CROWD_ZONES.map(zone => ({
    ...zone,
    density: 0,
    temperature: 25,
    previousDensity: 0,
    riskLevel: 'LOW',
    trend: 'STABLE',
    suggestion: '',
    lastUpdated: new Date().toISOString()
  }));

  function calculateRisk(density, temperature) {
    if (density > 50 || temperature > 35) return 'HIGH';
    if (density > 30) return 'MEDIUM';
    return 'LOW';
  }

  function calculateTrend(current, previous) {
    if (current > previous + 5) return 'INCREASING';
    if (current < previous - 5) return 'DECREASING';
    return 'STABLE';
  }

  function triggerCallbacks() {
    updateCallbacks.forEach(cb => {
      try {
        cb(zoneData);
      } catch (e) {
        console.error('Error in onUpdate callback:', e);
      }
    });
  }

  async function fetchSuggestion(zone) {
    try {
      const res = await fetch('/api/ai/crowd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone })
      });
      const data = await res.json();
      if (data.success && data.suggestion) return data.suggestion;
      throw new Error('No suggestion returned');
    } catch (error) {
      console.warn(`[CrowdEngine-Browser] /api/ai/crowd failed for ${zone.label}, using fallback:`, error);
      return FALLBACKS[zone.location] || FALLBACKS.DEFAULT;
    }
  }

  async function processZone(zone) {
    zone.previousDensity = zone.density;

    // Simulate new data
    zone.density = Math.floor(Math.random() * 71) + 10;
    zone.temperature = Math.floor(Math.random() * 14) + 25;

    const newRiskLevel = calculateRisk(zone.density, zone.temperature);
    zone.trend = calculateTrend(zone.density, zone.previousDensity);
    zone.lastUpdated = new Date().toISOString();

    // If transitioning to HIGH, get suggestion
    if (newRiskLevel === 'HIGH' && zone.riskLevel !== 'HIGH') {
      zone.riskLevel = newRiskLevel; // Set immediately so subsequent checks don't re-trigger
      zone.suggestion = await fetchSuggestion(zone);
      triggerCallbacks(); // Trigger callbacks again when async suggestion arrives
    } else if (newRiskLevel !== 'HIGH') {
      zone.suggestion = ''; // Clear suggestion if no longer high risk
    }

    zone.riskLevel = newRiskLevel;
  }

  async function updateSensors() {
    // Process all zones concurrently
    await Promise.all(zoneData.map(processZone));
    triggerCallbacks();
  }

  function start() {
    if (engineInterval) return;
    console.log('[CrowdEngine-Browser] Starting sensor simulation every 4 seconds...');
    // Initial run
    updateSensors();
    // Loop
    engineInterval = setInterval(updateSensors, 4000);
  }

  function getZones() {
    return zoneData;
  }

  async function simulateSurge(zoneId) {
    const zone = zoneData.find(z => z.zoneId === zoneId);
    if (!zone) return;

    zone.previousDensity = zone.density;
    zone.density = 75; // Force high density
    zone.temperature = 36; // Force high temperature

    const newRiskLevel = calculateRisk(zone.density, zone.temperature);
    zone.trend = calculateTrend(zone.density, zone.previousDensity);
    zone.lastUpdated = new Date().toISOString();

    if (newRiskLevel === 'HIGH' && zone.riskLevel !== 'HIGH') {
      zone.riskLevel = newRiskLevel;
      zone.suggestion = await fetchSuggestion(zone);
      triggerCallbacks();
    }

    zone.riskLevel = newRiskLevel;
    console.log(`[CrowdEngine-Browser] Simulated surge for ${zone.label}`);
    triggerCallbacks();
  }

  function onUpdate(callback) {
    if (typeof callback === 'function') {
      updateCallbacks.push(callback);
    }
  }

  window.CrowdEngine = {
    start,
    getZones,
    simulateSurge,
    onUpdate
  };
})();
