import type {
  CityReference,
  CountryReference,
  ReferenceDataItem,
  RegionReference,
} from "../services/reference-data";

/* ------------------------------------------------------------------ *
 * Geographic reference data
 * ------------------------------------------------------------------ */

/**
 * Initial geographic catalogue scope:
 * Canada, United States and India.
 *
 * Country codes use ISO 3166-1 alpha-2.
 *
 * Region codes use the standard postal/administrative abbreviations
 * commonly used for the respective country.
 *
 * The catalogue is intentionally maintained as source data here for now.
 * It can later be replaced by an API / DB-backed implementation without
 * changing the ReferenceDataService contract.
 */
export const COUNTRIES: CountryReference[] = [
  {
    id: "country-ca",
    code: "CA",
    name: "Canada",
    countryCode: "CA",
    callingCode: "+1",
    displayOrder: 1,
    active: true,
  },
  {
    id: "country-us",
    code: "US",
    name: "United States",
    countryCode: "US",
    callingCode: "+1",
    displayOrder: 2,
    active: true,
  },
  {
    id: "country-in",
    code: "IN",
    name: "India",
    countryCode: "IN",
    callingCode: "+91",
    displayOrder: 3,
    active: true,
  },
];

/* ------------------------------------------------------------------ *
 * Regions
 * ------------------------------------------------------------------ */

export const REGIONS: RegionReference[] = [
  // Canada
  { id: "region-ca-ab", countryCode: "CA", code: "AB", name: "Alberta" },
  {
    id: "region-ca-bc",
    countryCode: "CA",
    code: "BC",
    name: "British Columbia",
  },
  { id: "region-ca-mb", countryCode: "CA", code: "MB", name: "Manitoba" },
  { id: "region-ca-nb", countryCode: "CA", code: "NB", name: "New Brunswick" },
  {
    id: "region-ca-nl",
    countryCode: "CA",
    code: "NL",
    name: "Newfoundland and Labrador",
  },
  { id: "region-ca-ns", countryCode: "CA", code: "NS", name: "Nova Scotia" },
  {
    id: "region-ca-nt",
    countryCode: "CA",
    code: "NT",
    name: "Northwest Territories",
  },
  { id: "region-ca-nu", countryCode: "CA", code: "NU", name: "Nunavut" },
  { id: "region-ca-on", countryCode: "CA", code: "ON", name: "Ontario" },
  {
    id: "region-ca-pe",
    countryCode: "CA",
    code: "PE",
    name: "Prince Edward Island",
  },
  { id: "region-ca-qc", countryCode: "CA", code: "QC", name: "Quebec" },
  { id: "region-ca-sk", countryCode: "CA", code: "SK", name: "Saskatchewan" },
  { id: "region-ca-yt", countryCode: "CA", code: "YT", name: "Yukon" },

  // United States
  { id: "region-us-al", countryCode: "US", code: "AL", name: "Alabama" },
  { id: "region-us-ak", countryCode: "US", code: "AK", name: "Alaska" },
  { id: "region-us-az", countryCode: "US", code: "AZ", name: "Arizona" },
  { id: "region-us-ar", countryCode: "US", code: "AR", name: "Arkansas" },
  { id: "region-us-ca", countryCode: "US", code: "CA", name: "California" },
  { id: "region-us-co", countryCode: "US", code: "CO", name: "Colorado" },
  { id: "region-us-ct", countryCode: "US", code: "CT", name: "Connecticut" },
  { id: "region-us-de", countryCode: "US", code: "DE", name: "Delaware" },
  {
    id: "region-us-dc",
    countryCode: "US",
    code: "DC",
    name: "District of Columbia",
  },
  { id: "region-us-fl", countryCode: "US", code: "FL", name: "Florida" },
  { id: "region-us-ga", countryCode: "US", code: "GA", name: "Georgia" },
  { id: "region-us-hi", countryCode: "US", code: "HI", name: "Hawaii" },
  { id: "region-us-id", countryCode: "US", code: "ID", name: "Idaho" },
  { id: "region-us-il", countryCode: "US", code: "IL", name: "Illinois" },
  { id: "region-us-in", countryCode: "US", code: "IN", name: "Indiana" },
  { id: "region-us-ia", countryCode: "US", code: "IA", name: "Iowa" },
  { id: "region-us-ks", countryCode: "US", code: "KS", name: "Kansas" },
  { id: "region-us-ky", countryCode: "US", code: "KY", name: "Kentucky" },
  { id: "region-us-la", countryCode: "US", code: "LA", name: "Louisiana" },
  { id: "region-us-me", countryCode: "US", code: "ME", name: "Maine" },
  { id: "region-us-md", countryCode: "US", code: "MD", name: "Maryland" },
  { id: "region-us-ma", countryCode: "US", code: "MA", name: "Massachusetts" },
  { id: "region-us-mi", countryCode: "US", code: "MI", name: "Michigan" },
  { id: "region-us-mn", countryCode: "US", code: "MN", name: "Minnesota" },
  { id: "region-us-ms", countryCode: "US", code: "MS", name: "Mississippi" },
  { id: "region-us-mo", countryCode: "US", code: "MO", name: "Missouri" },
  { id: "region-us-mt", countryCode: "US", code: "MT", name: "Montana" },
  { id: "region-us-ne", countryCode: "US", code: "NE", name: "Nebraska" },
  { id: "region-us-nv", countryCode: "US", code: "NV", name: "Nevada" },
  { id: "region-us-nh", countryCode: "US", code: "NH", name: "New Hampshire" },
  { id: "region-us-nj", countryCode: "US", code: "NJ", name: "New Jersey" },
  { id: "region-us-nm", countryCode: "US", code: "NM", name: "New Mexico" },
  { id: "region-us-ny", countryCode: "US", code: "NY", name: "New York" },
  { id: "region-us-nc", countryCode: "US", code: "NC", name: "North Carolina" },
  { id: "region-us-nd", countryCode: "US", code: "ND", name: "North Dakota" },
  { id: "region-us-oh", countryCode: "US", code: "OH", name: "Ohio" },
  { id: "region-us-ok", countryCode: "US", code: "OK", name: "Oklahoma" },
  { id: "region-us-or", countryCode: "US", code: "OR", name: "Oregon" },
  { id: "region-us-pa", countryCode: "US", code: "PA", name: "Pennsylvania" },
  { id: "region-us-ri", countryCode: "US", code: "RI", name: "Rhode Island" },
  { id: "region-us-sc", countryCode: "US", code: "SC", name: "South Carolina" },
  { id: "region-us-sd", countryCode: "US", code: "SD", name: "South Dakota" },
  { id: "region-us-tn", countryCode: "US", code: "TN", name: "Tennessee" },
  { id: "region-us-tx", countryCode: "US", code: "TX", name: "Texas" },
  { id: "region-us-ut", countryCode: "US", code: "UT", name: "Utah" },
  { id: "region-us-vt", countryCode: "US", code: "VT", name: "Vermont" },
  { id: "region-us-va", countryCode: "US", code: "VA", name: "Virginia" },
  { id: "region-us-wa", countryCode: "US", code: "WA", name: "Washington" },
  { id: "region-us-wv", countryCode: "US", code: "WV", name: "West Virginia" },
  { id: "region-us-wi", countryCode: "US", code: "WI", name: "Wisconsin" },
  { id: "region-us-wy", countryCode: "US", code: "WY", name: "Wyoming" },

  // India
  { id: "region-in-ap", countryCode: "IN", code: "AP", name: "Andhra Pradesh" },
  {
    id: "region-in-ar",
    countryCode: "IN",
    code: "AR",
    name: "Arunachal Pradesh",
  },
  { id: "region-in-as", countryCode: "IN", code: "AS", name: "Assam" },
  { id: "region-in-br", countryCode: "IN", code: "BR", name: "Bihar" },
  { id: "region-in-ct", countryCode: "IN", code: "CT", name: "Chhattisgarh" },
  { id: "region-in-ga", countryCode: "IN", code: "GA", name: "Goa" },
  { id: "region-in-gj", countryCode: "IN", code: "GJ", name: "Gujarat" },
  { id: "region-in-hr", countryCode: "IN", code: "HR", name: "Haryana" },
  {
    id: "region-in-hp",
    countryCode: "IN",
    code: "HP",
    name: "Himachal Pradesh",
  },
  { id: "region-in-jh", countryCode: "IN", code: "JH", name: "Jharkhand" },
  { id: "region-in-ka", countryCode: "IN", code: "KA", name: "Karnataka" },
  { id: "region-in-kl", countryCode: "IN", code: "KL", name: "Kerala" },
  { id: "region-in-mp", countryCode: "IN", code: "MP", name: "Madhya Pradesh" },
  { id: "region-in-mh", countryCode: "IN", code: "MH", name: "Maharashtra" },
  { id: "region-in-mn", countryCode: "IN", code: "MN", name: "Manipur" },
  { id: "region-in-ml", countryCode: "IN", code: "ML", name: "Meghalaya" },
  { id: "region-in-mz", countryCode: "IN", code: "MZ", name: "Mizoram" },
  { id: "region-in-nl", countryCode: "IN", code: "NL", name: "Nagaland" },
  { id: "region-in-od", countryCode: "IN", code: "OD", name: "Odisha" },
  { id: "region-in-pb", countryCode: "IN", code: "PB", name: "Punjab" },
  { id: "region-in-rj", countryCode: "IN", code: "RJ", name: "Rajasthan" },
  { id: "region-in-sk", countryCode: "IN", code: "SK", name: "Sikkim" },
  { id: "region-in-tn", countryCode: "IN", code: "TN", name: "Tamil Nadu" },
  { id: "region-in-ts", countryCode: "IN", code: "TS", name: "Telangana" },
  { id: "region-in-tr", countryCode: "IN", code: "TR", name: "Tripura" },
  { id: "region-in-up", countryCode: "IN", code: "UP", name: "Uttar Pradesh" },
  { id: "region-in-uk", countryCode: "IN", code: "UK", name: "Uttarakhand" },
  { id: "region-in-wb", countryCode: "IN", code: "WB", name: "West Bengal" },
  {
    id: "region-in-an",
    countryCode: "IN",
    code: "AN",
    name: "Andaman and Nicobar Islands",
  },
  { id: "region-in-ch", countryCode: "IN", code: "CH", name: "Chandigarh" },
  {
    id: "region-in-dh",
    countryCode: "IN",
    code: "DH",
    name: "Dadra and Nagar Haveli and Daman and Diu",
  },
  { id: "region-in-dl", countryCode: "IN", code: "DL", name: "Delhi" },
  {
    id: "region-in-jk",
    countryCode: "IN",
    code: "JK",
    name: "Jammu and Kashmir",
  },
  { id: "region-in-la", countryCode: "IN", code: "LA", name: "Ladakh" },
  { id: "region-in-ld", countryCode: "IN", code: "LD", name: "Lakshadweep" },
  { id: "region-in-py", countryCode: "IN", code: "PY", name: "Puducherry" },
];

