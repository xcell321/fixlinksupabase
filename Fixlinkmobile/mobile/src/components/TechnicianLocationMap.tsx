import React from 'react';
import LocationIQMap from './LocationIQMap';

type LatLng = { latitude: number; longitude: number; name?: string; address?: string };

// Technician-only wrapper - isolated from Customer map
// If this crashes, Customer map stays unaffected
export interface TechnicianLocationMapProps {
  technicianCoords?: LatLng | null;
  customerCoords?: LatLng | null;
  jobPins?: Array<{ latitude: number; longitude: number; label?: string }>;
  routeCoordinates?: number[][];
  isAccepted?: boolean;
  style?: any;
}

export default function TechnicianLocationMap(props: TechnicianLocationMapProps): React.JSX.Element {
  return (
    <LocationIQMap
      technicianCoords={props.technicianCoords}
      customerCoords={props.customerCoords}
      jobPins={props.jobPins}
      routeCoordinates={props.routeCoordinates}
      isAccepted={props.isAccepted}
      currentUserRole="technician"
      style={props.style}
    />
  );
}
