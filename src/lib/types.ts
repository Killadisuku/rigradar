export type LatLng = { lat: number; lng: number };

export type GpsStatus = "off" | "pending" | "live" | "denied";

export type GpsFix = {
  coord: LatLng;
  heading: number;
  speedMph: number;
  accuracyM: number;
  at: number;
};


export type TruckClass = "semi" | "box" | "flatbed" | "tanker" | "reefer";

export type TravelMode = "truck" | "car" | "bus" | "walk";

export type TruckProfile = {
  class: TruckClass;
  heightFt: number;
  weightLbs: number;
  lengthFt: number;
  axles: number;
  hazmat: boolean;
};

export type PlaceKind = "city" | "yard" | "port" | "warehouse";

export type Place = {
  id: string;
  name: string;
  kind: PlaceKind;
  subtitle: string;
  coord: LatLng;
};

export type FacilityType = "truck_stop" | "rest_area" | "weigh_station" | "parking";

export type Amenity =
  | "showers"
  | "food"
  | "scale"
  | "def"
  | "wash"
  | "parking"
  | "wifi"
  | "repair";

export type Facility = {
  id: string;
  name: string;
  subtitle: string;
  type: FacilityType;
  coord: LatLng;
  diesel: number | null;
  def: number | null;
  parking: { open: number; total: number };
  amenities: Amenity[];
  rating: number;
};

export type ReportKind =
  | "police"
  | "crash"
  | "hazard"
  | "construction"
  | "slowdown"
  | "camera"
  | "weather"
  | "closed";

export type Report = {
  id: string;
  kind: ReportKind;
  coord: LatLng;
  note: string;
  votes: number;
  createdAt: number;
  highway: string;
};

export type TrafficLevel = "clear" | "light" | "moderate" | "heavy";

export type TrafficZone = {
  fromMi: number;
  toMi: number;
  level: TrafficLevel;
};

export type TrafficFlow = {
  id: string;
  level: TrafficLevel;
  name: string;
  polyline: LatLng[];
  highway?: string;
};

export type Restriction = {
  atMi: number;
  type: "low_bridge" | "weight" | "hazmat" | "weigh_open" | "grade";
  label: string;
  heightFt?: number;
  avoided?: boolean;
};

export type Instruction = {
  atMi: number;
  primary: string;
  secondary: string;
};

export type Route = {
  id: string;
  fromId: string;
  toId: string;
  polyline: LatLng[];
  distanceMi: number;
  durationMin: number;
  highways: string[];
  restrictions: Restriction[];
  traffic: TrafficZone[];
  instructions: Instruction[];
};

export type Overlay =
  | "none"
  | "search"
  | "report"
  | "layers"
  | "profile"
  | "facility"
  | "hos"
  | "onboard";

export type Layers = {
  stops: boolean;
  rest: boolean;
  scales: boolean;
  reports: boolean;
  traffic: boolean;
  convoy: boolean;
};

export type HosState = {
  driveSec: number;
  breakInSec: number;
  dutySec: number;
  cycleSec: number;
};

export type ConvoyTruck = {
  id: string;
  coord: LatLng;
  heading: number;
  speedMph: number;
};

export type NavState = {
  active: boolean;
  preview: boolean;
  destId: string | null;
  routeId: string | null;
  traveledMi: number;
  speedMph: number;
  follow: boolean;
  arrived: boolean;
};