/* ------------------------------------------------------------------ *
 * Cities
 *
 * Initial operational catalogue.
 *
 * This is intentionally not an attempt to enumerate every municipality
 * in Canada, the United States or India. The catalogue can be expanded
 * later without changing the data model or service contract.
 * ------------------------------------------------------------------ */

export const CITIES: CityReference[] = [
  // ============================================================
  // CANADA
  // ============================================================

  // Alberta (AB)
  {
    id: "city-ca-ab-calgary",
    countryCode: "CA",
    regionCode: "AB",
    name: "Calgary",
  },
  {
    id: "city-ca-ab-edmonton",
    countryCode: "CA",
    regionCode: "AB",
    name: "Edmonton",
  },
  {
    id: "city-ca-ab-red-deer",
    countryCode: "CA",
    regionCode: "AB",
    name: "Red Deer",
  },
  {
    id: "city-ca-ab-lethbridge",
    countryCode: "CA",
    regionCode: "AB",
    name: "Lethbridge",
  },
  {
    id: "city-ca-ab-st-albert",
    countryCode: "CA",
    regionCode: "AB",
    name: "St. Albert",
  },
  {
    id: "city-ca-ab-medicine-hat",
    countryCode: "CA",
    regionCode: "AB",
    name: "Medicine Hat",
  },

  // British Columbia (BC)
  {
    id: "city-ca-bc-vancouver",
    countryCode: "CA",
    regionCode: "BC",
    name: "Vancouver",
  },
  {
    id: "city-ca-bc-surrey",
    countryCode: "CA",
    regionCode: "BC",
    name: "Surrey",
  },
  {
    id: "city-ca-bc-burnaby",
    countryCode: "CA",
    regionCode: "BC",
    name: "Burnaby",
  },
  {
    id: "city-ca-bc-richmond",
    countryCode: "CA",
    regionCode: "BC",
    name: "Richmond",
  },
  {
    id: "city-ca-bc-victoria",
    countryCode: "CA",
    regionCode: "BC",
    name: "Victoria",
  },
  {
    id: "city-ca-bc-kelowna",
    countryCode: "CA",
    regionCode: "BC",
    name: "Kelowna",
  },
  {
    id: "city-ca-bc-abbotsford",
    countryCode: "CA",
    regionCode: "BC",
    name: "Abbotsford",
  },
  {
    id: "city-ca-bc-coquitlam",
    countryCode: "CA",
    regionCode: "BC",
    name: "Coquitlam",
  },
  {
    id: "city-ca-bc-langley",
    countryCode: "CA",
    regionCode: "BC",
    name: "Langley",
  },

  // Manitoba (MB)
  {
    id: "city-ca-mb-winnipeg",
    countryCode: "CA",
    regionCode: "MB",
    name: "Winnipeg",
  },
  {
    id: "city-ca-mb-brandon",
    countryCode: "CA",
    regionCode: "MB",
    name: "Brandon",
  },

  // New Brunswick (NB)
  {
    id: "city-ca-nb-moncton",
    countryCode: "CA",
    regionCode: "NB",
    name: "Moncton",
  },
  {
    id: "city-ca-nb-saint-john",
    countryCode: "CA",
    regionCode: "NB",
    name: "Saint John",
  },
  {
    id: "city-ca-nb-fredericton",
    countryCode: "CA",
    regionCode: "NB",
    name: "Fredericton",
  },

  // Newfoundland and Labrador (NL)
  {
    id: "city-ca-nl-st-johns",
    countryCode: "CA",
    regionCode: "NL",
    name: "St. John's",
  },
  {
    id: "city-ca-nl-corner-brook",
    countryCode: "CA",
    regionCode: "NL",
    name: "Corner Brook",
  },

  // Nova Scotia (NS)
  {
    id: "city-ca-ns-halifax",
    countryCode: "CA",
    regionCode: "NS",
    name: "Halifax",
  },
  {
    id: "city-ca-ns-sydney",
    countryCode: "CA",
    regionCode: "NS",
    name: "Sydney",
  },

  // Ontario (ON)
  {
    id: "city-ca-on-toronto",
    countryCode: "CA",
    regionCode: "ON",
    name: "Toronto",
  },
  {
    id: "city-ca-on-ottawa",
    countryCode: "CA",
    regionCode: "ON",
    name: "Ottawa",
  },
  {
    id: "city-ca-on-mississauga",
    countryCode: "CA",
    regionCode: "ON",
    name: "Mississauga",
  },
  {
    id: "city-ca-on-brampton",
    countryCode: "CA",
    regionCode: "ON",
    name: "Brampton",
  },
  {
    id: "city-ca-on-hamilton",
    countryCode: "CA",
    regionCode: "ON",
    name: "Hamilton",
  },
  {
    id: "city-ca-on-london",
    countryCode: "CA",
    regionCode: "ON",
    name: "London",
  },
  {
    id: "city-ca-on-markham",
    countryCode: "CA",
    regionCode: "ON",
    name: "Markham",
  },
  {
    id: "city-ca-on-vaughan",
    countryCode: "CA",
    regionCode: "ON",
    name: "Vaughan",
  },
  {
    id: "city-ca-on-kitchener",
    countryCode: "CA",
    regionCode: "ON",
    name: "Kitchener",
  },
  {
    id: "city-ca-on-windsor",
    countryCode: "CA",
    regionCode: "ON",
    name: "Windsor",
  },
  {
    id: "city-ca-on-richmond-hill",
    countryCode: "CA",
    regionCode: "ON",
    name: "Richmond Hill",
  },
  {
    id: "city-ca-on-oakville",
    countryCode: "CA",
    regionCode: "ON",
    name: "Oakville",
  },
  {
    id: "city-ca-on-burlington",
    countryCode: "CA",
    regionCode: "ON",
    name: "Burlington",
  },
  {
    id: "city-ca-on-oshawa",
    countryCode: "CA",
    regionCode: "ON",
    name: "Oshawa",
  },
  {
    id: "city-ca-on-barrie",
    countryCode: "CA",
    regionCode: "ON",
    name: "Barrie",
  },
  {
    id: "city-ca-on-guelph",
    countryCode: "CA",
    regionCode: "ON",
    name: "Guelph",
  },
  {
    id: "city-ca-on-kingston",
    countryCode: "CA",
    regionCode: "ON",
    name: "Kingston",
  },
  {
    id: "city-ca-on-waterloo",
    countryCode: "CA",
    regionCode: "ON",
    name: "Waterloo",
  },
  {
    id: "city-ca-on-niagara-falls",
    countryCode: "CA",
    regionCode: "ON",
    name: "Niagara Falls",
  },

  // Prince Edward Island (PE)
  {
    id: "city-ca-pe-charlottetown",
    countryCode: "CA",
    regionCode: "PE",
    name: "Charlottetown",
  },

  // Quebec (QC)
  {
    id: "city-ca-qc-montreal",
    countryCode: "CA",
    regionCode: "QC",
    name: "Montreal",
  },
  {
    id: "city-ca-qc-quebec-city",
    countryCode: "CA",
    regionCode: "QC",
    name: "Quebec City",
  },
  {
    id: "city-ca-qc-laval",
    countryCode: "CA",
    regionCode: "QC",
    name: "Laval",
  },
  {
    id: "city-ca-qc-gatineau",
    countryCode: "CA",
    regionCode: "QC",
    name: "Gatineau",
  },
  {
    id: "city-ca-qc-longueuil",
    countryCode: "CA",
    regionCode: "QC",
    name: "Longueuil",
  },
  {
    id: "city-ca-qc-sherbrooke",
    countryCode: "CA",
    regionCode: "QC",
    name: "Sherbrooke",
  },
  {
    id: "city-ca-qc-saguenay",
    countryCode: "CA",
    regionCode: "QC",
    name: "Saguenay",
  },
  {
    id: "city-ca-qc-levis",
    countryCode: "CA",
    regionCode: "QC",
    name: "Levis",
  },
  {
    id: "city-ca-qc-trois-rivieres",
    countryCode: "CA",
    regionCode: "QC",
    name: "Trois-Rivières",
  },

  // Saskatchewan (SK)
  {
    id: "city-ca-sk-saskatoon",
    countryCode: "CA",
    regionCode: "SK",
    name: "Saskatoon",
  },
  {
    id: "city-ca-sk-regina",
    countryCode: "CA",
    regionCode: "SK",
    name: "Regina",
  },
  {
    id: "city-ca-sk-prince-albert",
    countryCode: "CA",
    regionCode: "SK",
    name: "Prince Albert",
  },

  // Northwest Territories (NT)
  {
    id: "city-ca-nt-yellowknife",
    countryCode: "CA",
    regionCode: "NT",
    name: "Yellowknife",
  },

  // Yukon (YT)
  {
    id: "city-ca-yt-whitehorse",
    countryCode: "CA",
    regionCode: "YT",
    name: "Whitehorse",
  },

  // Nunavut (NU)
  {
    id: "city-ca-nu-iqaluit",
    countryCode: "CA",
    regionCode: "NU",
    name: "Iqaluit",
  },

  // ============================================================
  // UNITED STATES
  // ============================================================

  // Alabama (AL)
  {
    id: "city-us-al-birmingham",
    countryCode: "US",
    regionCode: "AL",
    name: "Birmingham",
  },
  {
    id: "city-us-al-montgomery",
    countryCode: "US",
    regionCode: "AL",
    name: "Montgomery",
  },
  {
    id: "city-us-al-mobile",
    countryCode: "US",
    regionCode: "AL",
    name: "Mobile",
  },
  {
    id: "city-us-al-huntsville",
    countryCode: "US",
    regionCode: "AL",
    name: "Huntsville",
  },

  // Alaska (AK)
  {
    id: "city-us-ak-anchorage",
    countryCode: "US",
    regionCode: "AK",
    name: "Anchorage",
  },
  {
    id: "city-us-ak-fairbanks",
    countryCode: "US",
    regionCode: "AK",
    name: "Fairbanks",
  },
  {
    id: "city-us-ak-juneau",
    countryCode: "US",
    regionCode: "AK",
    name: "Juneau",
  },

  // Arizona (AZ)
  {
    id: "city-us-az-phoenix",
    countryCode: "US",
    regionCode: "AZ",
    name: "Phoenix",
  },
  {
    id: "city-us-az-tucson",
    countryCode: "US",
    regionCode: "AZ",
    name: "Tucson",
  },
  {
    id: "city-us-az-mesa",
    countryCode: "US",
    regionCode: "AZ",
    name: "Mesa",
  },
  {
    id: "city-us-az-scottsdale",
    countryCode: "US",
    regionCode: "AZ",
    name: "Scottsdale",
  },
  {
    id: "city-us-az-chandler",
    countryCode: "US",
    regionCode: "AZ",
    name: "Chandler",
  },

  // Arkansas (AR)
  {
    id: "city-us-ar-little-rock",
    countryCode: "US",
    regionCode: "AR",
    name: "Little Rock",
  },
  {
    id: "city-us-ar-fayetteville",
    countryCode: "US",
    regionCode: "AR",
    name: "Fayetteville",
  },

  // California (CA)
  {
    id: "city-us-ca-los-angeles",
    countryCode: "US",
    regionCode: "CA",
    name: "Los Angeles",
  },
  {
    id: "city-us-ca-san-diego",
    countryCode: "US",
    regionCode: "CA",
    name: "San Diego",
  },
  {
    id: "city-us-ca-san-jose",
    countryCode: "US",
    regionCode: "CA",
    name: "San Jose",
  },
  {
    id: "city-us-ca-san-francisco",
    countryCode: "US",
    regionCode: "CA",
    name: "San Francisco",
  },
  {
    id: "city-us-ca-fresno",
    countryCode: "US",
    regionCode: "CA",
    name: "Fresno",
  },
  {
    id: "city-us-ca-sacramento",
    countryCode: "US",
    regionCode: "CA",
    name: "Sacramento",
  },
  {
    id: "city-us-ca-long-beach",
    countryCode: "US",
    regionCode: "CA",
    name: "Long Beach",
  },
  {
    id: "city-us-ca-oakland",
    countryCode: "US",
    regionCode: "CA",
    name: "Oakland",
  },
  {
    id: "city-us-ca-bakersfield",
    countryCode: "US",
    regionCode: "CA",
    name: "Bakersfield",
  },
  {
    id: "city-us-ca-anaheim",
    countryCode: "US",
    regionCode: "CA",
    name: "Anaheim",
  },
  {
    id: "city-us-ca-santa-ana",
    countryCode: "US",
    regionCode: "CA",
    name: "Santa Ana",
  },
  {
    id: "city-us-ca-riverside",
    countryCode: "US",
    regionCode: "CA",
    name: "Riverside",
  },
  {
    id: "city-us-ca-stockton",
    countryCode: "US",
    regionCode: "CA",
    name: "Stockton",
  },
  {
    id: "city-us-ca-irvine",
    countryCode: "US",
    regionCode: "CA",
    name: "Irvine",
  },
  {
    id: "city-us-ca-santa-clara",
    countryCode: "US",
    regionCode: "CA",
    name: "Santa Clara",
  },

  // Colorado (CO)
  {
    id: "city-us-co-denver",
    countryCode: "US",
    regionCode: "CO",
    name: "Denver",
  },
  {
    id: "city-us-co-colorado-springs",
    countryCode: "US",
    regionCode: "CO",
    name: "Colorado Springs",
  },
  {
    id: "city-us-co-aurora",
    countryCode: "US",
    regionCode: "CO",
    name: "Aurora",
  },
  {
    id: "city-us-co-fort-collins",
    countryCode: "US",
    regionCode: "CO",
    name: "Fort Collins",
  },
  {
    id: "city-us-co-boulder",
    countryCode: "US",
    regionCode: "CO",
    name: "Boulder",
  },

  // Connecticut (CT)
  {
    id: "city-us-ct-bridgeport",
    countryCode: "US",
    regionCode: "CT",
    name: "Bridgeport",
  },
  {
    id: "city-us-ct-new-haven",
    countryCode: "US",
    regionCode: "CT",
    name: "New Haven",
  },
  {
    id: "city-us-ct-stamford",
    countryCode: "US",
    regionCode: "CT",
    name: "Stamford",
  },
  {
    id: "city-us-ct-hartford",
    countryCode: "US",
    regionCode: "CT",
    name: "Hartford",
  },

  // Delaware (DE)
  {
    id: "city-us-de-wilmington",
    countryCode: "US",
    regionCode: "DE",
    name: "Wilmington",
  },

  // Florida (FL)
  {
    id: "city-us-fl-jacksonville",
    countryCode: "US",
    regionCode: "FL",
    name: "Jacksonville",
  },
  {
    id: "city-us-fl-miami",
    countryCode: "US",
    regionCode: "FL",
    name: "Miami",
  },
  {
    id: "city-us-fl-tampa",
    countryCode: "US",
    regionCode: "FL",
    name: "Tampa",
  },
  {
    id: "city-us-fl-orlando",
    countryCode: "US",
    regionCode: "FL",
    name: "Orlando",
  },
  {
    id: "city-us-fl-st-petersburg",
    countryCode: "US",
    regionCode: "FL",
    name: "St. Petersburg",
  },
  {
    id: "city-us-fl-fort-lauderdale",
    countryCode: "US",
    regionCode: "FL",
    name: "Fort Lauderdale",
  },
  {
    id: "city-us-fl-tallahassee",
    countryCode: "US",
    regionCode: "FL",
    name: "Tallahassee",
  },

  // Georgia (GA)
  {
    id: "city-us-ga-atlanta",
    countryCode: "US",
    regionCode: "GA",
    name: "Atlanta",
  },
  {
    id: "city-us-ga-savannah",
    countryCode: "US",
    regionCode: "GA",
    name: "Savannah",
  },
  {
    id: "city-us-ga-augusta",
    countryCode: "US",
    regionCode: "GA",
    name: "Augusta",
  },

  // Hawaii (HI)
  {
    id: "city-us-hi-honolulu",
    countryCode: "US",
    regionCode: "HI",
    name: "Honolulu",
  },
  {
    id: "city-us-hi-hilo",
    countryCode: "US",
    regionCode: "HI",
    name: "Hilo",
  },

  // Idaho (ID)
  {
    id: "city-us-id-boise",
    countryCode: "US",
    regionCode: "ID",
    name: "Boise",
  },

  // Illinois (IL)
  {
    id: "city-us-il-chicago",
    countryCode: "US",
    regionCode: "IL",
    name: "Chicago",
  },
  {
    id: "city-us-il-aurora",
    countryCode: "US",
    regionCode: "IL",
    name: "Aurora",
  },
  {
    id: "city-us-il-rockford",
    countryCode: "US",
    regionCode: "IL",
    name: "Rockford",
  },
  {
    id: "city-us-il-springfield",
    countryCode: "US",
    regionCode: "IL",
    name: "Springfield",
  },
  {
    id: "city-us-il-naperville",
    countryCode: "US",
    regionCode: "IL",
    name: "Naperville",
  },

  // Indiana (IN)
  {
    id: "city-us-in-indianapolis",
    countryCode: "US",
    regionCode: "IN",
    name: "Indianapolis",
  },
  {
    id: "city-us-in-fort-wayne",
    countryCode: "US",
    regionCode: "IN",
    name: "Fort Wayne",
  },
  {
    id: "city-us-in-evansville",
    countryCode: "US",
    regionCode: "IN",
    name: "Evansville",
  },

  // Iowa (IA)
  {
    id: "city-us-ia-des-moines",
    countryCode: "US",
    regionCode: "IA",
    name: "Des Moines",
  },
  {
    id: "city-us-ia-cedar-rapids",
    countryCode: "US",
    regionCode: "IA",
    name: "Cedar Rapids",
  },

  // Kansas (KS)
  {
    id: "city-us-ks-wichita",
    countryCode: "US",
    regionCode: "KS",
    name: "Wichita",
  },
  {
    id: "city-us-ks-overland-park",
    countryCode: "US",
    regionCode: "KS",
    name: "Overland Park",
  },
  {
    id: "city-us-ks-kansas-city",
    countryCode: "US",
    regionCode: "KS",
    name: "Kansas City",
  },

  // Kentucky (KY)
  {
    id: "city-us-ky-louisville",
    countryCode: "US",
    regionCode: "KY",
    name: "Louisville",
  },
  {
    id: "city-us-ky-lexington",
    countryCode: "US",
    regionCode: "KY",
    name: "Lexington",
  },
  {
    id: "city-us-ky-frankfort",
    countryCode: "US",
    regionCode: "KY",
    name: "Frankfort",
  },

  // Louisiana (LA)
  {
    id: "city-us-la-new-orleans",
    countryCode: "US",
    regionCode: "LA",
    name: "New Orleans",
  },
  {
    id: "city-us-la-baton-rouge",
    countryCode: "US",
    regionCode: "LA",
    name: "Baton Rouge",
  },
  {
    id: "city-us-la-shreveport",
    countryCode: "US",
    regionCode: "LA",
    name: "Shreveport",
  },

  // Maine (ME)
  {
    id: "city-us-me-portland",
    countryCode: "US",
    regionCode: "ME",
    name: "Portland",
  },
  {
    id: "city-us-me-augusta",
    countryCode: "US",
    regionCode: "ME",
    name: "Augusta",
  },

  // Maryland (MD)
  {
    id: "city-us-md-baltimore",
    countryCode: "US",
    regionCode: "MD",
    name: "Baltimore",
  },
  {
    id: "city-us-md-annapolis",
    countryCode: "US",
    regionCode: "MD",
    name: "Annapolis",
  },

  // Massachusetts (MA)
  {
    id: "city-us-ma-boston",
    countryCode: "US",
    regionCode: "MA",
    name: "Boston",
  },
  {
    id: "city-us-ma-worcester",
    countryCode: "US",
    regionCode: "MA",
    name: "Worcester",
  },
  {
    id: "city-us-ma-springfield",
    countryCode: "US",
    regionCode: "MA",
    name: "Springfield",
  },
  {
    id: "city-us-ma-cambridge",
    countryCode: "US",
    regionCode: "MA",
    name: "Cambridge",
  },

  // Michigan (MI)
  {
    id: "city-us-mi-detroit",
    countryCode: "US",
    regionCode: "MI",
    name: "Detroit",
  },
  {
    id: "city-us-mi-grand-rapids",
    countryCode: "US",
    regionCode: "MI",
    name: "Grand Rapids",
  },
  {
    id: "city-us-mi-ann-arbor",
    countryCode: "US",
    regionCode: "MI",
    name: "Ann Arbor",
  },
  {
    id: "city-us-mi-lansing",
    countryCode: "US",
    regionCode: "MI",
    name: "Lansing",
  },

  // Minnesota (MN)
  {
    id: "city-us-mn-minneapolis",
    countryCode: "US",
    regionCode: "MN",
    name: "Minneapolis",
  },
  {
    id: "city-us-mn-st-paul",
    countryCode: "US",
    regionCode: "MN",
    name: "St. Paul",
  },
  {
    id: "city-us-mn-rochester",
    countryCode: "US",
    regionCode: "MN",
    name: "Rochester",
  },

  // Mississippi (MS)
  {
    id: "city-us-ms-jackson",
    countryCode: "US",
    regionCode: "MS",
    name: "Jackson",
  },

  // Missouri (MO)
  {
    id: "city-us-mo-kansas-city",
    countryCode: "US",
    regionCode: "MO",
    name: "Kansas City",
  },
  {
    id: "city-us-mo-st-louis",
    countryCode: "US",
    regionCode: "MO",
    name: "St. Louis",
  },
  {
    id: "city-us-mo-springfield",
    countryCode: "US",
    regionCode: "MO",
    name: "Springfield",
  },
  {
    id: "city-us-mo-columbia",
    countryCode: "US",
    regionCode: "MO",
    name: "Columbia",
  },

  // Montana (MT)
  {
    id: "city-us-mt-billings",
    countryCode: "US",
    regionCode: "MT",
    name: "Billings",
  },
  {
    id: "city-us-mt-helena",
    countryCode: "US",
    regionCode: "MT",
    name: "Helena",
  },

  // Nebraska (NE)
  {
    id: "city-us-ne-omaha",
    countryCode: "US",
    regionCode: "NE",
    name: "Omaha",
  },
  {
    id: "city-us-ne-lincoln",
    countryCode: "US",
    regionCode: "NE",
    name: "Lincoln",
  },

  // Nevada (NV)
  {
    id: "city-us-nv-las-vegas",
    countryCode: "US",
    regionCode: "NV",
    name: "Las Vegas",
  },
  {
    id: "city-us-nv-henderson",
    countryCode: "US",
    regionCode: "NV",
    name: "Henderson",
  },
  {
    id: "city-us-nv-reno",
    countryCode: "US",
    regionCode: "NV",
    name: "Reno",
  },
  {
    id: "city-us-nv-carson-city",
    countryCode: "US",
    regionCode: "NV",
    name: "Carson City",
  },

  // New Hampshire (NH)
  {
    id: "city-us-nh-manchester",
    countryCode: "US",
    regionCode: "NH",
    name: "Manchester",
  },
  {
    id: "city-us-nh-concord",
    countryCode: "US",
    regionCode: "NH",
    name: "Concord",
  },

  // New Jersey (NJ)
  {
    id: "city-us-nj-newark",
    countryCode: "US",
    regionCode: "NJ",
    name: "Newark",
  },
  {
    id: "city-us-nj-jersey-city",
    countryCode: "US",
    regionCode: "NJ",
    name: "Jersey City",
  },
  {
    id: "city-us-nj-paterson",
    countryCode: "US",
    regionCode: "NJ",
    name: "Paterson",
  },
  {
    id: "city-us-nj-trenton",
    countryCode: "US",
    regionCode: "NJ",
    name: "Trenton",
  },

  // New Mexico (NM)
  {
    id: "city-us-nm-albuquerque",
    countryCode: "US",
    regionCode: "NM",
    name: "Albuquerque",
  },
  {
    id: "city-us-nm-santa-fe",
    countryCode: "US",
    regionCode: "NM",
    name: "Santa Fe",
  },

  // New York (NY)
  {
    id: "city-us-ny-new-york",
    countryCode: "US",
    regionCode: "NY",
    name: "New York City",
  },
  {
    id: "city-us-ny-buffalo",
    countryCode: "US",
    regionCode: "NY",
    name: "Buffalo",
  },
  {
    id: "city-us-ny-rochester",
    countryCode: "US",
    regionCode: "NY",
    name: "Rochester",
  },
  {
    id: "city-us-ny-syracuse",
    countryCode: "US",
    regionCode: "NY",
    name: "Syracuse",
  },
  {
    id: "city-us-ny-albany",
    countryCode: "US",
    regionCode: "NY",
    name: "Albany",
  },
  {
    id: "city-us-ny-yonkers",
    countryCode: "US",
    regionCode: "NY",
    name: "Yonkers",
  },

  // North Carolina (NC)
  {
    id: "city-us-nc-charlotte",
    countryCode: "US",
    regionCode: "NC",
    name: "Charlotte",
  },
  {
    id: "city-us-nc-raleigh",
    countryCode: "US",
    regionCode: "NC",
    name: "Raleigh",
  },
  {
    id: "city-us-nc-greensboro",
    countryCode: "US",
    regionCode: "NC",
    name: "Greensboro",
  },
  {
    id: "city-us-nc-durham",
    countryCode: "US",
    regionCode: "NC",
    name: "Durham",
  },
  {
    id: "city-us-nc-wilmington",
    countryCode: "US",
    regionCode: "NC",
    name: "Wilmington",
  },

  // North Dakota (ND)
  {
    id: "city-us-nd-fargo",
    countryCode: "US",
    regionCode: "ND",
    name: "Fargo",
  },
  {
    id: "city-us-nd-bismarck",
    countryCode: "US",
    regionCode: "ND",
    name: "Bismarck",
  },

  // Ohio (OH)
  {
    id: "city-us-oh-columbus",
    countryCode: "US",
    regionCode: "OH",
    name: "Columbus",
  },
  {
    id: "city-us-oh-cleveland",
    countryCode: "US",
    regionCode: "OH",
    name: "Cleveland",
  },
  {
    id: "city-us-oh-cincinnati",
    countryCode: "US",
    regionCode: "OH",
    name: "Cincinnati",
  },
  {
    id: "city-us-oh-toledo",
    countryCode: "US",
    regionCode: "OH",
    name: "Toledo",
  },
  {
    id: "city-us-oh-akron",
    countryCode: "US",
    regionCode: "OH",
    name: "Akron",
  },
  {
    id: "city-us-oh-dayton",
    countryCode: "US",
    regionCode: "OH",
    name: "Dayton",
  },

  // Oklahoma (OK)
  {
    id: "city-us-ok-oklahoma-city",
    countryCode: "US",
    regionCode: "OK",
    name: "Oklahoma City",
  },
  {
    id: "city-us-ok-tulsa",
    countryCode: "US",
    regionCode: "OK",
    name: "Tulsa",
  },

  // Oregon (OR)
  {
    id: "city-us-or-portland",
    countryCode: "US",
    regionCode: "OR",
    name: "Portland",
  },
  {
    id: "city-us-or-eugene",
    countryCode: "US",
    regionCode: "OR",
    name: "Eugene",
  },
  {
    id: "city-us-or-salem",
    countryCode: "US",
    regionCode: "OR",
    name: "Salem",
  },
  {
    id: "city-us-or-bend",
    countryCode: "US",
    regionCode: "OR",
    name: "Bend",
  },

  // Pennsylvania (PA)
  {
    id: "city-us-pa-philadelphia",
    countryCode: "US",
    regionCode: "PA",
    name: "Philadelphia",
  },
  {
    id: "city-us-pa-pittsburgh",
    countryCode: "US",
    regionCode: "PA",
    name: "Pittsburgh",
  },
  {
    id: "city-us-pa-allentown",
    countryCode: "US",
    regionCode: "PA",
    name: "Allentown",
  },
  {
    id: "city-us-pa-harrisburg",
    countryCode: "US",
    regionCode: "PA",
    name: "Harrisburg",
  },

  // Rhode Island (RI)
  {
    id: "city-us-ri-providence",
    countryCode: "US",
    regionCode: "RI",
    name: "Providence",
  },

  // South Carolina (SC)
  {
    id: "city-us-sc-charleston",
    countryCode: "US",
    regionCode: "SC",
    name: "Charleston",
  },
  {
    id: "city-us-sc-columbia",
    countryCode: "US",
    regionCode: "SC",
    name: "Columbia",
  },
  {
    id: "city-us-sc-greenville",
    countryCode: "US",
    regionCode: "SC",
    name: "Greenville",
  },

  // South Dakota (SD)
  {
    id: "city-us-sd-sioux-falls",
    countryCode: "US",
    regionCode: "SD",
    name: "Sioux Falls",
  },
  {
    id: "city-us-sd-pierre",
    countryCode: "US",
    regionCode: "SD",
    name: "Pierre",
  },

  // Tennessee (TN)
  {
    id: "city-us-tn-nashville",
    countryCode: "US",
    regionCode: "TN",
    name: "Nashville",
  },
  {
    id: "city-us-tn-memphis",
    countryCode: "US",
    regionCode: "TN",
    name: "Memphis",
  },
  {
    id: "city-us-tn-knoxville",
    countryCode: "US",
    regionCode: "TN",
    name: "Knoxville",
  },
  {
    id: "city-us-tn-chattanooga",
    countryCode: "US",
    regionCode: "TN",
    name: "Chattanooga",
  },

  // Texas (TX)
  {
    id: "city-us-tx-houston",
    countryCode: "US",
    regionCode: "TX",
    name: "Houston",
  },
  {
    id: "city-us-tx-san-antonio",
    countryCode: "US",
    regionCode: "TX",
    name: "San Antonio",
  },
  {
    id: "city-us-tx-dallas",
    countryCode: "US",
    regionCode: "TX",
    name: "Dallas",
  },
  {
    id: "city-us-tx-austin",
    countryCode: "US",
    regionCode: "TX",
    name: "Austin",
  },
  {
    id: "city-us-tx-fort-worth",
    countryCode: "US",
    regionCode: "TX",
    name: "Fort Worth",
  },
  {
    id: "city-us-tx-el-paso",
    countryCode: "US",
    regionCode: "TX",
    name: "El Paso",
  },
  {
    id: "city-us-tx-arlington",
    countryCode: "US",
    regionCode: "TX",
    name: "Arlington",
  },
  {
    id: "city-us-tx-corpus-christi",
    countryCode: "US",
    regionCode: "TX",
    name: "Corpus Christi",
  },
  {
    id: "city-us-tx-plano",
    countryCode: "US",
    regionCode: "TX",
    name: "Plano",
  },
  {
    id: "city-us-tx-lubbock",
    countryCode: "US",
    regionCode: "TX",
    name: "Lubbock",
  },

  // Utah (UT)
  {
    id: "city-us-ut-salt-lake-city",
    countryCode: "US",
    regionCode: "UT",
    name: "Salt Lake City",
  },
  {
    id: "city-us-ut-provo",
    countryCode: "US",
    regionCode: "UT",
    name: "Provo",
  },
  {
    id: "city-us-ut-west-jordan",
    countryCode: "US",
    regionCode: "UT",
    name: "West Jordan",
  },

  // Vermont (VT)
  {
    id: "city-us-vt-burlington",
    countryCode: "US",
    regionCode: "VT",
    name: "Burlington",
  },
  {
    id: "city-us-vt-montpelier",
    countryCode: "US",
    regionCode: "VT",
    name: "Montpelier",
  },

  // Virginia (VA)
  {
    id: "city-us-va-virginia-beach",
    countryCode: "US",
    regionCode: "VA",
    name: "Virginia Beach",
  },
  {
    id: "city-us-va-norfolk",
    countryCode: "US",
    regionCode: "VA",
    name: "Norfolk",
  },
  {
    id: "city-us-va-richmond",
    countryCode: "US",
    regionCode: "VA",
    name: "Richmond",
  },
  {
    id: "city-us-va-arlington",
    countryCode: "US",
    regionCode: "VA",
    name: "Arlington",
  },
  {
    id: "city-us-va-alexandria",
    countryCode: "US",
    regionCode: "VA",
    name: "Alexandria",
  },

  // Washington (WA)
  {
    id: "city-us-wa-seattle",
    countryCode: "US",
    regionCode: "WA",
    name: "Seattle",
  },
  {
    id: "city-us-wa-spokane",
    countryCode: "US",
    regionCode: "WA",
    name: "Spokane",
  },
  {
    id: "city-us-wa-tacoma",
    countryCode: "US",
    regionCode: "WA",
    name: "Tacoma",
  },
  {
    id: "city-us-wa-vancouver",
    countryCode: "US",
    regionCode: "WA",
    name: "Vancouver",
  },
  {
    id: "city-us-wa-bellevue",
    countryCode: "US",
    regionCode: "WA",
    name: "Bellevue",
  },
  {
    id: "city-us-wa-olympia",
    countryCode: "US",
    regionCode: "WA",
    name: "Olympia",
  },

  // West Virginia (WV)
  {
    id: "city-us-wv-charleston",
    countryCode: "US",
    regionCode: "WV",
    name: "Charleston",
  },
  {
    id: "city-us-wv-morgantown",
    countryCode: "US",
    regionCode: "WV",
    name: "Morgantown",
  },

  // Wisconsin (WI)
  {
    id: "city-us-wi-milwaukee",
    countryCode: "US",
    regionCode: "WI",
    name: "Milwaukee",
  },
  {
    id: "city-us-wi-madison",
    countryCode: "US",
    regionCode: "WI",
    name: "Madison",
  },
  {
    id: "city-us-wi-green-bay",
    countryCode: "US",
    regionCode: "WI",
    name: "Green Bay",
  },

  // Wyoming (WY)
  {
    id: "city-us-wy-cheyenne",
    countryCode: "US",
    regionCode: "WY",
    name: "Cheyenne",
  },
  {
    id: "city-us-wy-casper",
    countryCode: "US",
    regionCode: "WY",
    name: "Casper",
  },

  // District of Columbia
  {
    id: "city-us-dc-washington",
    countryCode: "US",
    regionCode: "DC",
    name: "Washington",
  },

  // ============================================================
  // INDIA
  // ============================================================

  // Andhra Pradesh (AP)
  {
    id: "city-in-ap-visakhapatnam",
    countryCode: "IN",
    regionCode: "AP",
    name: "Visakhapatnam",
  },
  {
    id: "city-in-ap-vijayawada",
    countryCode: "IN",
    regionCode: "AP",
    name: "Vijayawada",
  },
  {
    id: "city-in-ap-guntur",
    countryCode: "IN",
    regionCode: "AP",
    name: "Guntur",
  },
  {
    id: "city-in-ap-nellore",
    countryCode: "IN",
    regionCode: "AP",
    name: "Nellore",
  },
  {
    id: "city-in-ap-tirupati",
    countryCode: "IN",
    regionCode: "AP",
    name: "Tirupati",
  },

  // Arunachal Pradesh (AR)
  {
    id: "city-in-ar-itanagar",
    countryCode: "IN",
    regionCode: "AR",
    name: "Itanagar",
  },

  // Assam (AS)
  {
    id: "city-in-as-guwahati",
    countryCode: "IN",
    regionCode: "AS",
    name: "Guwahati",
  },
  {
    id: "city-in-as-dibrugarh",
    countryCode: "IN",
    regionCode: "AS",
    name: "Dibrugarh",
  },
  {
    id: "city-in-as-silchar",
    countryCode: "IN",
    regionCode: "AS",
    name: "Silchar",
  },

  // Bihar (BR)
  {
    id: "city-in-br-patna",
    countryCode: "IN",
    regionCode: "BR",
    name: "Patna",
  },
  {
    id: "city-in-br-gaya",
    countryCode: "IN",
    regionCode: "BR",
    name: "Gaya",
  },
  {
    id: "city-in-br-muzaffarpur",
    countryCode: "IN",
    regionCode: "BR",
    name: "Muzaffarpur",
  },
  {
    id: "city-in-br-bhagalpur",
    countryCode: "IN",
    regionCode: "BR",
    name: "Bhagalpur",
  },

  // Chhattisgarh (CG)
  {
    id: "city-in-cg-raipur",
    countryCode: "IN",
    regionCode: "CG",
    name: "Raipur",
  },
  {
    id: "city-in-cg-bhilai",
    countryCode: "IN",
    regionCode: "CG",
    name: "Bhilai",
  },
  {
    id: "city-in-cg-bilaspur",
    countryCode: "IN",
    regionCode: "CG",
    name: "Bilaspur",
  },

  // Goa (GA)
  {
    id: "city-in-ga-panaji",
    countryCode: "IN",
    regionCode: "GA",
    name: "Panaji",
  },
  {
    id: "city-in-ga-margao",
    countryCode: "IN",
    regionCode: "GA",
    name: "Margao",
  },

  // Gujarat (GJ)
  {
    id: "city-in-gj-ahmedabad",
    countryCode: "IN",
    regionCode: "GJ",
    name: "Ahmedabad",
  },
  {
    id: "city-in-gj-surat",
    countryCode: "IN",
    regionCode: "GJ",
    name: "Surat",
  },
  {
    id: "city-in-gj-vadodara",
    countryCode: "IN",
    regionCode: "GJ",
    name: "Vadodara",
  },
  {
    id: "city-in-gj-rajkot",
    countryCode: "IN",
    regionCode: "GJ",
    name: "Rajkot",
  },
  {
    id: "city-in-gj-bhavnagar",
    countryCode: "IN",
    regionCode: "GJ",
    name: "Bhavnagar",
  },
  {
    id: "city-in-gj-jamnagar",
    countryCode: "IN",
    regionCode: "GJ",
    name: "Jamnagar",
  },
  {
    id: "city-in-gj-gandhinagar",
    countryCode: "IN",
    regionCode: "GJ",
    name: "Gandhinagar",
  },

  // Haryana (HR)
  {
    id: "city-in-hr-gurugram",
    countryCode: "IN",
    regionCode: "HR",
    name: "Gurugram",
  },
  {
    id: "city-in-hr-faridabad",
    countryCode: "IN",
    regionCode: "HR",
    name: "Faridabad",
  },
  {
    id: "city-in-hr-panipat",
    countryCode: "IN",
    regionCode: "HR",
    name: "Panipat",
  },
  {
    id: "city-in-hr-ambala",
    countryCode: "IN",
    regionCode: "HR",
    name: "Ambala",
  },

  // Himachal Pradesh (HP)
  {
    id: "city-in-hp-shimla",
    countryCode: "IN",
    regionCode: "HP",
    name: "Shimla",
  },
  {
    id: "city-in-hp-dharamshala",
    countryCode: "IN",
    regionCode: "HP",
    name: "Dharamshala",
  },
  {
    id: "city-in-hp-manali",
    countryCode: "IN",
    regionCode: "HP",
    name: "Manali",
  },

  // Jharkhand (JH)
  {
    id: "city-in-jh-ranchi",
    countryCode: "IN",
    regionCode: "JH",
    name: "Ranchi",
  },
  {
    id: "city-in-jh-jamshedpur",
    countryCode: "IN",
    regionCode: "JH",
    name: "Jamshedpur",
  },
  {
    id: "city-in-jh-dhanbad",
    countryCode: "IN",
    regionCode: "JH",
    name: "Dhanbad",
  },
  {
    id: "city-in-jh-bokaro",
    countryCode: "IN",
    regionCode: "JH",
    name: "Bokaro",
  },

  // Karnataka (KA)
  {
    id: "city-in-ka-bengaluru",
    countryCode: "IN",
    regionCode: "KA",
    name: "Bengaluru",
  },
  {
    id: "city-in-ka-mysuru",
    countryCode: "IN",
    regionCode: "KA",
    name: "Mysuru",
  },
  {
    id: "city-in-ka-mangaluru",
    countryCode: "IN",
    regionCode: "KA",
    name: "Mangaluru",
  },
  {
    id: "city-in-ka-hubballi",
    countryCode: "IN",
    regionCode: "KA",
    name: "Hubballi",
  },
  {
    id: "city-in-ka-belgaum",
    countryCode: "IN",
    regionCode: "KA",
    name: "Belagavi",
  },

  // Kerala (KL)
  {
    id: "city-in-kl-thiruvananthapuram",
    countryCode: "IN",
    regionCode: "KL",
    name: "Thiruvananthapuram",
  },
  {
    id: "city-in-kl-kochi",
    countryCode: "IN",
    regionCode: "KL",
    name: "Kochi",
  },
  {
    id: "city-in-kl-kozhikode",
    countryCode: "IN",
    regionCode: "KL",
    name: "Kozhikode",
  },
  {
    id: "city-in-kl-thrissur",
    countryCode: "IN",
    regionCode: "KL",
    name: "Thrissur",
  },
  {
    id: "city-in-kl-kollam",
    countryCode: "IN",
    regionCode: "KL",
    name: "Kollam",
  },

  // Madhya Pradesh (MP)
  {
    id: "city-in-mp-bhopal",
    countryCode: "IN",
    regionCode: "MP",
    name: "Bhopal",
  },
  {
    id: "city-in-mp-indore",
    countryCode: "IN",
    regionCode: "MP",
    name: "Indore",
  },
  {
    id: "city-in-mp-gwalior",
    countryCode: "IN",
    regionCode: "MP",
    name: "Gwalior",
  },
  {
    id: "city-in-mp-jabalpur",
    countryCode: "IN",
    regionCode: "MP",
    name: "Jabalpur",
  },
  {
    id: "city-in-mp-ujjain",
    countryCode: "IN",
    regionCode: "MP",
    name: "Ujjain",
  },

  // Maharashtra (MH)
  {
    id: "city-in-mh-mumbai",
    countryCode: "IN",
    regionCode: "MH",
    name: "Mumbai",
  },
  {
    id: "city-in-mh-pune",
    countryCode: "IN",
    regionCode: "MH",
    name: "Pune",
  },
  {
    id: "city-in-mh-nagpur",
    countryCode: "IN",
    regionCode: "MH",
    name: "Nagpur",
  },
  {
    id: "city-in-mh-nashik",
    countryCode: "IN",
    regionCode: "MH",
    name: "Nashik",
  },
  {
    id: "city-in-mh-thane",
    countryCode: "IN",
    regionCode: "MH",
    name: "Thane",
  },
  {
    id: "city-in-mh-navi-mumbai",
    countryCode: "IN",
    regionCode: "MH",
    name: "Navi Mumbai",
  },
  {
    id: "city-in-mh-aurangabad",
    countryCode: "IN",
    regionCode: "MH",
    name: "Chhatrapati Sambhajinagar",
  },
  {
    id: "city-in-mh-kolhapur",
    countryCode: "IN",
    regionCode: "MH",
    name: "Kolhapur",
  },
  {
    id: "city-in-mh-solapur",
    countryCode: "IN",
    regionCode: "MH",
    name: "Solapur",
  },

  // Manipur (MN)
  {
    id: "city-in-mn-imphal",
    countryCode: "IN",
    regionCode: "MN",
    name: "Imphal",
  },

  // Meghalaya (ML)
  {
    id: "city-in-ml-shillong",
    countryCode: "IN",
    regionCode: "ML",
    name: "Shillong",
  },

  // Mizoram (MZ)
  {
    id: "city-in-mz-aizawl",
    countryCode: "IN",
    regionCode: "MZ",
    name: "Aizawl",
  },

  // Nagaland (NL)
  {
    id: "city-in-nl-kohima",
    countryCode: "IN",
    regionCode: "NL",
    name: "Kohima",
  },
  {
    id: "city-in-nl-dimapur",
    countryCode: "IN",
    regionCode: "NL",
    name: "Dimapur",
  },

  // Odisha (OD)
  {
    id: "city-in-od-bhubaneswar",
    countryCode: "IN",
    regionCode: "OD",
    name: "Bhubaneswar",
  },
  {
    id: "city-in-od-cuttack",
    countryCode: "IN",
    regionCode: "OD",
    name: "Cuttack",
  },
  {
    id: "city-in-od-rourkela",
    countryCode: "IN",
    regionCode: "OD",
    name: "Rourkela",
  },
  {
    id: "city-in-od-puri",
    countryCode: "IN",
    regionCode: "OD",
    name: "Puri",
  },

  // Punjab (PB)
  {
    id: "city-in-pb-amritsar",
    countryCode: "IN",
    regionCode: "PB",
    name: "Amritsar",
  },
  {
    id: "city-in-pb-ludhiana",
    countryCode: "IN",
    regionCode: "PB",
    name: "Ludhiana",
  },
  {
    id: "city-in-pb-jalandhar",
    countryCode: "IN",
    regionCode: "PB",
    name: "Jalandhar",
  },
  {
    id: "city-in-pb-patiala",
    countryCode: "IN",
    regionCode: "PB",
    name: "Patiala",
  },

  // Rajasthan (RJ)
  {
    id: "city-in-rj-jaipur",
    countryCode: "IN",
    regionCode: "RJ",
    name: "Jaipur",
  },
  {
    id: "city-in-rj-jodhpur",
    countryCode: "IN",
    regionCode: "RJ",
    name: "Jodhpur",
  },
  {
    id: "city-in-rj-udaipur",
    countryCode: "IN",
    regionCode: "RJ",
    name: "Udaipur",
  },
  {
    id: "city-in-rj-kota",
    countryCode: "IN",
    regionCode: "RJ",
    name: "Kota",
  },
  {
    id: "city-in-rj-ajmer",
    countryCode: "IN",
    regionCode: "RJ",
    name: "Ajmer",
  },
  {
    id: "city-in-rj-bikaner",
    countryCode: "IN",
    regionCode: "RJ",
    name: "Bikaner",
  },

  // Sikkim (SK)
  {
    id: "city-in-sk-gangtok",
    countryCode: "IN",
    regionCode: "SK",
    name: "Gangtok",
  },

  // Tamil Nadu (TN)
  {
    id: "city-in-tn-chennai",
    countryCode: "IN",
    regionCode: "TN",
    name: "Chennai",
  },
  {
    id: "city-in-tn-coimbatore",
    countryCode: "IN",
    regionCode: "TN",
    name: "Coimbatore",
  },
  {
    id: "city-in-tn-madurai",
    countryCode: "IN",
    regionCode: "TN",
    name: "Madurai",
  },
  {
    id: "city-in-tn-trichy",
    countryCode: "IN",
    regionCode: "TN",
    name: "Tiruchirappalli",
  },
  {
    id: "city-in-tn-salem",
    countryCode: "IN",
    regionCode: "TN",
    name: "Salem",
  },
  {
    id: "city-in-tn-tirunelveli",
    countryCode: "IN",
    regionCode: "TN",
    name: "Tirunelveli",
  },
  {
    id: "city-in-tn-tiruppur",
    countryCode: "IN",
    regionCode: "TN",
    name: "Tiruppur",
  },

  // Telangana (TS)
  {
    id: "city-in-ts-hyderabad",
    countryCode: "IN",
    regionCode: "TS",
    name: "Hyderabad",
  },
  {
    id: "city-in-ts-warangal",
    countryCode: "IN",
    regionCode: "TS",
    name: "Warangal",
  },
  {
    id: "city-in-ts-nizamabad",
    countryCode: "IN",
    regionCode: "TS",
    name: "Nizamabad",
  },

  // Tripura (TR)
  {
    id: "city-in-tr-agartala",
    countryCode: "IN",
    regionCode: "TR",
    name: "Agartala",
  },

  // Uttar Pradesh (UP)
  {
    id: "city-in-up-lucknow",
    countryCode: "IN",
    regionCode: "UP",
    name: "Lucknow",
  },
  {
    id: "city-in-up-kanpur",
    countryCode: "IN",
    regionCode: "UP",
    name: "Kanpur",
  },
  {
    id: "city-in-up-ghaziabad",
    countryCode: "IN",
    regionCode: "UP",
    name: "Ghaziabad",
  },
  {
    id: "city-in-up-agra",
    countryCode: "IN",
    regionCode: "UP",
    name: "Agra",
  },
  {
    id: "city-in-up-varanasi",
    countryCode: "IN",
    regionCode: "UP",
    name: "Varanasi",
  },
  {
    id: "city-in-up-prayagraj",
    countryCode: "IN",
    regionCode: "UP",
    name: "Prayagraj",
  },
  {
    id: "city-in-up-meerut",
    countryCode: "IN",
    regionCode: "UP",
    name: "Meerut",
  },
  {
    id: "city-in-up-noida",
    countryCode: "IN",
    regionCode: "UP",
    name: "Noida",
  },
  {
    id: "city-in-up-bareilly",
    countryCode: "IN",
    regionCode: "UP",
    name: "Bareilly",
  },
  {
    id: "city-in-up-gorakhpur",
    countryCode: "IN",
    regionCode: "UP",
    name: "Gorakhpur",
  },

  // Uttarakhand (UK)
  {
    id: "city-in-uk-dehradun",
    countryCode: "IN",
    regionCode: "UK",
    name: "Dehradun",
  },
  {
    id: "city-in-uk-haridwar",
    countryCode: "IN",
    regionCode: "UK",
    name: "Haridwar",
  },
  {
    id: "city-in-uk-rishikesh",
    countryCode: "IN",
    regionCode: "UK",
    name: "Rishikesh",
  },
  {
    id: "city-in-uk-nainital",
    countryCode: "IN",
    regionCode: "UK",
    name: "Nainital",
  },

  // West Bengal (WB)
  {
    id: "city-in-wb-kolkata",
    countryCode: "IN",
    regionCode: "WB",
    name: "Kolkata",
  },
  {
    id: "city-in-wb-howrah",
    countryCode: "IN",
    regionCode: "WB",
    name: "Howrah",
  },
  {
    id: "city-in-wb-durgapur",
    countryCode: "IN",
    regionCode: "WB",
    name: "Durgapur",
  },
  {
    id: "city-in-wb-asansol",
    countryCode: "IN",
    regionCode: "WB",
    name: "Asansol",
  },
  {
    id: "city-in-wb-siliguri",
    countryCode: "IN",
    regionCode: "WB",
    name: "Siliguri",
  },
  {
    id: "city-in-wb-darjeeling",
    countryCode: "IN",
    regionCode: "WB",
    name: "Darjeeling",
  },

  // Delhi (DL)
  {
    id: "city-in-dl-new-delhi",
    countryCode: "IN",
    regionCode: "DL",
    name: "New Delhi",
  },
  {
    id: "city-in-dl-delhi",
    countryCode: "IN",
    regionCode: "DL",
    name: "Delhi",
  },

  // Jammu and Kashmir (JK)
  {
    id: "city-in-jk-srinagar",
    countryCode: "IN",
    regionCode: "JK",
    name: "Srinagar",
  },
  {
    id: "city-in-jk-jammu",
    countryCode: "IN",
    regionCode: "JK",
    name: "Jammu",
  },

  // Ladakh (LA)
  {
    id: "city-in-la-leh",
    countryCode: "IN",
    regionCode: "LA",
    name: "Leh",
  },

  // Puducherry (PY)
  {
    id: "city-in-py-puducherry",
    countryCode: "IN",
    regionCode: "PY",
    name: "Puducherry",
  },

  // Chandigarh (CH)
  {
    id: "city-in-ch-chandigarh",
    countryCode: "IN",
    regionCode: "CH",
    name: "Chandigarh",
  },
];

