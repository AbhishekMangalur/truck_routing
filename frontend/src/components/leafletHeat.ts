
import L from "leaflet";

(window as typeof window & { L: typeof L }).L = L;

import "leaflet.heat";
