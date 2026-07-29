// ============================================================
// Curated list of major cities for the manual "set your location" fallback
// (used when the browser Geolocation API is denied/unsupported). Public
// geographic facts (city centroids) — not user data.
// ============================================================

export interface City {
  name: string;
  country: string;
  lat: number;
  lng: number;
}

export const CITIES: City[] = [
  // Germany — the user's primary market
  { name: "Berlin", country: "Germany", lat: 52.5200, lng: 13.4050 },
  { name: "Munich", country: "Germany", lat: 48.1351, lng: 11.5820 },
  { name: "Stuttgart", country: "Germany", lat: 48.7758, lng: 9.1829 },
  { name: "Hamburg", country: "Germany", lat: 53.5511, lng: 9.9937 },
  { name: "Frankfurt", country: "Germany", lat: 50.1109, lng: 8.6821 },
  { name: "Cologne", country: "Germany", lat: 50.9375, lng: 6.9603 },

  // Rest of Europe
  { name: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { name: "London", country: "UK", lat: 51.5074, lng: -0.1278 },
  { name: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038 },
  { name: "Barcelona", country: "Spain", lat: 41.3851, lng: 2.1734 },
  { name: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964 },
  { name: "Milan", country: "Italy", lat: 45.4642, lng: 9.1900 },
  { name: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041 },
  { name: "Brussels", country: "Belgium", lat: 50.8503, lng: 4.3517 },
  { name: "Vienna", country: "Austria", lat: 48.2082, lng: 16.3738 },
  { name: "Zurich", country: "Switzerland", lat: 47.3769, lng: 8.5417 },
  { name: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393 },
  { name: "Dublin", country: "Ireland", lat: 53.3498, lng: -6.2603 },
  { name: "Warsaw", country: "Poland", lat: 52.2297, lng: 21.0122 },
  { name: "Prague", country: "Czech Republic", lat: 50.0755, lng: 14.4378 },
  { name: "Copenhagen", country: "Denmark", lat: 55.6761, lng: 12.5683 },
  { name: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686 },

  // Rest of the world (major tour hubs)
  { name: "New York", country: "USA", lat: 40.7128, lng: -74.0060 },
  { name: "Miami", country: "USA", lat: 25.7617, lng: -80.1918 },
  { name: "Los Angeles", country: "USA", lat: 34.0522, lng: -118.2437 },
  { name: "Toronto", country: "Canada", lat: 43.6532, lng: -79.3832 },
  { name: "Melbourne", country: "Australia", lat: -37.8136, lng: 144.9631 },
  { name: "Dubai", country: "UAE", lat: 25.2048, lng: 55.2708 },
  { name: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198 },
  { name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503 },
  { name: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816 },
];