/* ------------------------------------------------------------------ *
 * Ordinary reference data
 *
 * Role, Privilege and Status are intentionally NOT present here.
 * Status has its own Status / EntityType / EntityStatus model.
 * ------------------------------------------------------------------ */

export const LANGUAGES: ReferenceDataItem[] = [
  {
    id: "language-en",
    code: "EN",
    name: "English",
    displayOrder: 1,
    active: true,
  },
  {
    id: "language-hi",
    code: "HI",
    name: "Hindi",
    displayOrder: 2,
    active: true,
  },
];

export const STORE_TYPES: ReferenceDataItem[] = [
  {
    id: "store-type-branch",
    code: "BRANCH",
    name: "Branch",
    displayOrder: 1,
    active: true,
  },
  {
    id: "store-type-franchise",
    code: "FRANCHISE",
    name: "Franchise",
    displayOrder: 2,
    active: true,
  },
  {
    id: "store-type-online",
    code: "ONLINE",
    name: "Online",
    displayOrder: 3,
    active: true,
  },
];

export const ORGANIZATION_USER_TYPES: ReferenceDataItem[] = [
  {
    id: "organization-user-type-admin",
    code: "ADMIN",
    name: "Administrator",
    displayOrder: 2,
    active: true,
  },
  {
    id: "organization-user-type-employee",
    code: "EMPLOYEE",
    name: "Employee",
    displayOrder: 3,
    active: true,
  },
  {
    id: "organization-user-type-consultant",
    code: "CONSULTANT",
    name: "Consultant",
    displayOrder: 4,
    active: true,
  },
  {
    id: "organization-user-type-customer",
    code: "CUSTOMER",
    name: "Customer",
    displayOrder: 5,
    active: true,
  },
];

