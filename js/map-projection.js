import { MAP_CONFIG, GREEN_RING_PARKS } from './config.js';

/**
 * Calculate great-circle distance between two GPS coordinates using Haversine formula (meters)
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Shortest angular difference from a1 to a2 in degrees (-180 to +180)
 */
export function shortestAngleDiffDeg(a1, a2) {
  return ((((a2 - a1) % 360) + 540) % 360) - 180;
}

/**
 * Convert angle in degrees to pixel coordinates on the 1513x1116 map.png
 */
export function angleToPixels(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const x = MAP_CONFIG.circleCenter.x + MAP_CONFIG.circleRadius * Math.cos(rad);
  const y = MAP_CONFIG.circleCenter.y + MAP_CONFIG.circleRadius * Math.sin(rad);

  return {
    x,
    y,
    // Percentage relative to original map dimensions (for responsive CSS positioning)
    pctX: (x / MAP_CONFIG.imageWidth) * 100,
    pctY: (y / MAP_CONFIG.imageHeight) * 100,
    angleDeg
  };
}

/**
 * Project a GPS point (lat, lon) onto the segment between two waypoints
 * Returns { t: fraction in [0, 1], distMeters }
 */
function projectOntoSegment(lat, lon, p1, p2) {
  // Approximate flat-earth projection for local segment
  const cosLat = Math.cos(((p1.lat + p2.lat) / 2) * (Math.PI / 180));
  const degToM = 111320; // meters per degree latitude

  const ax = 0;
  const ay = 0;
  const bx = (p2.lon - p1.lon) * cosLat * degToM;
  const by = (p2.lat - p1.lat) * degToM;
  const px = (lon - p1.lon) * cosLat * degToM;
  const py = (lat - p1.lat) * degToM;

  const segLenSq = bx * bx + by * by;
  if (segLenSq === 0) {
    const d = Math.hypot(px, py);
    return { t: 0, distMeters: d };
  }

  // Projection scalar t
  let t = (px * bx + py * by) / segLenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * bx;
  const projY = ay + t * by;
  const distMeters = Math.hypot(px - projX, py - projY);

  return { t, distMeters };
}

/**
 * Map real GPS coordinates (lat, lon) onto the Moscow Green Ring circle
 */
export function projectGpsToRing(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    // Default to first park (Ботанический сад)
    const def = GREEN_RING_PARKS[0];
    return {
      ...angleToPixels(def.angleDeg),
      currentPark: def.name,
      nextPark: GREEN_RING_PARKS[1].name,
      progressPercent: 0,
      distanceToRouteMeters: 0,
      isValid: false
    };
  }

  const numParks = GREEN_RING_PARKS.length;
  let bestDist = Infinity;
  let bestSegmentIdx = 0;
  let bestT = 0;

  for (let i = 0; i < numParks; i++) {
    const pCurr = GREEN_RING_PARKS[i];
    const pNext = GREEN_RING_PARKS[(i + 1) % numParks];

    const { t, distMeters } = projectOntoSegment(lat, lon, pCurr, pNext);
    if (distMeters < bestDist) {
      bestDist = distMeters;
      bestSegmentIdx = i;
      bestT = t;
    }
  }

  const pCurr = GREEN_RING_PARKS[bestSegmentIdx];
  const pNext = GREEN_RING_PARKS[(bestSegmentIdx + 1) % numParks];

  // Interpolate angle along circle with wrap-around
  const diffDeg = shortestAngleDiffDeg(pCurr.angleDeg, pNext.angleDeg);
  let interpolatedAngle = pCurr.angleDeg + bestT * diffDeg;
  if (interpolatedAngle > 180) interpolatedAngle -= 360;
  if (interpolatedAngle <= -180) interpolatedAngle += 360;

  // Calculate km progress along the 160km route
  const kmFrom = pCurr.kmMark;
  const kmTo = pNext.kmMark > kmFrom ? pNext.kmMark : MAP_CONFIG.totalRouteLengthKm;
  const currentKm = kmFrom + bestT * (kmTo - kmFrom);
  const progressPercent = Math.min(100, Math.max(0, (currentKm / MAP_CONFIG.totalRouteLengthKm) * 100));

  // Determine closest park name
  const parkName = bestT < 0.5 ? pCurr.name : pNext.name;
  const nextParkName = pNext.name;

  const pixelCoords = angleToPixels(interpolatedAngle);

  return {
    ...pixelCoords,
    currentPark: parkName,
    nextPark: nextParkName,
    progressKm: currentKm.toFixed(1),
    progressPercent: Math.round(progressPercent),
    distanceToRouteMeters: Math.round(bestDist),
    isValid: true
  };
}

/**
 * Fallback projection using Kremlin center azimuth (useful if far outside route)
 */
export function azimuthProjectGps(lat, lon) {
  const moscowCenter = MAP_CONFIG.moscowCenterGPS;
  const cosLat = Math.cos((moscowCenter.lat * Math.PI) / 180);
  const dx = (lon - moscowCenter.lon) * cosLat;
  const dy = lat - moscowCenter.lat;

  // Bearing from North clockwise: atan2(dx, dy)
  const bearingRad = Math.atan2(dx, dy); // 0=N, pi/2=E, pi=S, -pi/2=W
  // In our map: Top (North) is -90 deg (-pi/2), East is 0 deg, South is 90 deg (pi/2)
  let angleDeg = (bearingRad * 180) / Math.PI - 90;
  if (angleDeg > 180) angleDeg -= 360;
  if (angleDeg <= -180) angleDeg += 360;

  return angleToPixels(angleDeg);
}