export const PRODUCT_CATEGORIES: ReferenceDataItem[] = [
  {
    id: "product-category-membership",
    code: "MEMBERSHIP",
    name: "Membership",
    displayOrder: 1,
    active: true,
  },
  {
    id: "product-category-loyalty",
    code: "LOYALTY",
    name: "Loyalty",
    displayOrder: 2,
    active: true,
  },
  {
    id: "product-category-subscription",
    code: "SUBSCRIPTION",
    name: "Subscription",
    displayOrder: 3,
    active: true,
  },
];

export const PRODUCT_TYPES: ReferenceDataItem[] = [
  {
    id: "product-type-individual",
    code: "INDIVIDUAL",
    name: "Individual",
    displayOrder: 1,
    active: true,
  },
  {
    id: "product-type-family",
    code: "FAMILY",
    name: "Family",
    displayOrder: 2,
    active: true,
  },
  {
    id: "product-type-corporate",
    code: "CORPORATE",
    name: "Corporate",
    displayOrder: 3,
    active: true,
  },
];

export const BENEFIT_CATEGORIES: ReferenceDataItem[] = [
  {
    id: "benefit-category-discount",
    code: "DISCOUNT",
    name: "Discount",
    displayOrder: 1,
    active: true,
  },
  {
    id: "benefit-category-food",
    code: "FOOD",
    name: "Food & Beverage",
    displayOrder: 2,
    active: true,
  },
  {
    id: "benefit-category-service",
    code: "SERVICE",
    name: "Service",
    displayOrder: 3,
    active: true,
  },
  {
    id: "benefit-category-reward",
    code: "REWARD",
    name: "Reward",
    displayOrder: 4,
    active: true,
  },
];

export const BENEFIT_TYPES: ReferenceDataItem[] = [
  {
    id: "benefit-type-discount",
    code: "DISCOUNT",
    name: "Discount",
    displayOrder: 1,
    active: true,
  },
  {
    id: "benefit-type-freebie",
    code: "FREEBIE",
    name: "Freebie",
    displayOrder: 2,
    active: true,
  },
  {
    id: "benefit-type-reward",
    code: "REWARD",
    name: "Reward",
    displayOrder: 3,
    active: true,
  },
  {
    id: "benefit-type-perk",
    code: "PERK",
    name: "Perk",
    displayOrder: 4,
    active: true,
  },
];

export const CURRENCIES: ReferenceDataItem[] = [
  {
    id: "currency-inr",
    code: "INR",
    name: "Indian Rupee",
    displayOrder: 1,
    active: true,
  },
  {
    id: "currency-usd",
    code: "USD",
    name: "US Dollar",
    displayOrder: 2,
    active: true,
  },
  {
    id: "currency-cad",
    code: "CAD",
    name: "Canadian Dollar",
    displayOrder: 3,
    active: true,
  },
];

export const ORGANIZATION_TYPES: ReferenceDataItem[] = [
  {
    id: "organization-type-coffee",
    code: "COFFEE",
    name: "Coffee Chain",
    displayOrder: 1,
    active: true,
  },
  {
    id: "organization-type-bakery",
    code: "BAKERY",
    name: "Bakery",
    displayOrder: 2,
    active: true,
  },
  {
    id: "organization-type-restaurant",
    code: "RESTAURANT",
    name: "Restaurant",
    displayOrder: 3,
    active: true,
  },
  {
    id: "organization-type-salon",
    code: "SALON",
    name: "Salon",
    displayOrder: 4,
    active: true,
  },
  {
    id: "organization-type-spa",
    code: "SPA",
    name: "Spa",
    displayOrder: 5,
    active: true,
  },
  {
    id: "organization-type-gym",
    code: "GYM",
    name: "Gym",
    displayOrder: 6,
    active: true,
  },
  {
    id: "organization-type-fitness",
    code: "FITNESS",
    name: "Fitness Centre",
    displayOrder: 7,
    active: true,
  },
  {
    id: "organization-type-yoga",
    code: "YOGA",
    name: "Yoga Studio",
    displayOrder: 8,
    active: true,
  },
  {
    id: "organization-type-hotel",
    code: "HOTEL",
    name: "Hotel",
    displayOrder: 9,
    active: true,
  },
  {
    id: "organization-type-resort",
    code: "RESORT",
    name: "Resort",
    displayOrder: 10,
    active: true,
  },
  {
    id: "organization-type-retail",
    code: "RETAIL",
    name: "Retail Store",
    displayOrder: 11,
    active: true,
  },
  {
    id: "organization-type-pharmacy",
    code: "PHARMACY",
    name: "Pharmacy",
    displayOrder: 12,
    active: true,
  },
  {
    id: "organization-type-clinic",
    code: "CLINIC",
    name: "Clinic",
    displayOrder: 13,
    active: true,
  },
  {
    id: "organization-type-hospital",
    code: "HOSPITAL",
    name: "Hospital",
    displayOrder: 14,
    active: true,
  },
  {
    id: "organization-type-cinema",
    code: "CINEMA",
    name: "Cinema",
    displayOrder: 15,
    active: true,
  },
  {
    id: "organization-type-education",
    code: "EDUCATION",
    name: "Educational Institute",
    displayOrder: 16,
    active: true,
  },
  {
    id: "organization-type-park",
    code: "PARK",
    name: "Theme Park",
    displayOrder: 17,
    active: true,
  },
  {
    id: "organization-type-cowork",
    code: "COWORK",
    name: "Coworking Space",
    displayOrder: 18,
    active: true,
  },
  {
    id: "organization-type-service",
    code: "SERVICE",
    name: "Automobile Service Centre",
    displayOrder: 19,
    active: true,
  },
];

export const INTEGRATION_TYPES: ReferenceDataItem[] = [
  {
    id: "integration-type-payment",
    code: "PAYMENT",
    name: "Payment",
    displayOrder: 1,
    active: true,
  },
  {
    id: "integration-type-pos",
    code: "POS",
    name: "Point of Sale",
    displayOrder: 2,
    active: true,
  },
  {
    id: "integration-type-erp",
    code: "ERP",
    name: "Enterprise Resource Planning",
    displayOrder: 3,
    active: true,
  },
  {
    id: "integration-type-crm",
    code: "CRM",
    name: "Customer Relationship Management",
    displayOrder: 4,
    active: true,
  },
  {
    id: "integration-type-accounting",
    code: "ACCOUNTING",
    name: "Accounting",
    displayOrder: 5,
    active: true,
  },
  {
    id: "integration-type-loyalty",
    code: "LOYALTY",
    name: "Loyalty",
    displayOrder: 6,
    active: true,
  },
  {
    id: "integration-type-ecommerce",
    code: "ECOMMERCE",
    name: "E-Commerce",
    displayOrder: 7,
    active: true,
  },
  {
    id: "integration-type-identity",
    code: "IDENTITY",
    name: "Identity Provider",
    displayOrder: 8,
    active: true,
  },
  {
    id: "integration-type-email",
    code: "EMAIL",
    name: "Email Service",
    displayOrder: 9,
    active: true,
  },
  {
    id: "integration-type-sms",
    code: "SMS",
    name: "SMS Service",
    displayOrder: 10,
    active: true,
  },
  {
    id: "integration-type-whatsapp",
    code: "WHATSAPP",
    name: "WhatsApp",
    displayOrder: 11,
    active: true,
  },
  {
    id: "integration-type-push",
    code: "PUSH",
    name: "Push Notification",
    displayOrder: 12,
    active: true,
  },
  {
    id: "integration-type-storage",
    code: "STORAGE",
    name: "File Storage",
    displayOrder: 13,
    active: true,
  },
  {
    id: "integration-type-analytics",
    code: "ANALYTICS",
    name: "Analytics",
    displayOrder: 14,
    active: true,
  },
  {
    id: "integration-type-webhook",
    code: "WEBHOOK",
    name: "Webhook",
    displayOrder: 15,
    active: true,
  },
  {
    id: "integration-type-api",
    code: "API",
    name: "External API",
    displayOrder: 16,
    active: true,
  },
  {
    id: "integration-type-custom",
    code: "CUSTOM",
    name: "Custom",
    displayOrder: 17,
    active: true,
  },
];
